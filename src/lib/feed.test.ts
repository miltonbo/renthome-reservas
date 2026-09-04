import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseICal } from "@/lib/ical";

const mocks = vi.hoisted(() => ({
  propertyFindUnique: vi.fn(),
  calendarLinkFindMany: vi.fn(),
  dateOverrideFindMany: vi.fn(),
  calendarEventFindMany: vi.fn(),
  reservationFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    property: { findUnique: mocks.propertyFindUnique },
    calendarLink: { findMany: mocks.calendarLinkFindMany },
    dateOverride: { findMany: mocks.dateOverrideFindMany },
    calendarEvent: { findMany: mocks.calendarEventFindMany },
    reservation: { findMany: mocks.reservationFindMany },
  },
}));

import { generateFeed } from "./feed";

const source = {
  id: 1,
  propertyId: 12,
  platform: "airbnb",
  uid: "source-booking",
  summary: "Airbnb stay",
  startDate: "2099-08-19",
  endDate: "2099-08-23",
};

const extension = {
  id: 2,
  propertyId: 12,
  name: "Direct extension",
  checkIn: new Date("2099-08-23T00:00:00.000Z"),
  checkOut: new Date("2099-08-25T00:00:00.000Z"),
  platform: "direct",
  linkedEventUid: source.uid,
  linkedEventPlatform: "airbnb",
  linkedEventRole: "extension",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.propertyFindUnique.mockResolvedValue({
    name: "Apt 68",
    minNights: 1,
    bookingWindow: 36500,
  });
  mocks.calendarLinkFindMany.mockResolvedValue([
    { platform: "airbnb", bufferBefore: 0, bufferAfter: 0 },
    { platform: "booking", bufferBefore: 0, bufferAfter: 0 },
  ]);
  mocks.dateOverrideFindMany.mockResolvedValue([]);
  mocks.calendarEventFindMany.mockResolvedValue([source]);
  mocks.reservationFindMany.mockResolvedValue([extension]);
});

describe("generateFeed — Direct linked extensions", () => {
  it("keeps the current Bolivia checkout in the outbound query after UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T01:30:00.000Z")); // Sep 3, 21:30 in Bolivia
    try {
      await generateFeed(12, "airbnb");
      expect(mocks.reservationFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          checkOut: { gte: new Date("2026-09-03T00:00:00.000Z") },
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("blocks the Direct nights back to the source platform", async () => {
    const result = await generateFeed(12, "airbnb");
    expect(result).not.toHaveProperty("error");
    if ("error" in result) throw new Error(result.error);

    const events = parseICal(result.ical).filter(
      (event) => event.uid !== "renthome-placeholder",
    );
    expect(events).toEqual([
      expect.objectContaining({
        startDate: "2099-08-23",
        endDate: "2099-08-25",
      }),
    ]);
  });

  it("exports only the local Direct segment to another platform", async () => {
    const result = await generateFeed(12, "booking");
    expect(result).not.toHaveProperty("error");
    if ("error" in result) throw new Error(result.error);

    const events = parseICal(result.ical).filter(
      (event) => event.uid !== "renthome-placeholder",
    );
    expect(events).toEqual([
      expect.objectContaining({
        startDate: "2099-08-23",
        endDate: "2099-08-25",
      }),
    ]);
  });

  it("routes an explicitly marked extension as Direct during migration", async () => {
    mocks.reservationFindMany.mockResolvedValue([
      { ...extension, platform: "airbnb" },
    ]);

    const result = await generateFeed(12, "airbnb");
    if ("error" in result) throw new Error(result.error);
    const events = parseICal(result.ical).filter(
      (event) => event.uid !== "renthome-placeholder",
    );
    expect(events).toEqual([
      expect.objectContaining({
        startDate: "2099-08-23",
        endDate: "2099-08-25",
      }),
    ]);
  });

  it("never echoes imported calendar blocks into an outbound feed", async () => {
    mocks.reservationFindMany.mockResolvedValue([]);
    mocks.calendarEventFindMany.mockResolvedValue([
      { ...source, summary: "Not available" },
    ]);

    const result = await generateFeed(12, "airbnb");
    if ("error" in result) throw new Error(result.error);
    const events = parseICal(result.ical).filter((event) => event.uid !== "renthome-placeholder");
    expect(events).toEqual([]);
  });

  it("does not echo a reservation back to its own channel", async () => {
    mocks.reservationFindMany.mockResolvedValue([
      { ...extension, platform: "airbnb", linkedEventRole: "claim" },
    ]);

    const result = await generateFeed(12, "airbnb");
    if ("error" in result) throw new Error(result.error);
    const events = parseICal(result.ical).filter((event) => event.uid !== "renthome-placeholder");
    expect(events).toEqual([]);
  });

  it("exports exact reservation dates without cleaning buffers", async () => {
    mocks.calendarLinkFindMany.mockResolvedValue([
      { platform: "airbnb", bufferBefore: 3, bufferAfter: 3 },
    ]);

    const result = await generateFeed(12, "airbnb");
    if ("error" in result) throw new Error(result.error);
    const events = parseICal(result.ical).filter((event) => event.uid !== "renthome-placeholder");
    expect(events[0]).toEqual(expect.objectContaining({ startDate: "2099-08-23", endDate: "2099-08-25" }));
  });
});
