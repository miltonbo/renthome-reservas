import { describe, expect, it } from "vitest";
import { canSelectCalendarDate } from "./date-slider";

describe("canSelectCalendarDate", () => {
  const booked = new Set(["2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]);

  it("blocks an occupied night as a new check-in", () => {
    expect(canSelectCalendarDate("2026-08-18", "in", "", booked)).toBe(false);
  });

  it("allows the first occupied date as an exclusive checkout boundary", () => {
    expect(canSelectCalendarDate("2026-08-18", "out", "2026-08-16", booked)).toBe(true);
  });

  it("does not allow a checkout range that crosses occupied nights", () => {
    expect(canSelectCalendarDate("2026-08-21", "out", "2026-08-16", booked)).toBe(false);
  });

  it("does not allow an unoccupied checkout date beyond occupied nights", () => {
    expect(canSelectCalendarDate("2026-08-23", "out", "2026-08-16", booked)).toBe(false);
  });

  it("keeps an unoccupied date selectable", () => {
    expect(canSelectCalendarDate("2026-08-22", "in", "", booked)).toBe(true);
  });
});
