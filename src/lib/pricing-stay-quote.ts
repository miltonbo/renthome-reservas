import { combinedPromotionBps } from "./pricing-engine";
import { BASIS_POINTS, discountedMinorWithFloor, grossMinorForNetFloor } from "./pricing";

export const RENTHOME_NIGHTLY_FLOOR_BOB_MINOR = 26_500;
const RENTHOME_MAX_WEEKLY_DISCOUNT_BPS = 800;

// Low-season floors from docs/PRICING-MONTHLY-LOW-SEASON-FLOORS-2026-11-18.md.
const monthlyFloorsBob: Record<string, number> = {
  "Luxe Suites 104": 5550, "Luxe Suites 113": 5150, "Luxe Suites 117": 5700,
  "Luxe Suites 204": 6300, "Luxe Suites 205": 5850, "Luxe Suites 316": 5200, "Luxe Suites 406": 6150,
  "Sky Eclipse 1309": 7500, "Sky Eclipse 1402": 7200, "Sky Eclipse 1409": 6900,
  "Sky Eclipse 1602": 7200, "Sky Eclipse 1709": 7500,
  "Sky Elite 305": 5050, "Sky Elite 329": 5050, "Sky Elite 331": 6300, "Sky Elite 406": 5050,
  "Sky Elite 523": 7150, "Sky Elite 527": 5050, "Sky Elite 528": 5050, "Sky Elite 540": 7150,
  "Sky Luxia 112": 7150, "Sky Moon 706": 7050, "Stanza 8B": 6500,
  "Uptown Nuu 10D": 5950, "Uptown Nuu 12D": 5050,
};

export function rentHomeMonthlyFloorBobMinor(propertyName: string): number | null {
  const floor = monthlyFloorsBob[propertyName];
  return typeof floor === "number" ? floor * 100 : null;
}

export function nightlyFloorBobMinor(policy: { floorMinor: number; floorCurrency: string }, bobPerUsd: number, rentHome: boolean) {
  return Math.max(
    policy.floorCurrency === "USD" ? Math.ceil(policy.floorMinor * bobPerUsd) : policy.floorMinor,
    rentHome ? RENTHOME_NIGHTLY_FLOOR_BOB_MINOR : 0,
  );
}

export type QuotePromotion = {
  promotionType: string;
  enabled: boolean;
  discountBps: number;
  stackable: boolean;
  minNights: number;
  minLeadDays: number | null;
  maxLeadDays: number | null;
};

export type QuotePolicy = {
  propertyId: number;
  channel: string;
  commissionBps: number;
  floorBobMinor: number;
  monthlyFloorBobMinor: number | null;
  isRentHome: boolean;
  promotions: QuotePromotion[];
};

export function isDurationPromotion(promotion: Pick<QuotePromotion, "promotionType" | "minNights">) {
  return promotion.minNights > 1 || promotion.promotionType === "weekly" || promotion.promotionType === "monthly";
}

function weeklyDiscountLimit(nightly: ReadonlyArray<{ reasons: string }>, festive: boolean): number {
  if (festive || nightly.some(({ reasons }) => /baja disponibilidad|inventario casi agotado/.test(reasons))) return 300;
  const wellSuppliedNights = nightly.filter(({ reasons }) => /alta disponibilidad|disponibilidad amplia/.test(reasons)).length;
  return wellSuppliedNights * 2 >= nightly.length ? RENTHOME_MAX_WEEKLY_DISCOUNT_BPS : 600;
}

export function calculateStayQuote(input: {
  policy: QuotePolicy;
  nightly: ReadonlyArray<{ date: string; priceMinor: number; reasons: string }>;
  today: string;
  bobPerUsd: number;
  gapPremiumBobMinor: number;
}) {
  const { policy, nightly, today, bobPerUsd, gapPremiumBobMinor } = input;
  const nights = nightly.length;
  const isDirect = policy.channel === "direct";
  const festive = nightly.some(({ reasons }) => /demanda festiva|feriado o evento/.test(reasons));
  const normalFloor = policy.floorBobMinor * nights;
  const monthlyFloor = policy.monthlyFloorBobMinor;
  const fraction = Math.min(nights / 28, 1);
  const weeklyStay = policy.isRentHome && nights >= 7 && nights < 28;
  const weeklyLimit = weeklyDiscountLimit(nightly, festive);
  let floorBobMinor = normalFloor;
  if (nights === 1 && nightly[0].reasons.includes("hueco de una noche")) {
    floorBobMinor += gapPremiumBobMinor;
  } else if (monthlyFloor != null && nights >= 28) {
    const floor = Math.ceil(monthlyFloor * Math.max(nights - 2, 28) / 28);
    floorBobMinor = festive ? Math.max(normalFloor, floor) : floor;
  } else if (weeklyStay && monthlyFloor != null) {
    const referenceLimit = Math.max(0, 1 - monthlyFloor / (policy.floorBobMinor * 28));
    const floorReductionBps = Math.min(weeklyLimit, Math.floor(referenceLimit * fraction * BASIS_POINTS));
    floorBobMinor = discountedMinorWithFloor(normalFloor, floorReductionBps, 0);
  }

  const leadDays = Math.round((Date.parse(nightly[0].date) - Date.parse(today)) / 86_400_000);
  const eligible = policy.promotions.filter((p) => p.enabled &&
    leadDays >= (p.minLeadDays ?? -Infinity) && leadDays <= (p.maxLeadDays ?? Infinity));
  const ordinary = eligible.filter((p) => !isDurationPromotion(p));
  const duration = eligible.filter((p) => isDurationPromotion(p) &&
    nights >= Math.max(p.minNights, p.promotionType === "monthly" ? 28 : p.promotionType === "weekly" ? 7 : 1));
  const hasMonthly = duration.some((p) => p.promotionType === "monthly");
  const useMonthly = hasMonthly || (isDirect && nights >= 28 && monthlyFloor != null);
  const applicable = (useMonthly ? duration.filter((p) => p.promotionType !== "weekly") : duration)
    .map((promotion) => policy.isRentHome && (weeklyStay || promotion.promotionType === "weekly")
      ? { ...promotion, discountBps: Math.min(promotion.discountBps, weeklyLimit) }
      : promotion);
  const commission = Math.max(0, Math.min(BASIS_POINTS - 1, policy.commissionBps));
  const floorInCurrency = isDirect ? floorBobMinor : Math.ceil(floorBobMinor / bobPerUsd);
  const gross = nightly.reduce((sum, row) => sum + row.priceMinor, 0);
  const baseBps = isDirect ? 0 : combinedPromotionBps(ordinary, policy.channel);
  const baseline = discountedMinorWithFloor(gross, baseBps, 0);
  let requestedBps = combinedPromotionBps(isDirect ? applicable : [...ordinary, ...applicable], policy.channel);
  if (isDirect && applicable.length === 0 && monthlyFloor != null && nights >= 7) {
    const monthlyEquivalent = gross * 28 / nights;
    requestedBps = monthlyEquivalent > 0
      ? Math.floor(Math.max(0, 1 - monthlyFloor / monthlyEquivalent) * fraction * BASIS_POINTS)
      : 0;
  }
  if (festive && isDirect) requestedBps = Math.min(requestedBps, 500);
  const weeklyMinimum = weeklyStay ? discountedMinorWithFloor(baseline, weeklyLimit, 0) : 0;
  const totalMinor = discountedMinorWithFloor(
    gross,
    requestedBps,
    Math.max(weeklyMinimum, grossMinorForNetFloor(floorInCurrency, [commission])),
  );
  return {
    totalMinor,
    floorBobMinor,
    savingsMinor: Math.max(0, baseline - totalMinor),
    durationLimited: nights >= 7 && requestedBps > baseBps && totalMinor >= baseline,
  };
}
