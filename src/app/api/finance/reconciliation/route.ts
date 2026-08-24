import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAccessiblePropertyIds } from "@/lib/ownership";

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
      property: { select: { name: true, financialOperator: true } },
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

  const blank = () => ({ BOB: 0, USD: 0 });
  const held: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  const entitled: Record<Person, Record<Currency, number>> = { deysi: blank(), milton: blank() };
  for (const movement of movements) {
    const currency = movement.currency as Currency;
    if (!currencies.includes(currency)) continue;
    if (movement.paymentMethod === "airbnb") {
      for (const allocation of movement.allocations) {
        const person = allocation.person as Person;
        if (!people.includes(person)) continue;
        held[person][currency] += allocation.amountMinor;
        entitled[person][currency] += allocation.amountMinor;
      }
      continue;
    }
    const receiver = movement.receivedBy as Person;
    if (people.includes(receiver)) held[receiver][currency] += movement.amountMinor;
    for (const allocation of movement.allocations) {
      const person = allocation.person as Person;
      if (people.includes(person)) entitled[person][currency] += allocation.amountMinor;
    }
  }

  const transfers = currencies.flatMap((currency) => {
    const miltonExcess = held.milton[currency] - entitled.milton[currency];
    if (miltonExcess > 0) return [{ from: "milton", to: "deysi", currency, amountMinor: miltonExcess }];
    if (miltonExcess < 0) return [{ from: "deysi", to: "milton", currency, amountMinor: -miltonExcess }];
    return [];
  });
  return NextResponse.json({ month, held, entitled, transfers, commissions, movements });
}
