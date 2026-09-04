import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageProperty } from "@/lib/ownership";
import {
  financialAllocations,
  amountToMinor,
  isCurrency,
  isFinancialPerson,
  isMethodCurrencyValid,
  isPaymentMethod,
} from "@/lib/finance";

const MOVEMENT_TYPES = ["lodging", "additional"] as const;

async function loadReservation(id: number) {
  return prisma.reservation.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementBeneficiary: true, bookingCommissionPayer: true } },
      bookingOriginalProperty: { select: { id: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } },
    },
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const reservation = await loadReservation(id);
  if (!reservation || !(await canManageProperty(reservation.propertyId, session.userId, session.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const movements = await prisma.moneyMovement.findMany({
    where: { reservationId: id },
    include: { allocations: true },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(movements);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const reservation = await loadReservation(id);
  if (!reservation || !(await canManageProperty(reservation.propertyId, session.userId, session.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await request.json();
  const amount = body.amount;
  const type = body.type;
  const currency = body.currency;
  const paymentMethod = body.paymentMethod;
  const receivedBy = body.receivedBy;
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (
    typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
    !MOVEMENT_TYPES.includes(type) || !isCurrency(currency) || !isPaymentMethod(paymentMethod) ||
    !isMethodCurrencyValid(paymentMethod, currency) || Number.isNaN(occurredAt.getTime()) ||
    (paymentMethod !== "airbnb" && !isFinancialPerson(receivedBy)) ||
    (type === "additional" && !note)
  ) {
    return NextResponse.json({ error: "Invalid money movement" }, { status: 400 });
  }
  if (paymentMethod === "airbnb" && (reservation.platform !== "airbnb" || currency !== "USD" || type !== "lodging")) {
    return NextResponse.json({ error: "Airbnb receipts must be lodging payments for an Airbnb reservation and use USD" }, { status: 400 });
  }

  const amountMinor = amountToMinor(amount);
  const allocationPolicy = reservation.platform === "booking" && reservation.bookingOriginalProperty
    ? reservation.bookingOriginalProperty
    : reservation.property;
  const allocations = financialAllocations(amountMinor, allocationPolicy);

  const result = await prisma.$transaction(async (tx) => {
    // Airbnb has one definitive receipt per imported booking. Editing the
    // amount replaces that receipt and its split instead of duplicating it.
    if (paymentMethod === "airbnb") {
      await tx.reservation.update({
        where: { id },
        data: { totalPrice: amount, priceCurrency: "USD" },
      });
      const existing = await tx.moneyMovement.findFirst({
        where: { reservationId: id, paymentMethod: "airbnb", source: "airbnb", type: "lodging" },
      });
      if (existing) {
        await tx.moneyAllocation.deleteMany({ where: { moneyMovementId: existing.id } });
        return tx.moneyMovement.update({
          where: { id: existing.id },
          data: {
            amountMinor, currency: "USD", occurredAt, note: note || null,
            receivedBy: null,
            allocations: { create: allocations },
          },
          include: { allocations: true },
        });
      }
    }
    const movement = await tx.moneyMovement.create({
      data: {
        reservationId: id,
        propertyId: reservation.propertyId,
        type,
        amountMinor,
        currency,
        paymentMethod,
        receivedBy: paymentMethod === "airbnb" ? null : receivedBy,
        occurredAt,
        note: note || null,
        source: paymentMethod === "airbnb" ? "airbnb" : "manual",
        allocations: { create: allocations },
      },
      include: { allocations: true },
    });
    return movement;
  });

  return NextResponse.json(result, { status: 201 });
}
