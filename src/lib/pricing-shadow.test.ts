import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/bcb-exchange-rate", () => ({ getOfficialExchangeRate: vi.fn() }));

import { isOneNightGap, marketEventImpactBps, promotionAppliesOnDate } from "./pricing-shadow";

describe("market event demand impact", () => {
  it("does not double-count the recurring and official version of a holiday", () => {
    const impact = marketEventImpactBps([
      { startsOn: "2027-05-27", endsOn: "2027-05-27", eventType: "holiday", impactBps: 1500, confidenceBps: 9000 },
      { startsOn: "2027-05-27", endsOn: "2027-05-27", eventType: "holiday", impactBps: 1500, confidenceBps: 10000 },
    ], "2027-05-27");
    expect(impact).toBe(1500);
  });

  it("stacks independent city events and caps extreme demand", () => {
    expect(marketEventImpactBps([
      { startsOn: "2027-09-20", endsOn: "2027-09-30", eventType: "fair", impactBps: 8000, confidenceBps: 10000 },
      { startsOn: "2027-09-24", endsOn: "2027-09-24", eventType: "concert", impactBps: 5000, confidenceBps: 10000 },
    ], "2027-09-24")).toBe(10_000);
  });

  it("uses a sufficiently sampled channel calibration for a recurring event", () => {
    const event = { name: "Expocruz 2027", startsOn: "2027-09-17", endsOn: "2027-09-26", eventType: "fair", impactBps: 1200, confidenceBps: 8000 };
    const profiles = [{ eventKey: "expocruz", channel: "booking", upliftBps: 1450, rawMedianBps: 3000, samplePairs: 9 }];
    expect(marketEventImpactBps([event], "2027-09-20", "booking", profiles)).toBe(1450);
    expect(marketEventImpactBps([event], "2027-09-20", "airbnb", profiles)).toBe(960);
  });
});

describe("one-night gap cleaning premium", () => {
  const ranges = [
    { start: "2026-11-10", end: "2026-11-12" },
    { start: "2026-11-13", end: "2026-11-16" },
  ];

  it("detects the one free night between two stays", () => {
    expect(isOneNightGap("2026-11-12", "2026-11-01", ranges)).toBe(true);
  });

  it("detects today's orphan night before a check-in", () => {
    expect(isOneNightGap("2026-11-12", "2026-11-12", [{ start: "2026-11-13", end: "2026-11-16" }])).toBe(true);
  });

  it("does not open an arbitrary future one-night stay before a booking", () => {
    expect(isOneNightGap("2026-11-12", "2026-11-01", [{ start: "2026-11-13", end: "2026-11-16" }])).toBe(false);
  });
});

describe("promotion timing", () => {
  it("only protects a last-minute promotion inside its configured window", () => {
    const promotion = { enabled: true, minLeadDays: null, maxLeadDays: 3 };
    expect(promotionAppliesOnDate(promotion, "2026-11-13", "2026-11-10")).toBe(true);
    expect(promotionAppliesOnDate(promotion, "2026-11-14", "2026-11-10")).toBe(false);
  });
});
