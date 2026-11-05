import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canManageProperty, listAccessiblePropertyIds } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Booking iCal is deliberately treated as an operational inbox, not as
// inventory. The feed exposes dates and a unit, but not a trustworthy payment
// or arrival state. A local Reservation is the confirmation boundary.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = request.nextUrl.searchParams.get("date") || "";
  if (!DATE_KEY.test(date)) {
    return NextResponse.json({ error: "date must use YYYY-MM-DD" }, { status: 400 });
  }

  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const events = await prisma.calendarEvent.findMany({
    where: {
      propertyId: { in: propertyIds },
      platform: "booking",
      startDate: date,
    },
    include: { property: { select: { id: true, name: true } } },
    orderBy: [{ property: { name: "asc" } }, { endDate: "asc" }],
  });

  const possibleMatches = events.length === 0
    ? []
    : await prisma.reservation.findMany({
        where: {
          status: "confirmed",
          platform: "booking",
          OR: events.map((event) => ({
            bookingOriginalPropertyId: event.propertyId,
            checkIn: new Date(`${event.startDate}T00:00:00.000Z`),
            checkOut: new Date(`${event.endDate}T00:00:00.000Z`),
          })),
        },
        select: { id: true, bookingOriginalPropertyId: true, checkIn: true, checkOut: true },
      });

  const matchByRange = new Map(
    possibleMatches.map((reservation) => [
      `${reservation.bookingOriginalPropertyId}:${dateKey(reservation.checkIn)}:${dateKey(reservation.checkOut)}`,
      reservation.id,
    ]),
  );

  return NextResponse.json({
    date,
    alerts: events.map((event) => {
      const reservationId = matchByRange.get(
        `${event.propertyId}:${event.startDate}:${event.endDate}`,
      ) ?? null;
      const manuallyResolved = event.bookingReviewStatus === "resolved";
      return {
        id: event.id,
        uid: event.uid,
        summary: event.summary,
        propertyId: event.property.id,
        propertyName: event.property.name,
        checkIn: event.startDate,
        checkOut: event.endDate,
        status: reservationId || manuallyResolved ? "resolved" : "pending",
        resolution: reservationId ? "reservation" : manuallyResolved ? "manual" : null,
        reservationId,
        reviewedAt: event.bookingReviewedAt,
      };
    }),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const status = body.status;
  if (!Number.isInteger(id) || id <= 0 || !["pending", "resolved"].includes(status)) {
    return NextResponse.json({ error: "Invalid alert update" }, { status: 400 });
  }

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { id: true, propertyId: true, platform: true },
  });
  if (!event || event.platform !== "booking" ||
      !(await canManageProperty(event.propertyId, session.userId, session.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.calendarEvent.update({
    where: { id },
    data: {
      bookingReviewStatus: status,
      bookingReviewedAt: status === "resolved" ? new Date() : null,
    },
  });
  await logAudit(session.userId, "update", "bookingAlert", updated.id, {
    propertyId: event.propertyId,
    status,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.bookingReviewStatus,
    reviewedAt: updated.bookingReviewedAt,
  });
}
