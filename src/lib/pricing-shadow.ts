import "server-only";

import { prisma } from "@/lib/prisma";
import { getOfficialExchangeRate } from "@/lib/bcb-exchange-rate";
import { calculateShadowPrice, combinedPromotionBps } from "@/lib/pricing-engine";

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateKey(value);
}

function todayInBolivia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function overlaps(date: string, start: string, endExclusive: string): boolean {
  return date >= start && date < endExclusive;
}

function toBobMinor(value: number, currency: string, bobPerUsd: number): number {
  return currency === "USD" ? Math.round(value * bobPerUsd) : value;
}

function toUsdMinor(value: number, currency: string, bobPerUsd: number): number {
  return currency === "USD" ? value : Math.ceil(value / bobPerUsd);
}

export async function generateShadowPrices(options: {
  propertyIds: number[];
  startDate?: string;
  days?: number;
}) {
  const startDate = options.startDate || todayInBolivia();
  const calculationToday = todayInBolivia();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new RangeError("startDate must use YYYY-MM-DD");
  const days = Math.max(1, Math.min(365, Math.trunc(options.days ?? 90)));
  if (options.propertyIds.length === 0) return { properties: 0, dates: 0, recommendations: 0, needsReview: 0 };

  const endExclusive = addDays(startDate, days);
  const endInclusive = addDays(endExclusive, -1);
  const [policies, promotions, reservations, calendarEvents, marketEvents, exchangeRate] = await Promise.all([
    prisma.pricingPolicy.findMany({
      where: { propertyId: { in: options.propertyIds }, isActive: true },
      orderBy: [{ propertyId: "asc" }, { channel: "asc" }],
    }),
    prisma.promotionPolicy.findMany({
      where: { propertyId: { in: options.propertyIds }, enabled: true },
    }),
    prisma.reservation.findMany({
      where: {
        propertyId: { in: options.propertyIds },
        status: "confirmed",
        checkIn: { lt: new Date(`${endExclusive}T00:00:00.000Z`) },
        checkOut: { gt: new Date(`${startDate}T00:00:00.000Z`) },
      },
      select: { propertyId: true, checkIn: true, checkOut: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        propertyId: { in: options.propertyIds },
        platform: { not: "booking" },
        startDate: { lte: endInclusive },
        endDate: { gt: startDate },
      },
      select: { propertyId: true, startDate: true, endDate: true },
    }),
    prisma.marketEvent.findMany({
      where: { status: { not: "cancelled" }, startsOn: { lte: endInclusive }, endsOn: { gte: startDate } },
      orderBy: { startsOn: "asc" },
    }),
    getOfficialExchangeRate(),
  ]);

  const policyPropertyIds = Array.from(new Set(policies.map((policy) => policy.propertyId)));
  const policyMap = new Map<number, typeof policies>();
  const promotionMap = new Map<string, typeof promotions>();
  for (const policy of policies) {
    const rows = policyMap.get(policy.propertyId) || [];
    rows.push(policy);
    policyMap.set(policy.propertyId, rows);
  }
  for (const promotion of promotions) {
    const key = `${promotion.propertyId}:${promotion.channel}`;
    const rows = promotionMap.get(key) || [];
    rows.push(promotion);
    promotionMap.set(key, rows);
  }

  const occupiedByProperty = new Map<number, Array<{ start: string; end: string }>>();
  for (const reservation of reservations) {
    const rows = occupiedByProperty.get(reservation.propertyId) || [];
    rows.push({ start: dateKey(reservation.checkIn), end: dateKey(reservation.checkOut) });
    occupiedByProperty.set(reservation.propertyId, rows);
  }
  for (const event of calendarEvents) {
    const rows = occupiedByProperty.get(event.propertyId) || [];
    rows.push({ start: event.startDate, end: event.endDate });
    occupiedByProperty.set(event.propertyId, rows);
  }

  let recommendations = 0;
  let needsReview = 0;
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(startDate, offset);
    const occupiedIds = new Set(policyPropertyIds.filter((propertyId) =>
      (occupiedByProperty.get(propertyId) || []).some((range) => overlaps(date, range.start, range.end)),
    ));
    const availableRatio = policyPropertyIds.length === 0 ? 0 : (policyPropertyIds.length - occupiedIds.size) / policyPropertyIds.length;
    const eventImpactBps = marketEvents
      .filter((event) => date >= event.startsOn && date <= event.endsOn)
      .reduce((sum, event) => sum + Math.round(event.impactBps * event.confidenceBps / 10_000), 0);

    for (const propertyId of policyPropertyIds) {
      const propertyPolicies = policyMap.get(propertyId) || [];
      const byChannel = new Map(propertyPolicies.map((policy) => [policy.channel, policy]));
      const channelResults = new Map<string, ReturnType<typeof calculateShadowPrice>>();
      for (const policy of propertyPolicies) {
        const channelPromotions = promotionMap.get(`${propertyId}:${policy.channel}`) || [];
        channelResults.set(policy.channel, calculateShadowPrice({
          band: { floorMinor: policy.floorMinor, targetMinor: policy.targetMinor, ceilingMinor: policy.ceilingMinor },
          date,
          today: calculationToday,
          availableRatio,
          eventImpactBps,
          commissionBps: policy.commissionBps,
          requestedPromotionBps: combinedPromotionBps(channelPromotions),
          maxDiscountBps: policy.maxDiscountBps,
          occupied: occupiedIds.has(propertyId),
        }));
      }

      const directPolicy = byChannel.get("direct");
      const directResult = channelResults.get("direct");
      const airbnbPolicy = byChannel.get("airbnb");
      const airbnbResult = channelResults.get("airbnb");
      const bookingPolicy = byChannel.get("booking");
      const bookingResult = channelResults.get("booking");
      const firstPolicy = propertyPolicies[0];
      const firstResult = channelResults.get(firstPolicy.channel)!;
      const directBobMinor = directPolicy && directResult
        ? toBobMinor(directResult.recommendedMinor, directPolicy.currency, exchangeRate.bobPerUsd)
        : toBobMinor(firstResult.recommendedMinor, firstPolicy.currency, exchangeRate.bobPerUsd);
      const floorsBob = propertyPolicies.map((policy) => toBobMinor(policy.floorMinor, policy.currency, exchangeRate.bobPerUsd));
      const results = Array.from(channelResults.values());
      const status = occupiedIds.has(propertyId)
        ? "occupied"
        : results.some((result) => result.floorRisk)
          ? "needs_review"
          : "recommended";
      const reasons = Array.from(new Set(results.flatMap((result) => result.reasons))).slice(0, 4);
      if (status === "needs_review") needsReview++;

      await prisma.dailyPrice.upsert({
        where: { propertyId_date: { propertyId, date } },
        create: {
          propertyId,
          date,
          directBobMinor,
          airbnbUsdMinor: airbnbPolicy && airbnbResult ? toUsdMinor(airbnbResult.recommendedMinor, airbnbPolicy.currency, exchangeRate.bobPerUsd) : null,
          bookingUsdMinor: bookingPolicy && bookingResult ? toUsdMinor(bookingResult.recommendedMinor, bookingPolicy.currency, exchangeRate.bobPerUsd) : null,
          floorBobMinor: Math.max(...floorsBob),
          status,
          reasonSummary: reasons.join("; "),
          calculatedAt: new Date(),
        },
        update: {
          directBobMinor,
          airbnbUsdMinor: airbnbPolicy && airbnbResult ? toUsdMinor(airbnbResult.recommendedMinor, airbnbPolicy.currency, exchangeRate.bobPerUsd) : null,
          bookingUsdMinor: bookingPolicy && bookingResult ? toUsdMinor(bookingResult.recommendedMinor, bookingPolicy.currency, exchangeRate.bobPerUsd) : null,
          floorBobMinor: Math.max(...floorsBob),
          status,
          reasonSummary: reasons.join("; "),
          calculatedAt: new Date(),
        },
      });
      recommendations++;
    }
  }

  return {
    properties: policyPropertyIds.length,
    dates: days,
    recommendations,
    needsReview,
    startDate,
    endDate: endInclusive,
    exchangeRate: exchangeRate.bobPerUsd,
    exchangeRateDate: exchangeRate.effectiveDate,
  };
}
