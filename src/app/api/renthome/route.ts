import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rentHomeCatalog, rentHomeDates } from "@/lib/renthome";
import { checkRateLimit } from "@/lib/rate-limit";
import { boliviaDateString } from "@/lib/messaging-availability";

class RequestConflict extends Error {
  constructor(readonly code: "duplicate_request" | "active_request", message: string) {
    super(message);
  }
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\s().-]/g, "");
  if (!/^\+?\d{8,17}$/.test(clean)) return null;
  const digits = clean.replace(/^(?:\+|00)/, "");
  const international = /^\d{8}$/.test(clean) && !clean.startsWith("00") ? `591${digits}` : digits;
  return /^[1-9]\d{7,14}$/.test(international) ? `+${international}` : null;
}

function phoneVariants(phone: string) {
  const digits = phone.slice(1);
  const local = /^591\d{8}$/.test(digits) ? digits.slice(3) : null;
  return [phone, digits, `00${digits}`, ...(local ? [local] : [])];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let query;
  try {
    if (params.has("checkIn") || params.has("checkOut")) {
      query = rentHomeDates({ checkIn: params.get("checkIn"), checkOut: params.get("checkOut"), guests: params.get("guests") });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  return NextResponse.json({ listings: await rentHomeCatalog(query) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(`renthome-request:${ip}`, 12, 3600).ok) {
    return NextResponse.json({ error: "Intenta nuevamente más tarde." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const guestName = typeof body?.guestName === "string" ? body.guestName.trim() : "";
  const phone = normalizePhone(body?.phone);
  if (!body || !Number.isSafeInteger(body.propertyId) || !Number.isSafeInteger(body.totalMinor) ||
    guestName.length < 2 || guestName.length > 120 || !phone) {
    return NextResponse.json({ error: "Revisa tu nombre y tu número de WhatsApp." }, { status: 400 });
  }
  let query;
  try { query = rentHomeDates(body); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const option = (await rentHomeCatalog(query)).find((item) => item.id === body.propertyId);
  if (!option || option.totalMinor === null || option.totalMinor !== body.totalMinor) {
    return NextResponse.json({ error: "La disponibilidad o el precio cambió. Vuelve a buscar para revisar la cotización." }, { status: 409 });
  }
  const code = `RH-${randomBytes(6).toString("hex").toUpperCase()}`;
  const totalMinor = option.totalMinor;
  const today = boliviaDateString();
  try {
    await prisma.$transaction(async (db) => {
      // Acquire the SQLite write lock before checking for competing submissions.
      const created = await db.rentHomeRequest.create({ data: {
        code, requestedPropertyId: option.id, checkIn: query.checkIn, checkOut: query.checkOut,
        guests: query.guests!, guestName, phone, totalMinor,
      }, select: { id: true } });
      const existing = await db.rentHomeRequest.findMany({
        where: {
          id: { not: created.id },
          phone: { in: phoneVariants(phone) },
          OR: [{ state: "pending", checkOut: { gt: today } }, { state: "confirmed", reservationId: { not: null } }],
        },
        select: { state: true, reservationId: true, requestedPropertyId: true, checkIn: true, checkOut: true },
      });
      const pending = existing.filter((item) => item.state === "pending");
      if (pending.some((item) => item.requestedPropertyId === option.id && item.checkIn === query.checkIn && item.checkOut === query.checkOut)) {
        throw new RequestConflict("duplicate_request", "Ya hay una solicitud pendiente con este WhatsApp para el mismo alojamiento y fechas.");
      }
      if (body.confirmAnother === true) return;
      const confirmedIds = existing.flatMap((item) => item.state === "confirmed" && item.reservationId !== null ? [item.reservationId] : []);
      const active = pending.length > 0 || (confirmedIds.length > 0 && await db.reservation.findFirst({
        where: { id: { in: confirmedIds }, status: "confirmed", checkOut: { gt: new Date(`${today}T00:00:00Z`) } },
        select: { id: true },
      }));
      if (active) throw new RequestConflict("active_request", "Ya hay una solicitud o reserva vigente con este número de WhatsApp. ¿Quieres enviar otra?");
    });
  } catch (error) {
    if (error instanceof RequestConflict) return NextResponse.json({ code: error.code, error: error.message }, { status: 409 });
    console.error("RentHome request creation failed", error);
    return NextResponse.json({ error: "No se pudo registrar la solicitud. Intenta nuevamente." }, { status: 500 });
  }
  const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  const message = `Hola, quiero confirmar mi reserva ${code}. Mi fecha de ingreso es el ${shortDate(query.checkIn)} y mi fecha de salida es el ${shortDate(query.checkOut)}.`;
  return NextResponse.json({ code, whatsapp: `https://wa.me/59177175497?text=${encodeURIComponent(message)}` }, { status: 201 });
}
