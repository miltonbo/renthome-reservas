import { describe, expect, it } from "vitest";
import { calculateShadowPrice, combinedPromotionBps, pricingRunSlot } from "./pricing-engine";

const band = { floorMinor: 24_000, targetMinor: 30_000 };

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
      occupied: false,
    });
    expect(result.recommendedMinor).toBeGreaterThan(band.targetMinor);
    expect(result.reasons).toContain("feriado o evento de mercado");
  });

  it("does not push distant dates to the floor while there is still time to sell", () => {
    const result = calculateShadowPrice({
      band: { floorMinor: 24_000, targetMinor: 28_000 },
      today: "2026-11-19",
      date: "2026-12-30",
      availableRatio: 0.96,
      peerAvailableRatio: 0.96,
      propertyAdjustmentBps: -1_000,
      eventImpactBps: 0,
      commissionBps: 0,
      requestedPromotionBps: 0,
      occupied: false,
    });
    expect(result.recommendedMinor).toBe(28_000);
    expect(result.reasons).toContain("precio futuro protegido mientras aún hay tiempo para vender");
  });

  it("protects an anticipated holiday uplift from availability discounts", () => {
    const result = calculateShadowPrice({
      band: { floorMinor: 24_000, targetMinor: 28_000 },
      today: "2026-11-19",
      date: "2026-12-31",
      availableRatio: 0.96,
      peerAvailableRatio: 0.96,
      propertyAdjustmentBps: -1_000,
      eventImpactBps: 1_800,
      commissionBps: 0,
      requestedPromotionBps: 0,
      occupied: false,
    });
    expect(result.adjustmentBps).toBe(1_800);
    expect(result.recommendedMinor).toBe(33_040);
    expect(result.reasons).toContain("demanda festiva protegida con anticipación");
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
      occupied: false,
    });
    expect(result.netMinor).toBeGreaterThanOrEqual(band.floorMinor);
  });

  it("allows exceptional demand to raise the price without a ceiling", () => {
    const result = calculateShadowPrice({
      band: { floorMinor: 30_000, targetMinor: 31_000 },
      today: "2026-11-10",
      date: "2026-11-12",
      availableRatio: 0.05,
      eventImpactBps: 20_000,
      commissionBps: 0,
      requestedPromotionBps: 0,
      occupied: false,
    });
    expect(result.status).toBe("recommended");
    expect(result.recommendedMinor).toBeGreaterThan(60_000);
  });

  it("allows a 50% promotion while raising Airbnb gross enough to preserve a USD 20 net floor", () => {
    const result = calculateShadowPrice({
      band: { floorMinor: 2_000, targetMinor: 3_000 },
      today: "2026-11-10",
      date: "2026-11-12",
      availableRatio: 0.5,
      eventImpactBps: 0,
      commissionBps: 1_550,
      requestedPromotionBps: 5_000,
      occupied: false,
    });
    expect(result.appliedPromotionBps).toBe(5_000);
    expect(result.netMinor).toBeGreaterThanOrEqual(2_000);
    expect(result.recommendedMinor).toBeGreaterThanOrEqual(4_734);
  });

  it("stacks opted-in promotions and only the strongest exclusive one", () => {
    expect(combinedPromotionBps([
      { enabled: true, discountBps: 1_000, stackable: true },
      { enabled: true, discountBps: 500, stackable: true },
      { enabled: true, discountBps: 1_500, stackable: false },
      { enabled: true, discountBps: 1_000, stackable: false },
    ])).toBe(2_733);
  });

  it("protects Booking's net floor after Genius, targeted and last-minute discounts", () => {
    const promotionBps = combinedPromotionBps([
      { enabled: true, discountBps: 2_000, stackable: true, promotionType: "genius" },
      { enabled: true, discountBps: 1_000, stackable: true, promotionType: "mobile" },
      { enabled: true, discountBps: 1_000, stackable: true, promotionType: "country" },
      { enabled: true, discountBps: 1_000, stackable: true, promotionType: "last_minute" },
    ], "booking");
    expect(promotionBps).toBe(3_520);

    const result = calculateShadowPrice({
      band: { floorMinor: 2_141, targetMinor: 4_000 },
      today: "2026-11-19",
      date: "2026-11-19",
      availableRatio: 0.5,
      eventImpactBps: 0,
      commissionBps: 1_500,
      requestedPromotionBps: promotionBps,
      occupied: false,
      localHour: 17,
    });
    expect(result.recommendedMinor).toBeGreaterThanOrEqual(3_887);
    expect(result.netMinor).toBeGreaterThanOrEqual(2_141);
  });

  it("uses Airbnb discount priority instead of adding main discounts", () => {
    expect(combinedPromotionBps([
      { enabled: true, discountBps: 1_500, stackable: true, promotionType: "last_minute" },
      { enabled: true, discountBps: 1_000, stackable: true, promotionType: "weekly" },
      { enabled: true, discountBps: 2_000, stackable: true, promotionType: "custom" },
    ], "airbnb")).toBe(2_000);
  });

  it("opens shadow runs at 08:00, 12:00 and 17:00 Bolivia time", () => {
    expect(pricingRunSlot(new Date("2026-11-11T12:05:00.000Z"))).toBe("2026-11-11-08");
    expect(pricingRunSlot(new Date("2026-11-11T16:10:00.000Z"))).toBe("2026-11-11-12");
    expect(pricingRunSlot(new Date("2026-11-11T21:15:00.000Z"))).toBe("2026-11-11-17");
    expect(pricingRunSlot(new Date("2026-11-11T18:00:00.000Z"))).toBeNull();
  });

  it("becomes more aggressive for same-day vacancies at the evening run", () => {
    const morning = calculateShadowPrice({
      band, today: "2026-11-10", date: "2026-11-10", availableRatio: 0.5,
      eventImpactBps: 0, commissionBps: 0, requestedPromotionBps: 0, occupied: false, localHour: 8,
    });
    const evening = calculateShadowPrice({
      band, today: "2026-11-10", date: "2026-11-10", availableRatio: 0.5,
      eventImpactBps: 0, commissionBps: 0, requestedPromotionBps: 0, occupied: false, localHour: 17,
    });
    expect(evening.adjustmentBps).toBeLessThan(morning.adjustmentBps);
    expect(evening.recommendedMinor).toBeGreaterThanOrEqual(band.floorMinor);
  });

  it("combines comparable-property scarcity and reputation without weakening the floor", () => {
    const result = calculateShadowPrice({
      band, today: "2026-11-10", date: "2026-11-20", availableRatio: 0.5,
      peerAvailableRatio: 0.05, propertyAdjustmentBps: 500,
      propertyReasons: ["historial consolidado en airbnb"], eventImpactBps: 0,
      commissionBps: 1_550, requestedPromotionBps: 2_000, occupied: false,
    });
    expect(result.reasons).toContain("inventario casi agotado de propiedades comparables");
    expect(result.reasons).toContain("historial consolidado en airbnb");
    expect(result.netMinor).toBeGreaterThanOrEqual(band.floorMinor);
  });
});
