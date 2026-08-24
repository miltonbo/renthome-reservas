import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { financialAllocations } from "@/lib/finance";

type Person = "deysi" | "milton";
type Currency = "BOB" | "USD";
const people: Person[] = ["deysi", "milton"];
const currencies: Currency[] = ["BOB", "USD"];

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const month = request.nextUrl.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const movements = await prisma.moneyMovement.findMany({
    where: { propertyId: { in: propertyIds }, occurredAt: { gte: start, lt: end } },
    include: {
      allocations: true,
      property: { select: { name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true } },
      reservation: { select: { name: true, platform: true } },
    },
    orderBy: { occurredAt: "asc" },
  });
  const commissions = await prisma.bookingCommission.findMany({
    where: {
      reservation: {
        propertyId: { in: propertyIds },
        checkIn: { lt: end }, checkOut: { gte: start }, status: "confirmed",
      },
    },
    include: { reservation: { include: { property: { select: { name: true } } } } },
  });
  const touchedReservationIds = [...new Set(movements.map((movement) => movement.reservationId))];
  const touchedReservations = touchedReservationIds.length ? await prisma.reservation.findMany({
    where: { id: { in: touchedReservationIds } },
    include: { moneyMovements: true },
  }) : [];
  const excess: Record<Currency, number> = { BOB: 0, USD: 0 };
  for (const reservation of touchedReservations) {
    const expected: Record<Currency, number> = { BOB: 0, USD: 0 };
    const paid: Record<Currency, number> = { BOB: 0, USD: 0 };
    const priceCurrency = reservation.priceCurrency as Currency;
    const parkingCurrency = reservation.parkingCurrency as Currency;
    const guaranteeCurrency = reservation.guaranteeCurrency as Currency;
    if (currencies.includes(priceCurrency)) expected[priceCurrency] += Math.round((reservation.totalPrice || 0) * 100);
    if (currencies.includes(parkingCurrency)) expected[parkingCurrency] += Math.round((reservation.parkingTotalPrice || 0) * 100);
    if (currencies.includes(guaranteeCurrency)) expected[guaranteeCurrency] += Math.round((reservation.guaranteeAmount || 0) * 100);
    for (const movement of reservation.moneyMovements) {
      const currency = movement.currency as Currency;
      if (currencies.includes(currency) && ["lodging", "parking", "guarantee", "refund"].includes(movement.type)) paid[currency] += movement.amountMinor;
    }
    for (const currency of currencies) excess[currency] += Math.max(0, paid[currency] - expected[currency]);
  }

  const blank = () => ({ BOB: 0, USD: 0 });
  const held: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  const entitled: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  const fixedFeeReservations = new Set<number>();
  for (const movement of movements) {
    const currency = movement.currency as Currency;
    if (!currencies.includes(currency)) continue;
    const policyAllocations = financialAllocations(movement.amountMinor, movement.property);
    if (movement.amountMinor > 0 && movement.property.financialModel === "owner_fee") fixedFeeReservations.add(movement.reservationId);
    if (movement.paymentMethod === "airbnb") {
      if (movement.property.financialModel === "owner_fee") {
        const receiver: Person = movement.property.managementBeneficiary === "milton" ? "milton" : "deysi";
        held[receiver][currency] += movement.amountMinor;
      }
      for (const allocation of policyAllocations) {
        if (movement.property.financialModel !== "owner_fee") held[allocation.person][currency] += allocation.amountMinor;
        entitled[allocation.person][currency] += allocation.amountMinor;
      }
      continue;
    }
    const receiver = movement.receivedBy as Person;
    if (people.includes(receiver)) held[receiver][currency] += movement.amountMinor;
    for (const allocation of policyAllocations) entitled[allocation.person][currency] += allocation.amountMinor;
  }

  for (const reservationId of fixedFeeReservations) {
    const movement = movements.find((item) => item.reservationId === reservationId);
    if (!movement) continue;
    const beneficiary: Person = movement.property.managementBeneficiary === "milton" ? "milton" : "deysi";
    const currency: Currency = movement.property.managementFixedFeeCurrency === "USD" ? "USD" : "BOB";
    entitled[beneficiary][currency] += movement.property.managementFixedFeeMinor || 0;
  }

  const transfers: Array<{ from: Person | "owner"; to: Person | "owner"; currency: Currency; amountMinor: number }> = [];
  for (const currency of currencies) {
    let deysiBalance = held.deysi[currency] - entitled.deysi[currency];
    let miltonBalance = held.milton[currency] - entitled.milton[currency];
    if (deysiBalance > 0 && miltonBalance < 0) { const amount = Math.min(deysiBalance, -miltonBalance); transfers.push({ from: "deysi", to: "milton", currency, amountMinor: amount }); deysiBalance -= amount; miltonBalance += amount; }
    if (miltonBalance > 0 && deysiBalance < 0) { const amount = Math.min(miltonBalance, -deysiBalance); transfers.push({ from: "milton", to: "deysi", currency, amountMinor: amount }); miltonBalance -= amount; deysiBalance += amount; }
    if (deysiBalance > 0) transfers.push({ from: "deysi", to: "owner", currency, amountMinor: deysiBalance });
    if (miltonBalance > 0) transfers.push({ from: "milton", to: "owner", currency, amountMinor: miltonBalance });
    if (deysiBalance < 0) transfers.push({ from: "owner", to: "deysi", currency, amountMinor: -deysiBalance });
    if (miltonBalance < 0) transfers.push({ from: "owner", to: "milton", currency, amountMinor: -miltonBalance });
  }
  return NextResponse.json({ month, held, entitled, transfers, commissions, movements, excess });
}
