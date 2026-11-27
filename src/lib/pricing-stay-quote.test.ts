import { describe, expect, it } from "vitest";
import { calculateStayQuote, nightlyFloorBobMinor, type QuotePolicy } from "./pricing-stay-quote";
import { netMinorAfterDeductions } from "./pricing";

const direct: QuotePolicy = {
  propertyId: 1,
  channel: "direct",
  commissionBps: 0,
  floorBobMinor: 26_500,
  monthlyFloorBobMinor: 505_000,
  promotions: [],
};

function quote(nights: number, priceMinor: number, policy = direct, reasons = "") {
  return calculateStayQuote({
    policy,
    nightly: Array.from({ length: nights }, () => ({ date: "2026-11-29", priceMinor, reasons })),
    today: "2026-11-27",
    bobPerUsd: 11.75,
    gapPremiumBobMinor: 5_000,
  });
}

describe("calendar stay quotes", () => {
  it("raises low nightly floors and keeps higher property floors", () => {
    expect(nightlyFloorBobMinor({ floorCurrency: "BOB", floorMinor: 25_000 }, 11.75, true)).toBe(26_500);
    expect(nightlyFloorBobMinor({ floorCurrency: "USD", floorMinor: 2_500 }, 11.75, true)).toBe(29_375);
    expect(nightlyFloorBobMinor({ floorCurrency: "BOB", floorMinor: 25_000 }, 11.75, false)).toBe(25_000);
  });

  it("discounts seven nights only where the nightly floor leaves room", () => {
    expect(quote(6, 30_000).savingsMinor).toBe(0);
    expect(quote(7, 30_000).savingsMinor).toBeGreaterThan(0);
    expect(quote(7, 26_500)).toMatchObject({ totalMinor: 185_500, savingsMinor: 0, durationLimited: true });
    expect(quote(1, 26_500, direct, "hueco de una noche").totalMinor).toBe(31_500);
  });

  it("uses the monthly floor from the 28th night and protects event dates", () => {
    expect(quote(28, 30_000)).toMatchObject({ floorBobMinor: 505_000 });
    expect(quote(31, 30_000).floorBobMinor).toBe(Math.ceil(505_000 * 29 / 28));
    expect(quote(28, 30_000, direct, "feriado o evento de mercado").savingsMinor).toBeLessThanOrEqual(42_000);
  });

  it("protects the Booking net after commission and applies one length tier", () => {
    const booking: QuotePolicy = {
      ...direct,
      channel: "booking",
      commissionBps: 1_500,
      promotions: [
        { promotionType: "genius", enabled: true, discountBps: 2_000, stackable: true, minNights: 1, minLeadDays: null, maxLeadDays: null },
        { promotionType: "weekly", enabled: true, discountBps: 1_000, stackable: true, minNights: 1, minLeadDays: null, maxLeadDays: null },
        { promotionType: "monthly", enabled: true, discountBps: 1_500, stackable: true, minNights: 1, minLeadDays: null, maxLeadDays: null },
      ],
    };
    expect(quote(6, 4_000, booking).savingsMinor).toBe(0);
    const week = quote(7, 3_500, booking);
    expect(netMinorAfterDeductions(week.totalMinor, [1_500])).toBeGreaterThanOrEqual(Math.ceil(week.floorBobMinor / 11.75));
    expect(quote(28, 4_000, booking).totalMinor).toBe(76_160);
  });
});
