import { BASIS_POINTS, grossMinorForNetFloor, type PricingBand } from "./pricing";

export interface ShadowPricingInput {
  band: PricingBand;
  date: string;
  today: string;
  availableRatio: number;
  eventImpactBps: number;
  commissionBps: number;
  requestedPromotionBps: number;
  maxDiscountBps: number;
  occupied: boolean;
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

function weekdayAdjustment(date: string): { bps: number; reason: string } {
  const day = parseDate(date).getUTCDay();
  if (day === 1 || day === 2) return { bps: -800, reason: "lunes/martes de menor demanda" };
  if (day === 0) return { bps: -400, reason: "domingo de menor demanda" };
  if (day === 5 || day === 6) return { bps: 800, reason: "fin de semana" };
  return { bps: 0, reason: "" };
}

function leadTimeAdjustment(leadDays: number): { bps: number; reason: string } {
  if (leadDays <= 0) return { bps: -1200, reason: "disponibilidad para hoy" };
  if (leadDays <= 2) return { bps: -800, reason: "último minuto" };
  if (leadDays <= 7) return { bps: -400, reason: "próximos 7 días" };
  if (leadDays >= 30 && leadDays <= 90) return { bps: 300, reason: "reserva anticipada" };
  return { bps: 0, reason: "" };
}

function availabilityAdjustment(availableRatio: number): { bps: number; reason: string } {
  if (availableRatio >= 0.6) return { bps: -1000, reason: "alta disponibilidad del portafolio" };
  if (availableRatio >= 0.4) return { bps: -500, reason: "disponibilidad amplia" };
  if (availableRatio <= 0.1) return { bps: 1500, reason: "inventario casi agotado" };
  if (availableRatio <= 0.25) return { bps: 800, reason: "baja disponibilidad" };
  return { bps: 0, reason: "" };
}

export function calculateShadowPrice(input: ShadowPricingInput): ShadowPricingResult {
  const leadDays = daysBetween(input.today, input.date);
  const weekday = weekdayAdjustment(input.date);
  const lead = leadTimeAdjustment(leadDays);
  const availability = availabilityAdjustment(Math.min(1, Math.max(0, input.availableRatio)));
  const eventImpactBps = Math.max(-5_000, Math.min(20_000, Math.round(input.eventImpactBps)));
  const adjustmentBps = weekday.bps + lead.bps + availability.bps + eventImpactBps;
  const reasons = [weekday.reason, lead.reason, availability.reason].filter(Boolean);
  if (eventImpactBps !== 0) reasons.push("feriado o evento de mercado");

  const adjustedTarget = Math.round(input.band.targetMinor * (BASIS_POINTS + adjustmentBps) / BASIS_POINTS);
  const boundedTarget = Math.max(input.band.floorMinor, Math.min(input.band.ceilingMinor, adjustedTarget));
  const commissionBps = Math.max(0, Math.min(BASIS_POINTS - 1, input.commissionBps));
  const appliedPromotionBps = Math.max(0, Math.min(
    input.requestedPromotionBps,
    input.maxDiscountBps,
    BASIS_POINTS - 1 - commissionBps,
  ));
  const grossFloor = grossMinorForNetFloor(input.band.floorMinor, [commissionBps, appliedPromotionBps]);
  // The net floor is the non-negotiable guardrail. If a configured ceiling is
  // incompatible with commission + promotions, surface a review state rather
  // than silently recommending a price that loses money.
  const recommendedMinor = Math.max(boundedTarget, grossFloor);
  const deductionsBps = commissionBps + appliedPromotionBps;
  const netMinor = Math.floor(recommendedMinor * (BASIS_POINTS - deductionsBps) / BASIS_POINTS);
  const floorRisk = recommendedMinor > input.band.ceilingMinor;
  if (floorRisk) reasons.push("el piso neto exige superar el techo configurado");
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
  promotions: ReadonlyArray<{ enabled: boolean; discountBps: number; stackable: boolean }>,
): number {
  const enabled = promotions.filter((promotion) => promotion.enabled && promotion.discountBps > 0);
  const stackable = enabled.filter((promotion) => promotion.stackable).reduce((sum, promotion) => sum + promotion.discountBps, 0);
  const strongestExclusive = enabled
    .filter((promotion) => !promotion.stackable)
    .reduce((max, promotion) => Math.max(max, promotion.discountBps), 0);
  return Math.min(BASIS_POINTS - 1, stackable + strongestExclusive);
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
