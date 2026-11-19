import "server-only";

import { prisma } from "@/lib/prisma";
import { getOfficialExchangeRate } from "@/lib/bcb-exchange-rate";
import { calculateShadowPrice, combinedPromotionBps } from "@/lib/pricing-engine";
import { eventFamilyKey, getPricingHistoricalCalibration, type EventCalibrationProfile } from "@/lib/pricing-history-calibration";
import {
  getPricingLearningAdjustments,
  persistPricingRecommendations,
  type PricingRecommendationRecord,
} from "@/lib/pricing-feedback";
import {
  DEFAULT_PRICING_STRATEGY,
  normalizePricingKnowledge,
  pricingKnowledgeAdjustmentBps,
  pricingPeerKey,
  type PricingStrategyConfig,
} from "@/lib/pricing-strategy";
import { getPricingStrategyConfig } from "@/lib/pricing-strategy-store";

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return dateKey(value);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T12:00:00.000Z`).getTime() - new Date(`${start}T12:00:00.000Z`).getTime()) / 86_400_000);
}

export function promotionAppliesOnDate(
  promotion: { enabled: boolean; minLeadDays: number | null; maxLeadDays: number | null },
  date: string,
  today: string,
): boolean {
  if (!promotion.enabled) return false;
  const leadDays = daysBetween(today, date);
  if (promotion.minLeadDays != null && leadDays < promotion.minLeadDays) return false;
  if (promotion.maxLeadDays != null && leadDays > promotion.maxLeadDays) return false;
  return true;
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

export const ONE_NIGHT_GAP_CLEANING_PREMIUM_BOB_MINOR = 5_000;

/**
 * A one-night exception is either the single free night between two occupied
 * ranges, or today's last-minute orphan night immediately before a check-in.
 * A lone future night before a booking is deliberately not classified as a
 * gap, preventing the agent from opening arbitrary one-night weekend stays.
 */
export function isOneNightGap(
  date: string,
  today: string,
  ranges: ReadonlyArray<{ start: string; end: string }>,
): boolean {
  const occupied = (candidate: string) => ranges.some((range) => overlaps(candidate, range.start, range.end));
  if (occupied(date)) return false;
  const nextOccupied = occupied(addDays(date, 1));
  if (!nextOccupied) return false;
  return date === today || occupied(addDays(date, -1));
}

function toBobMinor(value: number, currency: string, bobPerUsd: number): number {
  return currency === "USD" ? Math.round(value * bobPerUsd) : value;
}

function toUsdMinor(value: number, currency: string, bobPerUsd: number): number {
  return currency === "USD" ? value : Math.ceil(value / bobPerUsd);
}

function convertMinor(value: number, fromCurrency: string, toCurrency: string, bobPerUsd: number): number {
  if (fromCurrency === toCurrency) return value;
  return toCurrency === "USD" ? Math.ceil(value / bobPerUsd) : Math.ceil(value * bobPerUsd);
}

type MarketImpactEvent = {
  name?: string;
  startsOn: string;
  endsOn: string;
  eventType: string;
  impactBps: number;
  confidenceBps: number;
};

/**
 * A government confirmation and the recurring calendar can describe the same
 * holiday. Holidays/civic dates therefore use the strongest signal instead of
 * stacking. Independent demand generators (for example Expocruz + a concert)
 * do stack, with a safety cap of +100%.
 */
export function marketEventImpactBps(
  events: MarketImpactEvent[],
  date: string,
  channel?: string,
  calibrations: EventCalibrationProfile[] = [],
  strategy: PricingStrategyConfig = DEFAULT_PRICING_STRATEGY,
): number {
  const active = events.filter((event) => date >= event.startsOn && date <= event.endsOn);
  const weighted = (event: MarketImpactEvent) => {
    const calibration = event.name && channel
      ? calibrations.find((profile) => profile.eventKey === eventFamilyKey(event.name || "") && profile.channel === channel && profile.samplePairs >= strategy.minimumHistoricalEventPairs)
      : undefined;
    return calibration ? calibration.upliftBps : Math.round(event.impactBps * event.confidenceBps / 10_000);
  };
  const holidayImpact = active
    .filter((event) => event.eventType === "holiday" || event.eventType === "civic")
    .reduce((maximum, event) => Math.max(maximum, weighted(event)), 0);
  const independentImpact = active
    .filter((event) => event.eventType !== "holiday" && event.eventType !== "civic")
    .reduce((sum, event) => sum + weighted(event), 0);
  return Math.min(strategy.eventImpactCapBps, holidayImpact + independentImpact);
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
  const occupancyLookupStart = addDays(startDate, -1);
  const occupancyLookupEndExclusive = addDays(endExclusive, 1);
  const [policies, promotions, reservations, calendarEvents, marketEvents, exchangeRate, eventCalibrations, properties, strategy, learningAdjustments] = await Promise.all([
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
        checkIn: { lt: new Date(`${occupancyLookupEndExclusive}T00:00:00.000Z`) },
        checkOut: { gt: new Date(`${occupancyLookupStart}T00:00:00.000Z`) },
      },
      select: { propertyId: true, checkIn: true, checkOut: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        propertyId: { in: options.propertyIds },
        platform: { not: "booking" },
        startDate: { lte: addDays(endInclusive, 1) },
        endDate: { gt: occupancyLookupStart },
      },
      select: { propertyId: true, startDate: true, endDate: true },
    }),
    prisma.marketEvent.findMany({
      where: { city: "Santa Cruz de la Sierra", status: { not: "cancelled" }, startsOn: { lte: endInclusive }, endsOn: { gte: startDate } },
      orderBy: { startsOn: "asc" },
    }),
    getOfficialExchangeRate(),
    getPricingHistoricalCalibration(),
    prisma.property.findMany({
      where: { id: { in: options.propertyIds }, isPaused: false },
      select: { id: true, name: true, pricingProfile: true },
    }),
    getPricingStrategyConfig(),
    getPricingLearningAdjustments(options.propertyIds),
  ]);

  const policyPropertyIds = Array.from(new Set(policies.map((policy) => policy.propertyId)));
  const policyMap = new Map<number, typeof policies>();
  const promotionMap = new Map<string, typeof promotions>();
  const knowledgeMap = new Map(properties.map((property) => [
    property.id,
    normalizePricingKnowledge(property.name, property.pricingProfile),
  ]));
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

  const peerGroups = new Map<string, number[]>();
  for (const propertyId of policyPropertyIds) {
    const knowledge = knowledgeMap.get(propertyId);
    const key = knowledge ? pricingPeerKey(knowledge) : "portfolio";
    const rows = peerGroups.get(key) || [];
    rows.push(propertyId);
    peerGroups.set(key, rows);
  }

  const localHour = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));

  let recommendations = 0;
  let needsReview = 0;
  const decisionCandidates: PricingRecommendationRecord[] = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(startDate, offset);
    const occupiedIds = new Set(policyPropertyIds.filter((propertyId) =>
      (occupiedByProperty.get(propertyId) || []).some((range) => overlaps(date, range.start, range.end)),
    ));
    const physicalAvailableRatio = policyPropertyIds.length === 0 ? 0 : (policyPropertyIds.length - occupiedIds.size) / policyPropertyIds.length;
    const channelAvailabilityRatio = (ids: number[], channel: string): number => {
      if (ids.length === 0) return 0;
      if (channel !== "booking") return ids.filter((id) => !occupiedIds.has(id)).length / ids.length;
      let total = 0;
      let available = 0;
      for (const id of ids) {
        const profile = knowledgeMap.get(id);
        const capacity = profile?.bookingFlexibleInventory ? profile.bookingMaxSellableUnits : 1;
        const used = (occupiedByProperty.get(id) || []).filter((range) => overlaps(date, range.start, range.end)).length;
        total += capacity;
        available += Math.max(0, capacity - used);
      }
      return total > 0 ? available / total : 0;
    };
    for (const propertyId of policyPropertyIds) {
      const propertyPolicies = policyMap.get(propertyId) || [];
      const knowledge = knowledgeMap.get(propertyId);
      const peerIds = knowledge ? peerGroups.get(pricingPeerKey(knowledge)) || [] : [];
      const oneNightGap = isOneNightGap(date, calculationToday, occupiedByProperty.get(propertyId) || []);
      const byChannel = new Map(propertyPolicies.map((policy) => [policy.channel, policy]));
      const channelResults = new Map<string, ReturnType<typeof calculateShadowPrice>>();
      for (const policy of propertyPolicies) {
        const availableRatio = policy.channel === "booking"
          ? channelAvailabilityRatio(policyPropertyIds, policy.channel)
          : physicalAvailableRatio;
        const peerAvailableRatio = peerIds.length >= 2
          ? channelAvailabilityRatio(peerIds, policy.channel)
          : null;
        const channelPromotions = (promotionMap.get(`${propertyId}:${policy.channel}`) || [])
          .filter((promotion) => promotionAppliesOnDate(promotion, date, calculationToday));
        const eventImpactBps = marketEventImpactBps(marketEvents, date, policy.channel, eventCalibrations, strategy);
        const knowledgeAdjustment = knowledge
          ? pricingKnowledgeAdjustmentBps(knowledge, policy.channel, strategy)
          : { bps: 0, reasons: [] };
        const learning = learningAdjustments.get(`${propertyId}:${policy.channel}`) || { adjustmentBps: 0, confidenceBps: 0 };
        const learningReasons = learning.adjustmentBps === 0
          ? []
          : [learning.adjustmentBps > 0 ? "desempeño histórico superior al canal" : "ritmo histórico inferior a comparables"];
        const baseFloorBobMinor = toBobMinor(policy.floorMinor, policy.floorCurrency, exchangeRate.bobPerUsd);
        const effectiveFloorBobMinor = baseFloorBobMinor + (oneNightGap ? strategy.oneNightGapPremiumBobMinor : 0);
        const floorInChannelMinor = convertMinor(effectiveFloorBobMinor, "BOB", policy.currency, exchangeRate.bobPerUsd);
        const result = calculateShadowPrice({
          band: { floorMinor: floorInChannelMinor, targetMinor: policy.targetMinor },
          date,
          today: calculationToday,
          availableRatio,
          peerAvailableRatio,
          eventImpactBps,
          propertyAdjustmentBps: knowledgeAdjustment.bps + learning.adjustmentBps,
          propertyReasons: [...knowledgeAdjustment.reasons, ...learningReasons],
          commissionBps: policy.commissionBps,
          requestedPromotionBps: combinedPromotionBps(channelPromotions, policy.channel),
          occupied: occupiedIds.has(propertyId),
          localHour,
          strategy,
        });
        if (oneNightGap) result.reasons.unshift(`hueco de una noche: limpieza + Bs ${strategy.oneNightGapPremiumBobMinor / 100}`);
        channelResults.set(policy.channel, result);
        if (!occupiedIds.has(propertyId)) decisionCandidates.push({
          propertyId, channel: policy.channel, stayDate: date, previousMinor: null,
          recommendedMinor: result.recommendedMinor, currency: policy.currency,
          floorMinor: policy.floorMinor, floorCurrency: policy.floorCurrency,
          promotionBps: result.appliedPromotionBps, commissionBps: policy.commissionBps,
          minNights: oneNightGap ? policy.gapMinNights : policy.defaultMinNights,
          availableRatioBps: Math.round(availableRatio * 10_000), leadDays: daysBetween(calculationToday, date),
          eventImpactBps, learningAdjustmentBps: learning.adjustmentBps,
          reasonSummary: result.reasons.join("; "),
        });
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
      const floorsBob = propertyPolicies.map((policy) =>
        toBobMinor(policy.floorMinor, policy.floorCurrency, exchangeRate.bobPerUsd) +
        (oneNightGap ? strategy.oneNightGapPremiumBobMinor : 0),
      );
      const results = Array.from(channelResults.values());
      const status = occupiedIds.has(propertyId)
        ? "occupied"
        : results.some((result) => result.floorRisk)
          ? "needs_review"
          : "recommended";
      const allReasons = Array.from(new Set(results.flatMap((result) => result.reasons)));
      const priorityReasons = allReasons.filter((reason) =>
        /demanda festiva|feriado o evento|precio futuro protegido|descuento futuro limitado/.test(reason),
      );
      const reasons = [...priorityReasons, ...allReasons.filter((reason) => !priorityReasons.includes(reason))].slice(0, 4);
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

  const storedDecisions = await persistPricingRecommendations(decisionCandidates);

  return {
    properties: policyPropertyIds.length,
    dates: days,
    recommendations,
    needsReview,
    startDate,
    endDate: endInclusive,
    exchangeRate: exchangeRate.bobPerUsd,
    exchangeRateDate: exchangeRate.effectiveDate,
    storedDecisions,
  };
}
