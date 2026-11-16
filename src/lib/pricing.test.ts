import { describe, expect, it } from "vitest";
import {
  assertPricingBand,
  discountedMinorWithFloor,
  grossMinorForNetFloor,
  netMinorAfterDeductions,
  priceForGuests,
} from "./pricing";

describe("pricing safety rules", () => {
  it("accepts an ordered floor and reference without an artificial ceiling", () => {
    expect(() => assertPricingBand({ floorMinor: 24_000, targetMinor: 30_000 })).not.toThrow();
  });

  it("rejects a target below the floor", () => {
    expect(() => assertPricingBand({ floorMinor: 29_000, targetMinor: 28_000 })).toThrow(
      "floorMinor <= targetMinor",
    );
  });

  it("raises the displayed price enough to preserve the net floor", () => {
    // Booking 10% promotion, then 15% commission: Bs 320 net requires Bs 418.32 gross.
    expect(grossMinorForNetFloor(32_000, [1_000, 1_500])).toBe(41_832);
    expect(netMinorAfterDeductions(41_832, [1_000, 1_500])).toBeGreaterThanOrEqual(32_000);
  });

  it("never lets a promotion cross the configured floor", () => {
    expect(discountedMinorWithFloor(30_000, 2_000, 25_000)).toBe(25_000);
  });

  it("charges the third guest 20 percent and leaves guests one and two unchanged", () => {
    expect(priceForGuests(30_000, 1)).toBe(30_000);
    expect(priceForGuests(30_000, 2)).toBe(30_000);
    expect(priceForGuests(30_000, 3)).toBe(36_000);
  });
});
