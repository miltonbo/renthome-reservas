import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageProperty, listAccessiblePropertyIds } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { rentHomeAvailability, rentHomeDates, rentHomeOwner } from "@/lib/renthome";
import { recalculatePricingAfterReservation } from "@/lib/pricing-reservation-refresh";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session || session.role === "cleaner") return NextResponse.json({ error: "Acceso restringido." }, { status: 403 });
  const owner = rentHomeOwner();
  if (!owner) return NextResponse.json({ configured: false, requests: [], properties: [] });
  const ids = await listAccessiblePropertyIds(session.userId, session.role);
  const properties = await prisma.property.findMany({
    where: { id: { in: ids }, userId: owner },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const requests = await prisma.rentHomeRequest.findMany({
    where: {
      requestedPropertyId: { in: properties.map((property) => property.id) },
      units: { every: { propertyId: { in: properties.map((property) => property.id) } } },
    },
    include: { units: true },
    orderBy: [{ state: "desc" }, { checkIn: "asc" }, { id: "desc" }],
  });
  return NextResponse.json({ configured: true, requests, properties }, { headers: { "Cache-Control": "private, no-store" } });
}

class Conflict extends Error {}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "cleaner") return NextResponse.json({ error: "Acceso restringido." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.id) || !["assign", "confirm", "discard"].includes(body.action)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }
  const owner = rentHomeOwner();
  const lead = await prisma.rentHomeRequest.findUnique({ where: { id: body.id }, include: { units: true } });
  if (!owner || !lead || !(await canManageProperty(lead.requestedPropertyId, session.userId, session.role)) ||
    !(await prisma.property.findFirst({ where: { id: lead.requestedPropertyId, userId: owner }, select: { id: true } }))) {
    return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  }
  const group = lead.units.length > 0;
  if (group) {
    const ids = await listAccessiblePropertyIds(session.userId, session.role);
    const properties = await prisma.property.count({
      where: { id: { in: lead.units.map((unit) => unit.propertyId).filter((id) => ids.includes(id)) }, userId: owner },
    });
    if (properties !== lead.units.length) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
    if (body.action === "assign") return NextResponse.json({ error: "La solicitud grupal ya especifica los departamentos." }, { status: 400 });
  }
  const target = body.action === "assign" ? body.propertyId : lead.assignedPropertyId;
  if (!group && body.action !== "discard" && (!Number.isSafeInteger(target) || !target ||
    !(await canManageProperty(target, session.userId, session.role)) ||
    !(await prisma.property.findFirst({ where: { id: target, userId: owner }, select: { id: true } })))) {
    return NextResponse.json({ error: "Selecciona un departamento de RentHome." }, { status: 400 });
  }
  try {
    const reservations = await prisma.$transaction(async (db) => {
      // First write serializes competing confirmations on SQLite. Any
      // conflict below rolls the request back to its previous state.
      const change = await db.rentHomeRequest.updateMany({
        where: { id: lead.id, state: "pending", assignedPropertyId: lead.assignedPropertyId },
        data: body.action === "assign" ? { assignedPropertyId: target } :
          { state: body.action === "confirm" ? "confirmed" : "discarded" },
      });
      if (!change.count) throw new Conflict("La solicitud cambió. Actualiza el panel.");
      if (body.action !== "confirm") return [];

      let query;
      try { query = rentHomeDates(lead); }
      catch (error) { throw new Conflict((error as Error).message); }
      const units = group ? lead.units : [{ propertyId: target!, guests: lead.guests, totalMinor: lead.totalMinor }];
      const created = [];
      for (const unit of units) {
        if (!(await rentHomeAvailability(db, unit.propertyId, { ...query, guests: unit.guests }))) {
          throw new Conflict("Un departamento ya no está disponible para esas fechas. La solicitud sigue pendiente.");
        }
        const listing = await db.rentHomeListing.findUnique({ where: { propertyId: unit.propertyId } });
        if ((group && !listing?.published) || (listing && JSON.parse(listing.detailsJson).capacity < unit.guests)) {
          throw new Conflict("Un departamento dejó de admitir la distribución solicitada. La solicitud sigue pendiente.");
        }
        const reservation = await db.reservation.create({ data: {
          propertyId: unit.propertyId, name: lead.guestName, phone: lead.phone,
          checkIn: new Date(`${lead.checkIn}T00:00:00Z`), checkOut: new Date(`${lead.checkOut}T00:00:00Z`),
          platform: "direct", status: "confirmed", totalPrice: unit.totalMinor / 100, priceCurrency: "BOB",
          note: `Web RentHome · ${lead.code} · ${unit.guests} huésped(es)`,
        } });
        await db.dateOverride.deleteMany({
          where: { propertyId: unit.propertyId, type: "open", date: { gte: lead.checkIn, lt: lead.checkOut } },
        });
        if (group) await db.rentHomeRequestUnit.update({
          where: { requestId_propertyId: { requestId: lead.id, propertyId: unit.propertyId } },
          data: { reservationId: reservation.id },
        });
        created.push(reservation);
      }
      await db.rentHomeRequest.update({ where: { id: lead.id }, data: { reservationId: created[0].id } });
      return created;
    });
    if (reservations.length) {
      await Promise.all(reservations.map((reservation) => logAudit(session.userId, "create", "reservation", reservation.id, {
        propertyId: reservation.propertyId, source: "renthome-web", code: lead.code,
      }).catch(console.error)));
      await recalculatePricingAfterReservation("direct").catch(console.error);
    }
    return NextResponse.json({ ok: true, reservationId: reservations[0]?.id });
  } catch (error) {
    if (error instanceof Conflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("RentHome request action failed", error);
    return NextResponse.json({ error: "No se pudo actualizar la solicitud." }, { status: 500 });
  }
}
