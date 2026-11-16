import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRICING_STRATEGY,
  defaultPricingKnowledge,
  normalizePricingStrategy,
  pricingKnowledgeAdjustmentBps,
  pricingPeerKey,
} from "./pricing-strategy";

describe("RentHome pricing knowledge", () => {
  it("normalizes the owner-confirmed Luxe Suites interchangeable group", () => {
    const profile = defaultPricingKnowledge("Luxe Suites 204");
    expect(profile.building).toBe("Luxe Suites");
    expect(profile.balcony).toBe("none");
    expect(profile.viewQuality).toBe("none");
    expect(profile.bookingFlexibleInventory).toBe(true);
    expect(pricingPeerKey(profile)).toBe("luxe-suites-sin-balcon");
  });

  it("keeps Sky Eclipse 1402 and 1409 as separate properties in one comparable group", () => {
    expect(pricingPeerKey(defaultPricingKnowledge("Sky Eclipse 1402"))).toBe("sky-eclipse-1402-1409");
    expect(pricingPeerKey(defaultPricingKnowledge("Sky Eclipse 1409"))).toBe("sky-eclipse-1402-1409");
  });

  it("protects an established Airbnb listing while allowing a no-view correction", () => {
    const result = pricingKnowledgeAdjustmentBps(defaultPricingKnowledge("Sky Elite 331"), "airbnb");
    expect(result.bps).toBe(DEFAULT_PRICING_STRATEGY.establishedHistoryBps);
    expect(result.reasons).toContain("historial consolidado en airbnb");
  });

  it("bounds editable global strategy values", () => {
    const strategy = normalizePricingStrategy({ eventImpactCapBps: 99_999, minimumHistoricalEventPairs: 0 });
    expect(strategy.eventImpactCapBps).toBe(20_000);
    expect(strategy.minimumHistoricalEventPairs).toBe(1);
  });
});
