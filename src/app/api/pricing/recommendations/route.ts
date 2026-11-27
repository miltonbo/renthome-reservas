import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { generateShadowPrices } from "@/lib/pricing-shadow";
import { refreshPricingHistoricalCalibration } from "@/lib/pricing-history-calibration";
import { getOfficialExchangeRate } from "@/lib/bcb-exchange-rate";
import { getPricingStrategyConfig } from "@/lib/pricing-strategy-store";
import { rentHomeOwner } from "@/lib/renthome";
import { nightlyFloorBobMinor, rentHomeMonthlyFloorBobMinor } from "@/lib/pricing-stay-quote";

function boundedDays(value: unknown, fallback: number): number {
  const parsed = value == null ? fallback : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.trunc(parsed))) : fallback;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const propertyIds = await listAccessiblePropertyIds(session.userId, session.role);
  const start = request.nextUrl.searchParams.get("start") || new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const days = boundedDays(request.nextUrl.searchParams.get("days"), 42);
  const end = new Date(`${start}T12:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + days - 1);
  const rows = await prisma.dailyPrice.findMany({
    where: { propertyId: { in: propertyIds }, date: { gte: start, lte: end.toISOString().slice(0, 10) } },
    orderBy: [{ propertyId: "asc" }, { date: "asc" }],
  });
  if (!rows.length) return NextResponse.json({ prices: rows });
  const ids = [...new Set(rows.map((row) => row.propertyId))];
  const [policies, promotions, exchange, strategy] = await Promise.all([
    prisma.pricingPolicy.findMany({
      where: { propertyId: { in: ids }, isActive: true, channel: { in: ["direct", "airbnb", "booking"] } },
      include: { property: { select: { name: true, userId: true } } },
    }),
    prisma.promotionPolicy.findMany({
      where: { propertyId: { in: ids }, enabled: true },
      select: { propertyId: true, channel: true, promotionType: true, enabled: true, discountBps: true, stackable: true, minNights: true, minLeadDays: true, maxLeadDays: true },
    }),
    getOfficialExchangeRate(),
    getPricingStrategyConfig(),
  ]);
  const rentHomeId = rentHomeOwner();
  const quotePolicies = policies.map((policy) => {
    const isRentHome = policy.property.userId === rentHomeId;
    return {
      propertyId: policy.propertyId,
      channel: policy.channel,
      commissionBps: policy.commissionBps,
      floorBobMinor: nightlyFloorBobMinor(policy, exchange.bobPerUsd, isRentHome),
      monthlyFloorBobMinor: isRentHome ? rentHomeMonthlyFloorBobMinor(policy.property.name) : null,
      promotions: promotions.filter((promotion) => promotion.propertyId === policy.propertyId && promotion.channel === policy.channel),
    };
  });
  const directFloors = new Map(quotePolicies.filter(({ channel }) => channel === "direct").map((policy) => [policy.propertyId, policy.floorBobMinor]));
  return NextResponse.json({
    prices: rows.map((row) => {
      const floor = directFloors.get(row.propertyId);
      if (floor == null || row.directBobMinor == null) return row;
      const gapPremium = row.reasonSummary.includes("hueco de una noche") ? strategy.oneNightGapPremiumBobMinor : 0;
      return { ...row, directBobMinor: Math.max(row.directBobMinor, floor + gapPremium), floorBobMinor: Math.max(row.floorBobMinor, floor + gapPremium) };
    }),
    quoteConfig: {
      policies: quotePolicies,
      bobPerUsd: exchange.bobPerUsd,
      gapPremiumBobMinor: strategy.oneNightGapPremiumBobMinor,
      today: new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const accessible = await listAccessiblePropertyIds(session.userId, session.role);
    const body = await request.json().catch(() => ({}));
    const requested = Array.isArray(body.propertyIds) ? body.propertyIds.map(Number) : accessible;
    const allowed = requested.filter((id: number) => accessible.includes(id));
    await refreshPricingHistoricalCalibration();
    const result = await generateShadowPrices({
      propertyIds: allowed,
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      days: boundedDays(body.days, 90),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron calcular los precios" }, { status: 500 });
  }
}
