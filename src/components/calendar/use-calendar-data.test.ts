import { describe, expect, it } from "vitest";
import type { CalendarBar } from "./types";
import {
  dedupeCalendarBars,
  isCalendarAvailabilityBlock,
} from "./use-calendar-data";

describe("isCalendarAvailabilityBlock", () => {
  it("recognizes channel-specific block labels", () => {
    expect(isCalendarAvailabilityBlock({ summary: "Airbnb (Not available)" })).toBe(true);
    expect(isCalendarAvailabilityBlock({ summary: "CLOSED - Not available" })).toBe(true);
    expect(isCalendarAvailabilityBlock({ summary: "Blocked" })).toBe(true);
    expect(isCalendarAvailabilityBlock({ summary: "Reserved" })).toBe(false);
  });
});

describe("dedupeCalendarBars", () => {
  it("keeps overlapping availability blocks separate like the master calendar", () => {
    const bars: CalendarBar[] = [
      {
        startDate: "2026-08-19",
        endDate: "2026-08-22",
        name: "No disponible",
        platform: "airbnb-block",
        eventUid: "block-a",
      },
      {
        startDate: "2026-08-21",
        endDate: "2026-08-24",
        name: "No disponible",
        platform: "airbnb-block",
        eventUid: "block-b",
      },
    ];

    expect(dedupeCalendarBars(bars)).toEqual(bars);
  });

  it("still collapses overlapping ordinary bars from the same channel", () => {
    const bars: CalendarBar[] = [
      {
        startDate: "2026-08-19",
        endDate: "2026-08-22",
        name: "Airbnb",
        platform: "airbnb",
      },
      {
        startDate: "2026-08-21",
        endDate: "2026-08-24",
        name: "Airbnb",
        platform: "airbnb",
      },
    ];

    expect(dedupeCalendarBars(bars)).toEqual([
      {
        startDate: "2026-08-19",
        endDate: "2026-08-24",
        name: "Airbnb",
        platform: "airbnb",
      },
    ]);
  });
});
