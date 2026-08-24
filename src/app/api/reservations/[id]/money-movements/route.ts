import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageProperty } from "@/lib/ownership";
import {
  airbnbAllocations,
  amountToMinor,
  bookingCommission,
  isCurrency,
  isFinancialPerson,
  isMethodCurrencyValid,
  isPaymentMethod,
} from "@/lib/finance";

const MOVEMENT_TYPES = ["lodging", "parking", "guarantee", "additional", "adjustment"] as const;

async function loadReservation(id: number) {
  return prisma.reservation.findUnique({
    where: { id },
    include: { property: { select: { id: true, financialOperator: true } } },
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
  if (paymentMethod === "airbnb" && (reservation.platform !== "airbnb" || currency !== "USD")) {
    return NextResponse.json({ error: "Airbnb receipts must belong to an Airbnb reservation and use USD" }, { status: 400 });
  }

  const amountMinor = amountToMinor(amount);
  const operator = reservation.property.financialOperator === "deysi" ? "deysi" : "milton";
  const allocations = paymentMethod === "airbnb"
    ? airbnbAllocations(amountMinor, operator)
    : [{ person: operator, amountMinor, percentageBps: 10000 }];

  const result = await prisma.$transaction(async (tx) => {
    // Airbnb has one definitive receipt per imported booking. Editing the
    // amount replaces that receipt and its split instead of duplicating it.
    if (paymentMethod === "airbnb") {
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

  // Booking commission is an external obligation of the property operator.
  // It is based on the registered lodging price and remains separate from
  // transfers between Deysi and Milton.
  if (reservation.platform === "booking" && reservation.totalPrice != null) {
    const basisMinor = amountToMinor(reservation.totalPrice);
    await prisma.bookingCommission.upsert({
      where: { reservationId: id },
      create: {
        reservationId: id, liablePerson: operator, basisMinor,
        amountMinor: bookingCommission(basisMinor), currency: reservation.priceCurrency,
      },
      update: {
        liablePerson: operator, basisMinor,
        amountMinor: bookingCommission(basisMinor), currency: reservation.priceCurrency,
      },
    });
  }
  return NextResponse.json(result, { status: 201 });
}

