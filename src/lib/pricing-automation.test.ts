import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/pricing-shadow", () => ({ generateShadowPrices: vi.fn() }));

import { groupAutomationResults } from "./pricing-automation";

describe("pricing browser automation audit compression", () => {
  it("groups contiguous equal verified changes into one compact audit range", () => {
    const rows = groupAutomationResults([
      { propertyId: 4, date: "2026-11-17", previousMinor: 3500, requestedMinor: 3800, observedMinor: 3800, status: "verified" },
      { propertyId: 4, date: "2026-11-18", previousMinor: 3500, requestedMinor: 3800, observedMinor: 3800, status: "verified" },
      { propertyId: 4, date: "2026-11-20", previousMinor: 3500, requestedMinor: 3800, observedMinor: 3800, status: "verified" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ startsOn: "2026-11-17", endsOn: "2026-11-18" });
    expect(rows[1]).toMatchObject({ startsOn: "2026-11-20", endsOn: "2026-11-20" });
  });

  it("does not combine mismatches with verified results", () => {
    const rows = groupAutomationResults([
      { propertyId: 7, date: "2026-11-17", requestedMinor: 4000, observedMinor: 4000, status: "verified" },
      { propertyId: 7, date: "2026-11-18", requestedMinor: 4000, observedMinor: 3900, status: "mismatch" },
    ]);
    expect(rows).toHaveLength(2);
  });
});
