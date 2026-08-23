import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canManageProperty } from "@/lib/ownership";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const reservationId = Number(id);
    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, propertyId: true, extensionOfId: true, status: true },
    });
    if (!reservation || !(await canManageProperty(reservation.propertyId, session.userId, session.role))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (reservation.status === "cancelled") {
      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    const body = await request.json().catch(() => ({}));
    if (body.reason !== undefined && body.reason !== null && typeof body.reason !== "string") {
      return NextResponse.json({ error: "Invalid cancellation reason" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    const cancelledAt = new Date();
    const affected = reservation.extensionOfId
      ? { id: reservation.id }
      : { OR: [{ id: reservation.id }, { extensionOfId: reservation.id }] };

    const result = await prisma.reservation.updateMany({
      where: { ...affected, status: "confirmed" },
      data: {
        status: "cancelled",
        cancellationReason: reason || null,
        cancelledAt,
      },
    });
    await logAudit(session.userId, "update", "reservation", reservationId, {
      status: "cancelled",
      reason: reason || null,
      affectedReservations: result.count,
    });
    return NextResponse.json({ success: true, affectedReservations: result.count });
  } catch (error) {
    console.error("Cancel reservation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
