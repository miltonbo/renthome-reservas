import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendarLinkFindMany: vi.fn(),
  calendarLinkUpdate: vi.fn(),
  calendarEventFindMany: vi.fn(),
  calendarEventUpsert: vi.fn(),
  calendarEventDeleteMany: vi.fn(),
  calendarEventUpdateMany: vi.fn(),
  reservationFindMany: vi.fn(),
  reservationUpdateMany: vi.fn(),
  syncLogCreate: vi.fn(),
  syncLogFindMany: vi.fn(),
  syncLogDeleteMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarLink: {
      findMany: mocks.calendarLinkFindMany,
      update: mocks.calendarLinkUpdate,
    },
    calendarEvent: {
      findMany: mocks.calendarEventFindMany,
      upsert: mocks.calendarEventUpsert,
      deleteMany: mocks.calendarEventDeleteMany,
      updateMany: mocks.calendarEventUpdateMany,
    },
    reservation: {
      findMany: mocks.reservationFindMany,
      updateMany: mocks.reservationUpdateMany,
    },
    syncLog: {
      create: mocks.syncLogCreate,
      findMany: mocks.syncLogFindMany,
      deleteMany: mocks.syncLogDeleteMany,
    },
  },
}));

import { syncAllCalendars } from "./calendar-sync";

const propertyId = 12;
const link = {
  id: 3,
  propertyId,
  platform: "airbnb",
  icalExportUrl: "https://example.test/calendar.ics",
  property: { name: "Apt 68" },
};
const oldEvent = {
  id: 41,
  propertyId,
  platform: "airbnb",
  uid: "old-uid",
  summary: "Reserved",
  startDate: "2099-08-19",
  endDate: "2099-08-23",
};

function ical(events: Array<{ uid: string; start: string; end: string }>): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTART;VALUE=DATE:${event.start.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${event.end.replaceAll("-", "")}`,
      "SUMMARY:Reserved",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.calendarLinkFindMany.mockResolvedValue([link]);
  mocks.calendarLinkUpdate.mockResolvedValue({ ...link, failureCount: 0 });
  mocks.calendarEventDeleteMany.mockResolvedValue({ count: 1 });
  mocks.calendarEventUpsert.mockResolvedValue({});
  mocks.reservationUpdateMany.mockResolvedValue({ count: 2 });
  mocks.reservationFindMany.mockResolvedValue([]);
  mocks.syncLogCreate.mockResolvedValue({});
  mocks.syncLogFindMany.mockResolvedValue([]);
  mocks.syncLogDeleteMany.mockResolvedValue({ count: 0 });
});

describe("calendar sync — durable linked reservation metadata", () => {
  it("keeps multiple Booking feeds for the same property isolated by link id", async () => {
    const secondLink = {
      ...link,
      id: 4,
      platform: "booking",
      icalExportUrl: "https://example.test/booking-2.ics",
    };
    const firstBookingLink = {
      ...link,
      platform: "booking",
      icalExportUrl: "https://example.test/booking-1.ics",
    };
    mocks.calendarLinkFindMany.mockResolvedValue([firstBookingLink, secondLink]);
    mocks.calendarEventFindMany.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      const suffix = url.includes("booking-2") ? "two" : "one";
      return Promise.resolve(new Response(
        ical([{ uid: `booking-${suffix}`, start: "2099-09-10", end: "2099-09-12" }]),
        { status: 200 },
      ));
    }));

    const result = await syncAllCalendars({ propertyIds: [propertyId] });

    expect(result).toMatchObject({ propertiesSynced: 1, newEvents: 2, errors: 0 });
    expect(mocks.calendarEventFindMany).toHaveBeenNthCalledWith(1, {
      where: { calendarLinkId: firstBookingLink.id },
    });
    expect(mocks.calendarEventFindMany).toHaveBeenNthCalledWith(2, {
      where: { calendarLinkId: secondLink.id },
    });
    expect(mocks.calendarEventUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { calendarLinkId_uid: { calendarLinkId: firstBookingLink.id, uid: "booking-one" } },
    }));
    expect(mocks.calendarEventUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { calendarLinkId_uid: { calendarLinkId: secondLink.id, uid: "booking-two" } },
    }));
  });

  it.each(["2099-08-25", "2099-08-21"])("updates an unchanged claim when source checkout becomes %s, protecting local overrides and extensions", async (end) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      ical([{ uid: oldEvent.uid, start: oldEvent.startDate, end }]), { status: 200 },
    )));
    mocks.calendarEventFindMany.mockResolvedValueOnce([oldEvent]);
    await syncAllCalendars({ propertyIds: [propertyId] });
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: {
        propertyId, status: "confirmed", platform: "airbnb", linkedEventUid: oldEvent.uid,
        OR: [{ linkedEventPlatform: "airbnb" }, { linkedEventPlatform: null }],
        linkedEventRole: "claim", extensionOfId: null,
        extensions: { none: { status: "confirmed" } },
        checkIn: new Date(`${oldEvent.startDate}T00:00:00.000Z`),
        checkOut: new Date(`${oldEvent.endDate}T00:00:00.000Z`),
      },
      data: { checkIn: new Date(`${oldEvent.startDate}T00:00:00.000Z`), checkOut: new Date(`${end}T00:00:00.000Z`) },
    });
  });
  it("updates dates when the feed reuses an existing UID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          ical([{ uid: "old-uid", start: "2099-08-19", end: "2099-08-23" }]),
          { status: 200 },
        ),
      ),
    );
    mocks.calendarEventFindMany.mockResolvedValueOnce([
      { ...oldEvent, endDate: "2099-08-28" },
    ]);

    const result = await syncAllCalendars({ propertyIds: [propertyId] });

    expect(result).toMatchObject({
      propertiesSynced: 1,
      newEvents: 0,
      removedEvents: 0,
      errors: 0,
    });
    expect(mocks.calendarEventUpsert).toHaveBeenCalledWith({
      where: {
        calendarLinkId_uid: {
          calendarLinkId: link.id,
          uid: "old-uid",
        },
      },
      create: {
        propertyId,
        calendarLinkId: link.id,
        platform: "airbnb",
        uid: "old-uid",
        summary: "Reserved",
        startDate: "2099-08-19",
        endDate: "2099-08-23",
      },
      update: {
        summary: "Reserved",
        startDate: "2099-08-19",
        endDate: "2099-08-23",
      },
    });
  });

  it("migrates claims and extensions by exact source platform on UID reissue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          ical([{ uid: "new-uid", start: "2099-08-19", end: "2099-08-23" }]),
          { status: 200 },
        ),
      ),
    );
    mocks.calendarEventFindMany
      .mockResolvedValueOnce([oldEvent])
      .mockResolvedValueOnce([{ platform: "airbnb", uid: "new-uid" }]);
    mocks.reservationFindMany.mockResolvedValue([
      {
        id: 7,
        platform: "direct",
        linkedEventUid: "new-uid",
        linkedEventPlatform: "airbnb",
      },
    ]);

    const result = await syncAllCalendars({ propertyIds: [propertyId] });

    expect(result).toMatchObject({ propertiesSynced: 1, removedEvents: 1, errors: 0 });
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: {
        propertyId,
        linkedEventUid: "old-uid",
        OR: [
          { linkedEventPlatform: "airbnb" },
          { linkedEventPlatform: null, platform: "airbnb" },
        ],
      },
      data: { linkedEventUid: "new-uid" },
    });
  });

  it("unlinks every segment and clears all link fields when the source is cancelled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(ical([]), { status: 200 })),
    );
    mocks.calendarEventFindMany.mockResolvedValueOnce([oldEvent]);

    const result = await syncAllCalendars({ propertyIds: [propertyId] });

    expect(result).toMatchObject({ propertiesSynced: 1, removedEvents: 1, errors: 0 });
    expect(mocks.reservationUpdateMany).toHaveBeenCalledWith({
      where: {
        propertyId,
        linkedEventUid: "old-uid",
        OR: [
          { linkedEventPlatform: "airbnb" },
          { linkedEventPlatform: null, platform: "airbnb" },
        ],
      },
      data: {
        linkedEventUid: null,
        linkedEventPlatform: null,
        linkedEventRole: null,
      },
    });
  });
});
