import { describe, expect, it } from "vitest";
import {
  evaluatePropertyAvailability,
  parseAvailabilityQuery,
  type AvailabilityQuery,
} from "./messaging-availability";
import { MessagingValidationError } from "./messaging";

const now = new Date("2026-09-11T15:00:00.000Z");
const query: AvailabilityQuery = {
  checkIn: "2026-09-12",
  checkOut: "2026-09-14",
  nights: 2,
  guests: null,
  propertyId: null,
};

function property(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    name: "Sky Elite 329",
    minNights: 1,
    checkInTime: "14:00",
    checkOutTime: "11:00",
    bookingWindow: 365,
    cleaningEnabled: true,
    isPaused: false,
    reservations: [],
    calendarEvents: [],
    calendarLinks: [
      {
        bufferBefore: 0,
        bufferAfter: 0,
        lastFetchedAt: new Date("2026-09-11T14:30:00.000Z"),
        lastError: null,
      },
    ],
    dateOverrides: [],
    ...overrides,
  };
}

describe("parseAvailabilityQuery", () => {
  it("parses a bounded date-only query", () => {
    const parsed = parseAvailabilityQuery(
      new URLSearchParams({
        checkIn: "2026-09-12",
        checkOut: "2026-09-14",
        guests: "2",
        propertyId: "7",
      }),
      now,
    );
    expect(parsed).toEqual({ ...query, guests: 2, propertyId: 7 });
  });

  it("rejects past, reversed, and unbounded ranges", () => {
    expect(() =>
      parseAvailabilityQuery(
        new URLSearchParams({ checkIn: "2026-09-10", checkOut: "2026-09-12" }),
        now,
      ),
    ).toThrow(MessagingValidationError);
    expect(() =>
      parseAvailabilityQuery(
        new URLSearchParams({ checkIn: "2026-09-12", checkOut: "2026-09-12" }),
        now,
      ),
    ).toThrow(MessagingValidationError);
    expect(() =>
      parseAvailabilityQuery(
        new URLSearchParams({ checkIn: "2026-09-12", checkOut: "2027-09-14" }),
        now,
      ),
    ).toThrow(MessagingValidationError);
  });
});
describe("evaluatePropertyAvailability", () => {
  it("returns verified date availability with a current connected calendar", () => {
    expect(evaluatePropertyAvailability(property(), query, now)).toMatchObject({
      dateStatus: "available",
      reasons: [],
      calendarStatus: "current",
      requiresHumanReview: false,
    });
  });

  it("does not expose a guest name when a reservation overlaps", () => {
    const result = evaluatePropertyAvailability(
      property({
        reservations: [
          {
            checkIn: new Date("2026-09-13T00:00:00.000Z"),
            checkOut: new Date("2026-09-15T00:00:00.000Z"),
          },
        ],
      }),
      query,
      now,
    );
    expect(result.dateStatus).toBe("unavailable");
    expect(result.reasons).toContain("confirmed_reservation");
    expect(JSON.stringify(result)).not.toContain("guest");
  });

  it("distinguishes calendar bookings and host blocks", () => {
    const booking = evaluatePropertyAvailability(
      property({
        calendarEvents: [
          { startDate: "2026-09-12", endDate: "2026-09-13", summary: "Reserved" },
        ],
      }),
      query,
      now,
    );
    const block = evaluatePropertyAvailability(
      property({
        calendarEvents: [
          {
            startDate: "2026-09-12",
            endDate: "2026-09-13",
            summary: "Airbnb (Not available)",
          },
        ],
      }),
      query,
      now,
    );
    expect(booking.reasons).toContain("calendar_booking");
    expect(block.reasons).toContain("calendar_block");
  });

  it("applies buffers but honors an explicit open override", () => {
    const bufferedProperty = property({
      reservations: [
        { checkIn: "2026-09-14", checkOut: "2026-09-16" },
      ],
      calendarLinks: [
        {
          bufferBefore: 1,
          bufferAfter: 1,
          lastFetchedAt: new Date("2026-09-11T14:30:00.000Z"),
          lastError: null,
        },
      ],
    });
    expect(
      evaluatePropertyAvailability(bufferedProperty, query, now).reasons,
    ).toContain("cleaning_buffer");
    expect(
      evaluatePropertyAvailability(
        property({
          ...bufferedProperty,
          dateOverrides: [{ date: "2026-09-13", type: "open" }],
        }),
        query,
        now,
      ).reasons,
    ).not.toContain("cleaning_buffer");
  });

  it("does not treat post-checkout cleaning as hard inventory", () => {
    const fourNightQuery: AvailabilityQuery = {
      ...query,
      checkOut: "2026-09-16",
      nights: 4,
    };
    const result = evaluatePropertyAvailability(
      property({
        reservations: [
          { checkIn: "2026-09-10", checkOut: "2026-09-12" },
        ],
        calendarLinks: [
          {
            bufferBefore: 1,
            bufferAfter: 1,
            lastFetchedAt: new Date("2026-09-11T14:30:00.000Z"),
            lastError: null,
          },
        ],
      }),
      fourNightQuery,
      now,
    );

    expect(result.dateStatus).toBe("available");
    expect(result.reasons).not.toContain("cleaning_buffer");
  });

  it("does not carry a stale buffer across consecutive stays", () => {
    const oneNightQuery: AvailabilityQuery = {
      ...query,
      checkOut: "2026-09-13",
      nights: 1,
    };
    const result = evaluatePropertyAvailability(
      property({
        reservations: [
          { checkIn: "2026-09-10", checkOut: "2026-09-11" },
          { checkIn: "2026-09-11", checkOut: "2026-09-12" },
        ],
        calendarLinks: [
          {
            bufferBefore: 1,
            bufferAfter: 1,
            lastFetchedAt: new Date("2026-09-11T14:30:00.000Z"),
            lastError: null,
          },
        ],
      }),
      oneNightQuery,
      now,
    );

    expect(result.dateStatus).toBe("available");
    expect(result.reasons).not.toContain("cleaning_buffer");
  });

  it("allows the checkout night before a following availability-only block", () => {
    const oneNightQuery: AvailabilityQuery = {
      ...query,
      checkOut: "2026-09-13",
      nights: 1,
    };
    const result = evaluatePropertyAvailability(
      property({
        reservations: [
          { checkIn: "2026-09-10", checkOut: "2026-09-11" },
          { checkIn: "2026-09-11", checkOut: "2026-09-12" },
        ],
        calendarEvents: [
          {
            startDate: "2026-09-13",
            endDate: "2026-09-17",
            summary: "Airbnb (Not available)",
          },
        ],
        calendarLinks: [
          {
            bufferBefore: 1,
            bufferAfter: 1,
            lastFetchedAt: new Date("2026-09-11T14:30:00.000Z"),
            lastError: null,
          },
        ],
      }),
      oneNightQuery,
      now,
    );

    expect(result.dateStatus).toBe("available");
    expect(result.reasons).not.toContain("cleaning_buffer");
  });

  it("marks free dates as tentative when calendars are stale or capacity is requested", () => {
    const stale = evaluatePropertyAvailability(
      property({
        calendarLinks: [
          {
            bufferBefore: 0,
            bufferAfter: 0,
            lastFetchedAt: new Date("2026-09-10T12:00:00.000Z"),
            lastError: null,
          },
        ],
      }),
      query,
      now,
    );
    expect(stale).toMatchObject({
      dateStatus: "available",
      calendarStatus: "stale",
      requiresHumanReview: true,
    });

    const capacity = evaluatePropertyAvailability(
      property(),
      { ...query, guests: 3 },
      now,
    );
    expect(capacity.requiresHumanReview).toBe(true);
    expect(capacity.capacityVerified).toBe(false);
  });

  it("rejects paused properties, short stays, and manual blocks", () => {
    const result = evaluatePropertyAvailability(
      property({
        isPaused: true,
        minNights: 3,
        dateOverrides: [{ date: "2026-09-13", type: "closed" }],
      }),
      query,
      now,
    );
    expect(result.reasons).toEqual(
      expect.arrayContaining(["property_paused", "minimum_stay", "manual_block"]),
    );
  });
});
