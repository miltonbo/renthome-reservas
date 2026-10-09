import { describe, expect, it } from "vitest";
import { groupClosedDateOverrides } from "./date-overrides";

describe("groupClosedDateOverrides", () => {
  it("groups consecutive blocked nights with the same reason", () => {
    expect(groupClosedDateOverrides([
      { propertyId: 24, date: "2026-10-17", type: "closed", note: "Mantenimiento" },
      { propertyId: 24, date: "2026-10-18", type: "closed", note: "Mantenimiento" },
      { propertyId: 24, date: "2026-10-19", type: "closed", note: "Uso del propietario" },
      { propertyId: 24, date: "2026-10-20", type: "open", note: "" },
    ])).toEqual([
      { propertyId: 24, startDate: "2026-10-17", endDate: "2026-10-19", nights: 2, reason: "Mantenimiento" },
      { propertyId: 24, startDate: "2026-10-19", endDate: "2026-10-20", nights: 1, reason: "Uso del propietario" },
    ]);
  });
});
