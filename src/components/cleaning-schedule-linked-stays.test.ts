import { describe, expect, it } from "vitest";
import type { CalendarLink, Property, Reservation } from "@/lib/types";
import { computeCleaningDays, toOperationsDateStr } from "./cleaning-schedule";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 1,
    name: "Joanne",
    checkIn: "2026-08-23T00:00:00.000Z",
    checkOut: "2026-08-25T00:00:00.000Z",
    platform: "direct",
    propertyId: 68,
    createdAt: "2026-08-01T00:00:00.000Z",
    linkedEventUid: "source-uid",
    linkedEventPlatform: "airbnb",
    linkedEventRole: "extension",
    ...overrides,
  };
}

function property(reservations: Reservation[]): Property {
  return {
    id: 68,
    userId: 3,
    name: "Apt 68",
    minNights: 1,
    checkInTime: "14:00",
    checkOutTime: "12:00",
    bookingWindow: 365,
    cleaningEnabled: true,
    feedToken: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    reservations,
  };
}

function link(overrides: Partial<CalendarLink> = {}): CalendarLink {
  return {
    id: 1,
    propertyId: 68,
    platform: "airbnb",
    icalExportUrl: "https://example.com/calendar.ics",
    bufferBefore: 0,
    bufferAfter: 0,
    lastFetchedAt: null,
    lastError: null,
    failureCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    uid: "source-uid",
    platform: "airbnb",
    summary: "Joanne",
    startDate: "2026-08-19",
    endDate: "2026-08-23",
    ...overrides,
  };
}

describe("connected-stay cleaning boundaries", () => {
  it("uses Bolivia's calendar date before the UTC rollover", () => {
    expect(toOperationsDateStr(new Date("2026-08-25T03:30:00.000Z"))).toBe("2026-08-24");
  });

  it("removes the internal source-to-Direct cleaning and keeps final checkout", () => {
    const days = computeCleaningDays(
      property([reservation()]),
      [source()],
      [link()],
    );

    expect(days.filter((day) => day.type === "cleaning").map((day) => day.date)).toEqual([
      "2026-08-25",
    ]);
  });

  it("connects a Direct extension to the effective source-plus-claim union", () => {
    const claim = reservation({
      id: 2,
      checkIn: "2026-08-19T00:00:00.000Z",
      checkOut: "2026-08-25T00:00:00.000Z",
      platform: "airbnb",
      linkedEventRole: "claim",
    });
    const extension = reservation({
      id: 3,
      checkIn: "2026-08-25T00:00:00.000Z",
      checkOut: "2026-08-27T00:00:00.000Z",
    });

    const days = computeCleaningDays(
      property([claim, extension]),
      [source()],
      [link()],
    );

    expect(days.filter((day) => day.type === "cleaning").map((day) => day.date)).toEqual([
      "2026-08-27",
    ]);
  });

  it("uses platform plus UID and never links a same-UID event from another feed", () => {
    const bookingExtension = reservation({
      linkedEventPlatform: "booking",
    });
    const days = computeCleaningDays(
      property([bookingExtension]),
      [
        source(),
        source({
          id: 11,
          platform: "booking",
          startDate: "2026-08-28",
          endDate: "2026-08-30",
        }),
      ],
      [link()],
    );

    const cleaningDates = days
      .filter((day) => day.type === "cleaning")
      .map((day) => day.date);
    expect(cleaningDates).toContain("2026-08-23");
    expect(cleaningDates).toContain("2026-08-25");
  });

  it("keeps the narrow legacy null-role fallback for an exact adjacent source", () => {
    const legacyExtension = reservation({
      platform: "airbnb",
      linkedEventPlatform: null,
      linkedEventRole: null,
    });
    const days = computeCleaningDays(
      property([legacyExtension]),
      [source()],
      [link()],
    );

    expect(days.filter((day) => day.type === "cleaning").map((day) => day.date)).toEqual([
      "2026-08-25",
    ]);
  });

  it("carries both reservation ids into a same-day guest turnover", () => {
    const outgoing = reservation({
      id: 20,
      name: "Outgoing guest",
      checkIn: "2026-08-21T00:00:00.000Z",
      checkOut: "2026-08-23T00:00:00.000Z",
      linkedEventUid: null,
      linkedEventPlatform: null,
      linkedEventRole: null,
    });
    const incoming = reservation({
      id: 21,
      name: "Incoming guest",
      checkIn: "2026-08-23T00:00:00.000Z",
      checkOut: "2026-08-25T00:00:00.000Z",
      linkedEventUid: null,
      linkedEventPlatform: null,
      linkedEventRole: null,
    });

    const turnover = computeCleaningDays(property([outgoing, incoming]), [], [link()])
      .find((day) => day.date === "2026-08-23");

    expect(turnover).toMatchObject({
      kind: "turnover",
      prevReservationId: 20,
      nextReservationId: 21,
      hoursAvailable: 2,
    });
  });

  it("keeps an adjacent confirmed turnover visible when the channel link has buffers", () => {
    const outgoing = reservation({
      id: 30,
      name: "Bayron",
      checkIn: "2026-08-21T00:00:00.000Z",
      checkOut: "2026-08-25T00:00:00.000Z",
      linkedEventUid: null,
      linkedEventPlatform: null,
      linkedEventRole: null,
    });
    const incoming = reservation({
      id: 31,
      name: "Veronica",
      checkIn: "2026-08-25T00:00:00.000Z",
      checkOut: "2026-08-28T00:00:00.000Z",
      linkedEventUid: null,
      linkedEventPlatform: null,
      linkedEventRole: null,
    });

    const turnover = computeCleaningDays(
      property([outgoing, incoming]),
      [],
      [link({ bufferBefore: 1, bufferAfter: 1 })],
    ).find((day) => day.date === "2026-08-25");

    expect(turnover).toMatchObject({
      kind: "turnover",
      prevGuest: "Bayron",
      nextGuest: "Veronica",
      prevReservationId: 30,
      nextReservationId: 31,
      hoursAvailable: 2,
    });
  });

  it("keeps a departure on checkout day instead of shifting it by iCal buffers", () => {
    const outgoing = reservation({
      id: 40,
      name: "Imar Tarraga",
      checkIn: "2026-08-22T00:00:00.000Z",
      checkOut: "2026-08-25T00:00:00.000Z",
      linkedEventUid: null,
      linkedEventPlatform: null,
      linkedEventRole: null,
    });

    const cleanings = computeCleaningDays(
      property([outgoing]),
      [],
      [link({ bufferBefore: 1, bufferAfter: 1 })],
    ).filter((day) => day.type === "cleaning");

    expect(cleanings).toHaveLength(1);
    expect(cleanings[0]).toMatchObject({
      date: "2026-08-25",
      kind: "after",
      prevGuest: "Imar Tarraga",
      prevReservationId: 40,
    });
  });
});
