export const PRICING_STRATEGY_SETTINGS_KEY = "pricing_strategy_v1";

export type HistoryStrength = "unknown" | "new" | "growing" | "established";
export type ProfileAttribute = "unknown" | "none" | "limited" | "standard" | "premium";

export type PropertyPricingKnowledge = {
  building: string;
  segment: "value" | "standard" | "premium";
  balcony: ProfileAttribute;
  viewQuality: ProfileAttribute;
  airbnbHistoryStrength: HistoryStrength;
  bookingHistoryStrength: HistoryStrength;
  airbnbReviewCount: number;
  bookingReviewCount: number;
  airbnbRatingHundredths: number;
  bookingRatingHundredths: number;
  sellThroughAdjustmentBps: number;
  interchangeableGroup: string | null;
  bookingFlexibleInventory: boolean;
  bookingMaxSellableUnits: number;
  notes: string;
};
type RawPricingKnowledge = { [K in keyof PropertyPricingKnowledge]?: unknown };

export type PricingStrategyConfig = {
  mondayTuesdayBps: number;
  sundayBps: number;
  fridaySaturdayBps: number;
  sameDayMorningBps: number;
  sameDayNoonBps: number;
  sameDayEveningBps: number;
  lastMinuteBps: number;
  nextSevenDaysBps: number;
  advanceBookingBps: number;
  highAvailabilityBps: number;
  broadAvailabilityBps: number;
  lowAvailabilityBps: number;
  scarceAvailabilityBps: number;
  peerAvailabilityWeightBps: number;
  oneNightGapPremiumBobMinor: number;
  eventImpactCapBps: number;
  minimumHistoricalEventPairs: number;
  newHistoryBps: number;
  establishedHistoryBps: number;
  balconyPremiumBps: number;
  premiumViewBps: number;
  noViewBps: number;
  excellentRatingBps: number;
  weakRatingBps: number;
};

export const DEFAULT_PRICING_STRATEGY: PricingStrategyConfig = {
  mondayTuesdayBps: -800,
  sundayBps: -400,
  fridaySaturdayBps: 800,
  sameDayMorningBps: -800,
  sameDayNoonBps: -1_200,
  sameDayEveningBps: -1_800,
  lastMinuteBps: -800,
  nextSevenDaysBps: -400,
  advanceBookingBps: 300,
  highAvailabilityBps: -1_000,
  broadAvailabilityBps: -500,
  lowAvailabilityBps: 800,
  scarceAvailabilityBps: 1_500,
  peerAvailabilityWeightBps: 5_000,
  oneNightGapPremiumBobMinor: 5_000,
  eventImpactCapBps: 10_000,
  minimumHistoricalEventPairs: 5,
  newHistoryBps: -500,
  establishedHistoryBps: 500,
  balconyPremiumBps: 250,
  premiumViewBps: 300,
  noViewBps: -250,
  excellentRatingBps: 200,
  weakRatingBps: -200,
};

const VALID_SEGMENTS = new Set(["value", "standard", "premium"]);
const VALID_ATTRIBUTES = new Set(["unknown", "none", "limited", "standard", "premium"]);
const VALID_HISTORY = new Set(["unknown", "new", "growing", "established"]);

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
}

export function normalizePricingStrategy(value: unknown): PricingStrategyConfig {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_PRICING_STRATEGY };
  for (const key of Object.keys(result) as Array<keyof PricingStrategyConfig>) {
    const isMinor = key === "oneNightGapPremiumBobMinor";
    const isWeight = key === "peerAvailabilityWeightBps" || key === "minimumHistoricalEventPairs" || key === "eventImpactCapBps";
    result[key] = boundedInteger(
      source[key],
      result[key],
      key === "minimumHistoricalEventPairs" ? 1 : isWeight || isMinor ? 0 : -5_000,
      key === "minimumHistoricalEventPairs" ? 100 : isMinor ? 100_000 : 20_000,
    );
  }
  return result;
}

function buildingFromName(name: string): string {
  const value = name.toLowerCase();
  if (value.includes("luxe")) return "Luxe Suites";
  if (value.includes("eclipse")) return "Sky Eclipse";
  if (value.includes("luxia")) return "Sky Luxia";
  if (value.includes("moon")) return "Sky Moon";
  if (value.includes("elite") || /^sky\s+\d/.test(value)) return "Sky Elite";
  if (value.includes("stanza")) return "Stanza";
  if (value.includes("uptown")) return "Uptown Nuu";
  return "";
}

export function defaultPricingKnowledge(propertyName: string): PropertyPricingKnowledge {
  const normalized = propertyName.toLowerCase();
  const building = buildingFromName(propertyName);
  const knowledge: PropertyPricingKnowledge = {
    building,
    segment: building === "Sky Eclipse" || building === "Sky Moon" ? "premium" : "standard",
    balcony: "unknown",
    viewQuality: "unknown",
    airbnbHistoryStrength: "unknown",
    bookingHistoryStrength: "unknown",
    airbnbReviewCount: 0,
    bookingReviewCount: 0,
    airbnbRatingHundredths: 0,
    bookingRatingHundredths: 0,
    sellThroughAdjustmentBps: building === "Luxe Suites" ? -300 : 0,
    interchangeableGroup: null,
    bookingFlexibleInventory: false,
    bookingMaxSellableUnits: 1,
    notes: "",
  };

  // Only owner-confirmed, stable operating facts are encoded as defaults.
  if (/luxe(?: suites)? (104|204|205|406)\b/.test(normalized)) {
    knowledge.balcony = "none";
    knowledge.interchangeableGroup = "luxe-suites-sin-balcon";
    knowledge.bookingFlexibleInventory = true;
  }
  if (/luxe(?: suites)? (104|204)\b/.test(normalized) || /sky(?: elite)? 329\b/.test(normalized)) {
    knowledge.viewQuality = "none";
  }
  if (/sky(?: elite)? 331\b/.test(normalized)) knowledge.airbnbHistoryStrength = "established";
  if (/sky eclipse (1402|1409)\b/.test(normalized)) knowledge.interchangeableGroup = "sky-eclipse-1402-1409";
  return knowledge;
}

export function normalizePricingKnowledge(
  propertyName: string,
  value?: RawPricingKnowledge | null,
): PropertyPricingKnowledge {
  const fallback = defaultPricingKnowledge(propertyName);
  if (!value) return fallback;
  const segment = typeof value.segment === "string" ? value.segment : "";
  const balcony = typeof value.balcony === "string" ? value.balcony : "";
  const viewQuality = typeof value.viewQuality === "string" ? value.viewQuality : "";
  const airbnbHistoryStrength = typeof value.airbnbHistoryStrength === "string" ? value.airbnbHistoryStrength : "";
  const bookingHistoryStrength = typeof value.bookingHistoryStrength === "string" ? value.bookingHistoryStrength : "";
  return {
    building: typeof value.building === "string" ? value.building.trim().slice(0, 80) : fallback.building,
    segment: VALID_SEGMENTS.has(segment) ? segment as PropertyPricingKnowledge["segment"] : fallback.segment,
    balcony: VALID_ATTRIBUTES.has(balcony) ? balcony as ProfileAttribute : fallback.balcony,
    viewQuality: VALID_ATTRIBUTES.has(viewQuality) ? viewQuality as ProfileAttribute : fallback.viewQuality,
    airbnbHistoryStrength: VALID_HISTORY.has(airbnbHistoryStrength) ? airbnbHistoryStrength as HistoryStrength : fallback.airbnbHistoryStrength,
    bookingHistoryStrength: VALID_HISTORY.has(bookingHistoryStrength) ? bookingHistoryStrength as HistoryStrength : fallback.bookingHistoryStrength,
    airbnbReviewCount: boundedInteger(value.airbnbReviewCount, fallback.airbnbReviewCount, 0, 100_000),
    bookingReviewCount: boundedInteger(value.bookingReviewCount, fallback.bookingReviewCount, 0, 100_000),
    airbnbRatingHundredths: boundedInteger(value.airbnbRatingHundredths, fallback.airbnbRatingHundredths, 0, 500),
    bookingRatingHundredths: boundedInteger(value.bookingRatingHundredths, fallback.bookingRatingHundredths, 0, 1_000),
    sellThroughAdjustmentBps: boundedInteger(value.sellThroughAdjustmentBps, fallback.sellThroughAdjustmentBps, -5_000, 5_000),
    interchangeableGroup: typeof value.interchangeableGroup === "string" && value.interchangeableGroup.trim()
      ? value.interchangeableGroup.trim().slice(0, 80)
      : fallback.interchangeableGroup,
    bookingFlexibleInventory: typeof value.bookingFlexibleInventory === "boolean" ? value.bookingFlexibleInventory : fallback.bookingFlexibleInventory,
    bookingMaxSellableUnits: boundedInteger(value.bookingMaxSellableUnits, fallback.bookingMaxSellableUnits, 1, 20),
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 2_000) : fallback.notes,
  };
}

export function pricingKnowledgeAdjustmentBps(
  profile: PropertyPricingKnowledge,
  channel: string,
  strategy: PricingStrategyConfig = DEFAULT_PRICING_STRATEGY,
): { bps: number; reasons: string[] } {
  const reasons: string[] = [];
  let bps = profile.sellThroughAdjustmentBps;
  if (profile.sellThroughAdjustmentBps < 0) reasons.push("prioridad de rotación del alojamiento");
  if (profile.sellThroughAdjustmentBps > 0) reasons.push("diferenciación protegida del alojamiento");

  const history = channel === "booking" ? profile.bookingHistoryStrength : channel === "airbnb" ? profile.airbnbHistoryStrength : "unknown";
  const reviewCount = channel === "booking" ? profile.bookingReviewCount : channel === "airbnb" ? profile.airbnbReviewCount : 0;
  const rating = channel === "booking" ? profile.bookingRatingHundredths : channel === "airbnb" ? profile.airbnbRatingHundredths : 0;
  if (history === "new") { bps += strategy.newHistoryBps; reasons.push(`publicación nueva en ${channel}`); }
  if (history === "established") { bps += strategy.establishedHistoryBps; reasons.push(`historial consolidado en ${channel}`); }
  const excellentRating = channel === "airbnb" ? rating >= 490 : channel === "booking" ? rating >= 900 : false;
  const weakRating = channel === "airbnb" ? rating > 0 && rating < 450 : channel === "booking" ? rating > 0 && rating < 800 : false;
  if (reviewCount >= 10 && excellentRating) { bps += strategy.excellentRatingBps; reasons.push(`calificación sobresaliente en ${channel}`); }
  if (reviewCount >= 5 && weakRating) { bps += strategy.weakRatingBps; reasons.push(`calificación débil en ${channel}`); }
  if (profile.balcony === "premium") { bps += strategy.balconyPremiumBps; reasons.push("balcón diferencial"); }
  if (profile.viewQuality === "premium") { bps += strategy.premiumViewBps; reasons.push("vista diferencial"); }
  if (profile.viewQuality === "none") { bps += strategy.noViewBps; reasons.push("sin vista"); }
  return { bps: Math.max(-5_000, Math.min(5_000, bps)), reasons };
}

export function pricingPeerKey(profile: PropertyPricingKnowledge): string {
  return profile.interchangeableGroup || profile.building || "portfolio";
}
