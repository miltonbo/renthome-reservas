import { describe, expect, it } from "vitest";
import { computePricingLearning, durationBand } from "./pricing-learning";

describe("pricing learning", () => {
  it("classifies accumulated stay length", () => {
    expect(durationBand(2)).toBe("short");
    expect(durationBand(7)).toBe("weekly");
    expect(durationBand(14)).toBe("extended");
    expect(durationBand(28)).toBe("monthly");
  });

  it("does not adjust prices with a tiny sample", () => {
    const [result] = computePricingLearning([
      { propertyId: 1, channel: "airbnb", exposureNights: 10, bookedNights: 10, bookingCount: 2 },
    ]);
    expect(result.confidenceBps).toBe(0);
    expect(result.adjustmentBps).toBe(0);
  });

  it("raises and lowers targets conservatively relative to channel peers", () => {
    const results = computePricingLearning([
      { propertyId: 1, channel: "booking", exposureNights: 60, bookedNights: 48, bookingCount: 10 },
      { propertyId: 2, channel: "booking", exposureNights: 60, bookedNights: 12, bookingCount: 4 },
    ]);
    expect(results[0].adjustmentBps).toBeGreaterThan(0);
    expect(results[1].adjustmentBps).toBeLessThan(0);
    expect(Math.abs(results[0].adjustmentBps)).toBeLessThanOrEqual(500);
    expect(Math.abs(results[1].adjustmentBps)).toBeLessThanOrEqual(500);
  });
});
