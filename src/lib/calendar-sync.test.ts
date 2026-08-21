import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendarLinkFindMany: vi.fn(),
  calendarLinkUpdate: vi.fn(),
  calendarEventFindMany: vi.fn(),
  calendarEventUpsert: vi.fn(),
  calendarEventDeleteMany: vi.fn(),
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
        propertyId_platform_uid: {
          propertyId,
          platform: "airbnb",
          uid: "old-uid",
        },
      },
      create: {
        propertyId,
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
