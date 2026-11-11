import { describe, expect, it } from "vitest";
import {
  assertPricingBand,
  discountedMinorWithFloor,
  grossMinorForNetFloor,
  priceForGuests,
} from "./pricing";

describe("pricing safety rules", () => {
  it("accepts ordered floor, target and ceiling values", () => {
    expect(() => assertPricingBand({ floorMinor: 24_000, targetMinor: 30_000, ceilingMinor: 42_000 })).not.toThrow();
  });

  it("rejects a target below the floor", () => {
    expect(() => assertPricingBand({ floorMinor: 29_000, targetMinor: 28_000, ceilingMinor: 40_000 })).toThrow(
      "floorMinor <= targetMinor <= ceilingMinor",
    );
  });

  it("raises the displayed price enough to preserve the net floor", () => {
    // Booking 15% commission + 10% Genius: Bs 320 net requires Bs 426.67 gross.
    expect(grossMinorForNetFloor(32_000, [1_500, 1_000])).toBe(42_667);
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
