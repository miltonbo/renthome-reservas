import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { computeEventCalibrations, eventFamilyKey } from "./pricing-history-calibration";

describe("historical event price calibration", () => {
  it("normalizes recurring event editions", () => {
    expect(eventFamilyKey("Expocruz 2026")).toBe("expocruz");
    expect(eventFamilyKey("EXPOCRUZ 2027")).toBe("expocruz");
  });

  it("learns channel-specific uplift and shrinks a small sample", () => {
    const reservations = [
      { propertyId: 1, platform: "booking", priceCurrency: "USD", checkIn: new Date("2026-09-01T12:00:00Z"), checkOut: new Date("2026-09-04T12:00:00Z"), nightlyPrice: 30, totalPrice: 90 },
      { propertyId: 1, platform: "booking", priceCurrency: "USD", checkIn: new Date("2026-09-18T12:00:00Z"), checkOut: new Date("2026-09-21T12:00:00Z"), nightlyPrice: 45, totalPrice: 135 },
    ];
    const profiles = computeEventCalibrations([{ name: "Expocruz 2026", startsOn: "2026-09-18", endsOn: "2026-09-27" }], reservations);
    expect(profiles[0]).toMatchObject({ eventKey: "expocruz", channel: "booking", rawMedianBps: 5_000, samplePairs: 1 });
    expect(profiles[0].upliftBps).toBe(455);
  });
});
