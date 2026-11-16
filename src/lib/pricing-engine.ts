import { BASIS_POINTS, grossMinorForNetFloor, netMinorAfterDeductions, type PricingBand } from "./pricing";
import { DEFAULT_PRICING_STRATEGY, type PricingStrategyConfig } from "./pricing-strategy";

export interface ShadowPricingInput {
  band: PricingBand;
  date: string;
  today: string;
  availableRatio: number;
  peerAvailableRatio?: number | null;
  eventImpactBps: number;
  propertyAdjustmentBps?: number;
  propertyReasons?: string[];
  commissionBps: number;
  requestedPromotionBps: number;
  occupied: boolean;
  localHour?: number;
  strategy?: PricingStrategyConfig;
}

export interface ShadowPricingResult {
  recommendedMinor: number;
  netMinor: number;
  appliedPromotionBps: number;
  adjustmentBps: number;
  floorRisk: boolean;
  status: "recommended" | "occupied" | "needs_review";
  reasons: string[];
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("date must use YYYY-MM-DD");
  return new Date(`${value}T12:00:00.000Z`);
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000);
}

function weekdayAdjustment(date: string, strategy: PricingStrategyConfig): { bps: number; reason: string } {
  const day = parseDate(date).getUTCDay();
  if (day === 1 || day === 2) return { bps: strategy.mondayTuesdayBps, reason: "lunes/martes de menor demanda" };
  if (day === 0) return { bps: strategy.sundayBps, reason: "domingo de menor demanda" };
  if (day === 5 || day === 6) return { bps: strategy.fridaySaturdayBps, reason: "fin de semana" };
  return { bps: 0, reason: "" };
}

function leadTimeAdjustment(leadDays: number, localHour: number, strategy: PricingStrategyConfig): { bps: number; reason: string } {
  if (leadDays <= 0) {
    const bps = localHour >= 17
      ? strategy.sameDayEveningBps
      : localHour >= 12
        ? strategy.sameDayNoonBps
        : strategy.sameDayMorningBps;
    return { bps, reason: localHour >= 17 ? "disponibilidad para hoy al cierre del día" : "disponibilidad para hoy" };
  }
  if (leadDays <= 2) return { bps: strategy.lastMinuteBps, reason: "último minuto" };
  if (leadDays <= 7) return { bps: strategy.nextSevenDaysBps, reason: "próximos 7 días" };
  if (leadDays >= 30 && leadDays <= 90) return { bps: strategy.advanceBookingBps, reason: "reserva anticipada" };
  return { bps: 0, reason: "" };
}

function availabilityAdjustment(availableRatio: number, strategy: PricingStrategyConfig, scope: "portfolio" | "peer" = "portfolio"): { bps: number; reason: string } {
  const label = scope === "peer" ? "de propiedades comparables" : "del portafolio";
  if (availableRatio >= 0.6) return { bps: strategy.highAvailabilityBps, reason: `alta disponibilidad ${label}` };
  if (availableRatio >= 0.4) return { bps: strategy.broadAvailabilityBps, reason: `disponibilidad amplia ${label}` };
  if (availableRatio <= 0.1) return { bps: strategy.scarceAvailabilityBps, reason: `inventario casi agotado ${label}` };
  if (availableRatio <= 0.25) return { bps: strategy.lowAvailabilityBps, reason: `baja disponibilidad ${label}` };
  return { bps: 0, reason: "" };
}

export function calculateShadowPrice(input: ShadowPricingInput): ShadowPricingResult {
  const strategy = input.strategy || DEFAULT_PRICING_STRATEGY;
  const leadDays = daysBetween(input.today, input.date);
  const weekday = weekdayAdjustment(input.date, strategy);
  const lead = leadTimeAdjustment(leadDays, input.localHour ?? 12, strategy);
  const availability = availabilityAdjustment(Math.min(1, Math.max(0, input.availableRatio)), strategy);
  const peerAvailability = input.peerAvailableRatio == null
    ? { bps: 0, reason: "" }
    : availabilityAdjustment(Math.min(1, Math.max(0, input.peerAvailableRatio)), strategy, "peer");
  const weightedPeerBps = Math.round(peerAvailability.bps * strategy.peerAvailabilityWeightBps / BASIS_POINTS);
  const propertyAdjustmentBps = Math.max(-5_000, Math.min(5_000, Math.round(input.propertyAdjustmentBps || 0)));
  const eventImpactBps = Math.max(-5_000, Math.min(strategy.eventImpactCapBps, Math.round(input.eventImpactBps)));
  const adjustmentBps = weekday.bps + lead.bps + availability.bps + weightedPeerBps + propertyAdjustmentBps + eventImpactBps;
  const reasons = [weekday.reason, lead.reason, availability.reason, weightedPeerBps ? peerAvailability.reason : "", ...(input.propertyReasons || [])].filter(Boolean);
  if (eventImpactBps !== 0) reasons.push("feriado o evento de mercado");

  const adjustedTarget = Math.round(input.band.targetMinor * (BASIS_POINTS + adjustmentBps) / BASIS_POINTS);
  const boundedTarget = Math.max(input.band.floorMinor, adjustedTarget);
  const commissionBps = Math.max(0, Math.min(BASIS_POINTS - 1, input.commissionBps));
  const appliedPromotionBps = Math.max(0, Math.min(
    input.requestedPromotionBps,
    BASIS_POINTS - 1,
  ));
  const grossFloor = grossMinorForNetFloor(input.band.floorMinor, [appliedPromotionBps, commissionBps]);
  // The net floor is the only monetary guardrail. Demand can raise the price
  // without an artificial ceiling; discounts and commission can only raise
  // the required gross price, never reduce the protected net.
  const recommendedMinor = Math.max(boundedTarget, grossFloor);
  const netMinor = netMinorAfterDeductions(recommendedMinor, [appliedPromotionBps, commissionBps]);
  const floorRisk = netMinor < input.band.floorMinor;
  if (appliedPromotionBps > 0) reasons.push("promociones y descuentos activos protegidos por piso");

  return {
    recommendedMinor,
    netMinor,
    appliedPromotionBps,
    adjustmentBps,
    floorRisk,
    status: input.occupied ? "occupied" : floorRisk ? "needs_review" : "recommended",
    reasons,
  };
}

export function combinedPromotionBps(
  promotions: ReadonlyArray<{ enabled: boolean; discountBps: number; stackable: boolean; promotionType?: string }>,
  channel?: string,
): number {
  const enabled = promotions.filter((promotion) => promotion.enabled && promotion.discountBps > 0);
  // Airbnb applies one main discount according to platform priority rather
  // than freely stacking the percentages. A non-refundable discount may
  // stack, but it is not yet represented by PromotionPolicy.
  if (channel === "airbnb") {
    const priority: Record<string, number> = { new_listing: 4, custom: 3, weekly: 2, monthly: 2, last_minute: 1 };
    return [...enabled].sort((a, b) =>
      (priority[b.promotionType || ""] || 0) - (priority[a.promotionType || ""] || 0),
    )[0]?.discountBps || 0;
  }
  // Direct weekly/monthly offers describe alternative lengths of stay.
  if (channel === "direct") {
    return enabled.reduce((maximum, promotion) => Math.max(maximum, promotion.discountBps), 0);
  }
  const strongestExclusive = enabled
    .filter((promotion) => !promotion.stackable)
    .reduce((max, promotion) => Math.max(max, promotion.discountBps), 0);
  const deductions = [
    ...enabled.filter((promotion) => promotion.stackable).map((promotion) => promotion.discountBps),
    strongestExclusive,
  ].filter((discount) => discount > 0);
  const retention = deductions.reduce(
    (remaining, discount) => remaining * (BASIS_POINTS - Math.min(discount, BASIS_POINTS - 1)) / BASIS_POINTS,
    1,
  );
  return Math.min(BASIS_POINTS - 1, Math.round((1 - retention) * BASIS_POINTS));
}

/** Three daily shadow-pricing windows in Bolivia time: 08:00, 12:00, 17:00. */
export function pricingRunSlot(date = new Date()): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (![8, 12, 17].includes(hour) || minute > 15) return null;
  return `${value("year")}-${value("month")}-${value("day")}-${String(hour).padStart(2, "0")}`;
}
