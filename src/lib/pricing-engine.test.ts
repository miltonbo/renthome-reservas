import { describe, expect, it } from "vitest";
import { calculateShadowPrice, combinedPromotionBps, pricingRunSlot } from "./pricing-engine";

const band = { floorMinor: 24_000, targetMinor: 30_000, ceilingMinor: 42_000 };

describe("phase 2 shadow pricing", () => {
  it("reduces a soft Monday with broad availability but never crosses the floor", () => {
    const result = calculateShadowPrice({
      band,
      today: "2026-11-08",
      date: "2026-11-09",
      availableRatio: 0.7,
      eventImpactBps: 0,
      commissionBps: 0,
      requestedPromotionBps: 0,
      maxDiscountBps: 2_000,
      occupied: false,
    });
    expect(result.recommendedMinor).toBeGreaterThanOrEqual(24_000);
    expect(result.adjustmentBps).toBeLessThan(0);
  });

  it("raises event dates when inventory is scarce", () => {
    const result = calculateShadowPrice({
      band,
      today: "2026-08-20",
      date: "2026-09-20",
      availableRatio: 0.08,
      eventImpactBps: 2_000,
      commissionBps: 0,
      requestedPromotionBps: 0,
      maxDiscountBps: 2_000,
      occupied: false,
    });
    expect(result.recommendedMinor).toBeGreaterThan(band.targetMinor);
    expect(result.reasons).toContain("feriado o evento de mercado");
  });

  it("prices Booking commission and Genius above the net floor", () => {
    const result = calculateShadowPrice({
      band,
      today: "2026-11-10",
      date: "2026-11-12",
      availableRatio: 0.5,
      eventImpactBps: 0,
      commissionBps: 1_500,
      requestedPromotionBps: 1_000,
      maxDiscountBps: 2_000,
      occupied: false,
    });
    expect(result.netMinor).toBeGreaterThanOrEqual(band.floorMinor);
  });

  it("flags an inconsistent ceiling instead of breaking the floor", () => {
    const result = calculateShadowPrice({
      band: { floorMinor: 30_000, targetMinor: 31_000, ceilingMinor: 32_000 },
      today: "2026-11-10",
      date: "2026-11-12",
      availableRatio: 0.5,
      eventImpactBps: 0,
      commissionBps: 1_500,
      requestedPromotionBps: 2_000,
      maxDiscountBps: 2_000,
      occupied: false,
    });
    expect(result.status).toBe("needs_review");
    expect(result.netMinor).toBeGreaterThanOrEqual(30_000);
  });

  it("stacks opted-in promotions and only the strongest exclusive one", () => {
    expect(combinedPromotionBps([
      { enabled: true, discountBps: 1_000, stackable: true },
      { enabled: true, discountBps: 500, stackable: true },
      { enabled: true, discountBps: 1_500, stackable: false },
      { enabled: true, discountBps: 1_000, stackable: false },
    ])).toBe(3_000);
  });

  it("opens shadow runs at 08:00, 12:00 and 17:00 Bolivia time", () => {
    expect(pricingRunSlot(new Date("2026-11-11T12:05:00.000Z"))).toBe("2026-11-11-08");
    expect(pricingRunSlot(new Date("2026-11-11T16:10:00.000Z"))).toBe("2026-11-11-12");
    expect(pricingRunSlot(new Date("2026-11-11T21:15:00.000Z"))).toBe("2026-11-11-17");
    expect(pricingRunSlot(new Date("2026-11-11T18:00:00.000Z"))).toBeNull();
  });
});
