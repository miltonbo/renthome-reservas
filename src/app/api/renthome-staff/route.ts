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
    where: { requestedPropertyId: { in: properties.map((property) => property.id) } },
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
  const lead = await prisma.rentHomeRequest.findUnique({ where: { id: body.id } });
  if (!owner || !lead || !(await canManageProperty(lead.requestedPropertyId, session.userId, session.role)) ||
    !(await prisma.property.findFirst({ where: { id: lead.requestedPropertyId, userId: owner }, select: { id: true } }))) {
    return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  }
  const target = body.action === "assign" ? body.propertyId : lead.assignedPropertyId;
  if (body.action !== "discard" && (!Number.isSafeInteger(target) || !target ||
    !(await canManageProperty(target, session.userId, session.role)) ||
    !(await prisma.property.findFirst({ where: { id: target, userId: owner }, select: { id: true } })))) {
    return NextResponse.json({ error: "Selecciona un departamento de RentHome." }, { status: 400 });
  }
  try {
    const reservation = await prisma.$transaction(async (db) => {
      // First write serializes competing confirmations on SQLite. Any
      // conflict below rolls the request back to its previous state.
      const change = await db.rentHomeRequest.updateMany({
        where: { id: lead.id, state: "pending", assignedPropertyId: lead.assignedPropertyId },
        data: body.action === "assign" ? { assignedPropertyId: target } :
          { state: body.action === "confirm" ? "confirmed" : "discarded" },
      });
      if (!change.count) throw new Conflict("La solicitud cambió. Actualiza el panel.");
      if (body.action !== "confirm") return null;

      let query;
      try { query = rentHomeDates(lead); }
      catch (error) { throw new Conflict((error as Error).message); }
      if (!target || !(await rentHomeAvailability(db, target, query))) {
        throw new Conflict("El departamento ya no está disponible para esas fechas. La solicitud sigue pendiente.");
      }
      const listing = await db.rentHomeListing.findUnique({ where: { propertyId: target } });
      if (listing && JSON.parse(listing.detailsJson).capacity < lead.guests) {
        throw new Conflict("El departamento asignado no admite esa cantidad de huéspedes.");
      }
      const created = await db.reservation.create({ data: {
        propertyId: target, name: lead.guestName, phone: lead.phone,
        checkIn: new Date(`${lead.checkIn}T00:00:00Z`), checkOut: new Date(`${lead.checkOut}T00:00:00Z`),
        platform: "direct", status: "confirmed", totalPrice: lead.totalMinor / 100, priceCurrency: "BOB",
        note: `Web RentHome · ${lead.code} · ${lead.guests} huésped(es)`,
      } });
      await db.dateOverride.deleteMany({
        where: { propertyId: target, type: "open", date: { gte: lead.checkIn, lt: lead.checkOut } },
      });
      await db.rentHomeRequest.update({ where: { id: lead.id }, data: { reservationId: created.id } });
      return created;
    });
    if (reservation) {
      await logAudit(session.userId, "create", "reservation", reservation.id, {
        propertyId: reservation.propertyId, source: "renthome-web", code: lead.code,
      }).catch(console.error);
      await recalculatePricingAfterReservation("direct");
    }
    return NextResponse.json({ ok: true, reservationId: reservation?.id });
  } catch (error) {
    if (error instanceof Conflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("RentHome request action failed", error);
    return NextResponse.json({ error: "No se pudo actualizar la solicitud." }, { status: 500 });
  }
}
