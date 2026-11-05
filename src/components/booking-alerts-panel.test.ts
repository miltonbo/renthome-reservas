import { describe, expect, it } from "vitest";
import { bookingAlertNights } from "@/components/booking-alerts-panel";
import { isAdvisoryBookingEvent } from "@/lib/calendar-event-kind";

describe("Booking advisory alerts", () => {
  it("calculates the number of nights from the exclusive checkout date", () => {
    expect(bookingAlertNights("2026-11-05", "2026-11-15")).toBe(10);
    expect(bookingAlertNights("2026-11-05", "2026-11-06")).toBe(1);
  });

  it("recognizes Booking regardless of casing or whitespace", () => {
    expect(isAdvisoryBookingEvent({ platform: " booking " })).toBe(true);
    expect(isAdvisoryBookingEvent({ platform: "Booking" })).toBe(true);
    expect(isAdvisoryBookingEvent({ platform: "airbnb" })).toBe(false);
  });
});
