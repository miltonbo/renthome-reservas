import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { bookingCommission, bookingCommissionLiability, financialAllocations, reconciliableMovementAmounts, segmentReconciliationStatus } from "@/lib/finance";

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
      property: { select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } },
      reservation: { select: { id: true, name: true, platform: true, checkOut: true, totalPrice: true, priceCurrency: true, guaranteeAmount: true, settledManuallyAt: true, moneyMovements: { select: { id: true, type: true, amountMinor: true, currency: true, occurredAt: true } }, bookingOriginalProperty: { select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } } } },
    },
    orderBy: { occurredAt: "asc" },
  });
  const effectiveAmounts = new Map<number, number>();
  const eligibleReservationIds = new Set<number>();
  const observations: Array<{ reservationId: number; reservationName: string; reason: "active" | "outstanding" }> = [];
  const seenReservations = new Set<number>();
  for (const movement of movements) {
    const reservation = movement.reservation;
    if (seenReservations.has(reservation.id)) continue;
    seenReservations.add(reservation.id);
    const status = segmentReconciliationStatus(reservation);
    const requiresClosure = reservation.platform === "booking" || reservation.platform === "direct";
    const concluded = reservation.checkOut.getTime() < end.getTime();
    const eligible = !requiresClosure || (concluded && status.isSettled);
    if (eligible) eligibleReservationIds.add(reservation.id);
    else observations.push({ reservationId: reservation.id, reservationName: reservation.name, reason: concluded ? "outstanding" : "active" });
    for (const [id, amount] of reconciliableMovementAmounts(reservation)) effectiveAmounts.set(id, amount);
  }
  const eligibleMovements = movements.filter((movement) => eligibleReservationIds.has(movement.reservationId) && (effectiveAmounts.get(movement.id) || 0) !== 0);
  const eligibleBookingSegments = [...new Map(
    eligibleMovements
      .filter((movement) => movement.reservation.platform === "booking")
      .map((movement) => [movement.reservationId, movement]),
  ).values()];
  const commissions = eligibleBookingSegments
    .filter((movement) => (movement.reservation.totalPrice || 0) > 0)
    .map((movement) => {
      const bookingProperty = movement.reservation.bookingOriginalProperty || movement.property;
      return {
        reservationId: movement.reservationId,
        incomeOperator: movement.property.financialOperator as Person,
        liablePerson: bookingCommissionLiability(bookingProperty),
        currency: (movement.reservation.priceCurrency === "USD" ? "USD" : "BOB") as Currency,
        amountMinor: bookingCommission(Math.round((movement.reservation.totalPrice || 0) * 100)),
        reservation: {
          name: movement.reservation.name,
          property: movement.property,
          bookingOriginalProperty: movement.reservation.bookingOriginalProperty,
        },
      };
    });
  const touchedReservationIds = [...new Set(movements.map((movement) => movement.reservationId))];
  const touchedReservations = touchedReservationIds.length ? await prisma.reservation.findMany({
    where: { id: { in: touchedReservationIds } },
    include: { moneyMovements: true },
  }) : [];
  const excess: Record<Currency, number> = { BOB: 0, USD: 0 };
  for (const reservation of touchedReservations) {
    if (!eligibleReservationIds.has(reservation.id)) continue;
    const expected: Record<Currency, number> = { BOB: 0, USD: 0 };
    const paid: Record<Currency, number> = { BOB: 0, USD: 0 };
    const priceCurrency = reservation.priceCurrency as Currency;
    if (currencies.includes(priceCurrency)) expected[priceCurrency] += Math.round((reservation.totalPrice || 0) * 100);
    const effective = reconciliableMovementAmounts(reservation);
    for (const movement of reservation.moneyMovements) {
      const currency = movement.currency as Currency;
      if (currencies.includes(currency)) paid[currency] += effective.get(movement.id) || 0;
    }
    for (const currency of currencies) excess[currency] += Math.max(0, paid[currency] - expected[currency]);
  }

  const blank = () => ({ BOB: 0, USD: 0 });
  const held: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  const entitled: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  const fixedFeePolicies = new Map<number, { financialOperator: string; financialModel: string; managementFeeBps: number; managementFixedFeeMinor: number; managementFixedFeeCurrency: string; managementBeneficiary: string }>();
  for (const movement of eligibleMovements) {
    const currency = movement.currency as Currency;
    if (!currencies.includes(currency)) continue;
    const effectiveAmount = effectiveAmounts.get(movement.id) || 0;
    const allocationPolicy = movement.property;
    const policyAllocations = financialAllocations(effectiveAmount, allocationPolicy);
    if (effectiveAmount > 0 && allocationPolicy.financialModel === "owner_fee") fixedFeePolicies.set(movement.reservationId, allocationPolicy);
    if (movement.paymentMethod === "airbnb") {
      if (movement.property.financialModel === "owner_fee") {
        const receiver: Person = movement.property.managementBeneficiary === "milton" ? "milton" : "deysi";
        held[receiver][currency] += effectiveAmount;
      }
      for (const allocation of policyAllocations) {
        if (movement.property.financialModel !== "owner_fee") held[allocation.person][currency] += allocation.amountMinor;
        entitled[allocation.person][currency] += allocation.amountMinor;
      }
      continue;
    }
    const receiver = movement.receivedBy as Person;
    if (people.includes(receiver)) held[receiver][currency] += effectiveAmount;
    for (const allocation of policyAllocations) entitled[allocation.person][currency] += allocation.amountMinor;
  }

  for (const [, policy] of fixedFeePolicies) {
    const beneficiary: Person = policy.managementBeneficiary === "milton" ? "milton" : "deysi";
    const currency: Currency = policy.managementFixedFeeCurrency === "USD" ? "USD" : "BOB";
    entitled[beneficiary][currency] += policy.managementFixedFeeMinor || 0;
  }

  // Booking commission is reserved first. The remaining income follows the
  // policy of the apartment physically occupied; the operator of the original
  // Booking listing receives the provision used to pay Booking's invoice.
  const commissionReimbursements: Array<{ reservationId: number; reservationName: string; physicalProperty: string; originalProperty: string; from: Person; to: Person; currency: Currency; amountMinor: number }> = [];
  for (const commission of commissions) {
    const currency = commission.currency as Currency;
    const incomeOperator = commission.incomeOperator;
    const liable = commission.liablePerson as Person;
    if (!currencies.includes(currency)) continue;
    for (const allocation of financialAllocations(commission.amountMinor, commission.reservation.property)) {
      entitled[allocation.person][currency] -= allocation.amountMinor;
    }
    if (people.includes(liable)) entitled[liable][currency] += commission.amountMinor;
    if (!people.includes(incomeOperator) || !people.includes(liable) || incomeOperator === liable) continue;
    commissionReimbursements.push({
      reservationId: commission.reservationId,
      reservationName: commission.reservation.name,
      physicalProperty: commission.reservation.property.name,
      originalProperty: commission.reservation.bookingOriginalProperty?.name || commission.reservation.property.name,
      from: incomeOperator,
      to: liable,
      currency,
      amountMinor: commission.amountMinor,
    });
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
  return NextResponse.json({ month, held, entitled, transfers, commissions, commissionReimbursements, movements, excess, observations });
}
