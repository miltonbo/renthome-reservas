import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { bookingCommission, bookingCommissionLiability, financialAllocations } from "@/lib/finance";

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
      reservation: { select: { name: true, platform: true, bookingOriginalProperty: { select: { id: true, name: true, financialOperator: true, financialModel: true, managementFeeBps: true, managementFixedFeeMinor: true, managementFixedFeeCurrency: true, managementBeneficiary: true, bookingCommissionPayer: true } } } },
    },
    orderBy: { occurredAt: "asc" },
  });
  const commissions = movements
    .filter((movement) => movement.reservation.platform === "booking" && movement.type === "lodging" && movement.amountMinor > 0)
    .map((movement) => {
      const incomePolicy = movement.reservation.bookingOriginalProperty || movement.property;
      return {
        reservationId: movement.reservationId,
        incomeOperator: incomePolicy.financialOperator as Person,
        liablePerson: bookingCommissionLiability(movement.property),
        currency: movement.currency as Currency,
        amountMinor: bookingCommission(movement.amountMinor),
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
  const fixedFeePolicies = new Map<number, { financialOperator: string; financialModel: string; managementFeeBps: number; managementFixedFeeMinor: number; managementFixedFeeCurrency: string; managementBeneficiary: string }>();
  for (const movement of movements) {
    const currency = movement.currency as Currency;
    if (!currencies.includes(currency)) continue;
    const allocationPolicy = movement.reservation.platform === "booking" && movement.reservation.bookingOriginalProperty
      ? movement.reservation.bookingOriginalProperty
      : movement.property;
    const policyAllocations = financialAllocations(movement.amountMinor, allocationPolicy);
    if (movement.amountMinor > 0 && allocationPolicy.financialModel === "owner_fee") fixedFeePolicies.set(movement.reservationId, allocationPolicy);
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

  for (const [, policy] of fixedFeePolicies) {
    const beneficiary: Person = policy.managementBeneficiary === "milton" ? "milton" : "deysi";
    const currency: Currency = policy.managementFixedFeeCurrency === "USD" ? "USD" : "BOB";
    entitled[beneficiary][currency] += policy.managementFixedFeeMinor || 0;
  }

  // When Booking sold one listing but the guest was physically assigned to
  // another operator's apartment, the operator who received the reservation
  // reimburses the full Booking commission to the operator of the physical
  // listing, who will receive Booking's invoice. Existing rows without an
  // origin retain the old behavior because both properties are the same.
  const commissionReimbursements: Array<{ reservationId: number; reservationName: string; physicalProperty: string; originalProperty: string; from: Person; to: Person; currency: Currency; amountMinor: number }> = [];
  for (const commission of commissions) {
    const currency = commission.currency as Currency;
    const incomeOperator = commission.incomeOperator;
    const liable = commission.liablePerson as Person;
    if (!currencies.includes(currency) || !people.includes(incomeOperator) || !people.includes(liable) || incomeOperator === liable) continue;
    entitled[liable][currency] += commission.amountMinor;
    entitled[incomeOperator][currency] -= commission.amountMinor;
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
  return NextResponse.json({ month, held, entitled, transfers, commissions, commissionReimbursements, movements, excess });
}
