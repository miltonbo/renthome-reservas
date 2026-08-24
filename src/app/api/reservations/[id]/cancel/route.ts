import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canManageProperty } from "@/lib/ownership";
import { amountToMinor, financialAllocations, isCurrency, isFinancialPerson, isMethodCurrencyValid, isPaymentMethod } from "@/lib/finance";

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
      select: { id: true, propertyId: true, extensionOfId: true, status: true, property: { select: { financialOperator: true, financialModel: true, managementFeeBps: true, managementBeneficiary: true } } },
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
    const refunds = Array.isArray(body.refunds) ? body.refunds : [];
    if (refunds.length > 2 || refunds.some((refund: Record<string, unknown>) =>
      typeof refund.amount !== "number" || refund.amount <= 0 || !isCurrency(refund.currency) ||
      !isPaymentMethod(refund.paymentMethod) || !isMethodCurrencyValid(refund.paymentMethod, refund.currency) ||
      !isFinancialPerson(refund.paidBy)
    )) {
      return NextResponse.json({ error: "Invalid refund" }, { status: 400 });
    }
    const cancelledAt = new Date();
    const affected = reservation.extensionOfId
      ? { id: reservation.id }
      : { OR: [{ id: reservation.id }, { extensionOfId: reservation.id }] };

    if (refunds.length > 0) {
      const familyWhere = reservation.extensionOfId
        ? { id: reservation.id }
        : { OR: [{ id: reservation.id }, { extensionOfId: reservation.id }] };
      const family = await prisma.reservation.findMany({ where: familyWhere, select: { id: true } });
      const movements = await prisma.moneyMovement.findMany({ where: { reservationId: { in: family.map((item) => item.id) } } });
      for (const currency of ["BOB", "USD"] as const) {
        const receivedMinor = movements.filter((item) => item.currency === currency).reduce((sum, item) => sum + item.amountMinor, 0);
        const requestedMinor = refunds.filter((item: { currency: string }) => item.currency === currency).reduce((sum: number, item: { amount: number }) => sum + amountToMinor(item.amount), 0);
        if (requestedMinor > receivedMinor) {
          return NextResponse.json({ error: `El reembolso en ${currency === "BOB" ? "Bs" : "USD"} supera el dinero recibido.` }, { status: 400 });
        }
      }
    }

    const cancellationData = {
      where: { ...affected, status: "confirmed" },
      data: { status: "cancelled", cancellationReason: reason || null, cancelledAt },
    } as const;
    let result: { count: number };
    if (refunds.length === 0) {
      result = await prisma.reservation.updateMany(cancellationData);
    } else {
      result = await prisma.$transaction(async (tx) => {
        const updated = await tx.reservation.updateMany(cancellationData);
        for (const refund of refunds as Array<{ amount: number; currency: "BOB" | "USD"; paymentMethod: string; paidBy: "deysi" | "milton" }>) {
          const amountMinor = -amountToMinor(refund.amount);
          await tx.moneyMovement.create({
        data: {
          reservationId: reservation.id,
          propertyId: reservation.propertyId,
          type: "refund",
          amountMinor,
          currency: refund.currency,
          paymentMethod: refund.paymentMethod,
          receivedBy: refund.paidBy,
          occurredAt: cancelledAt,
          note: reason ? `Reembolso por cancelación: ${reason}` : "Reembolso por cancelación",
          source: "manual",
          allocations: { create: financialAllocations(amountMinor, reservation.property) },
        },
          });
        }
        return updated;
      });
    }
    await logAudit(session.userId, "update", "reservation", reservationId, {
      status: "cancelled",
      reason: reason || null,
      affectedReservations: result.count,
      refunds: refunds.map((refund: { amount: number; currency: string; paidBy: string }) => ({ amount: refund.amount, currency: refund.currency, paidBy: refund.paidBy })),
    });
    return NextResponse.json({ success: true, affectedReservations: result.count });
  } catch (error) {
    console.error("Cancel reservation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
