import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  listAccessiblePropertyIds: vi.fn(),
  propertyFindMany: vi.fn(),
}));

vi.mock("@/lib/messaging-auth", () => ({
  getMessagingAccess: mocks.getMessagingAccess,
}));
vi.mock("@/lib/ownership", () => ({
  listAccessiblePropertyIds: mocks.listAccessiblePropertyIds,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { property: { findMany: mocks.propertyFindMany } },
}));

import { GET } from "./route";

function request(query = "checkIn=2026-09-12&checkOut=2026-09-14") {
  return new NextRequest(`http://localhost/api/messaging/availability?${query}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T15:00:00.000Z"));
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "api_key",
  });
  mocks.listAccessiblePropertyIds.mockResolvedValue([2]);
  mocks.propertyFindMany.mockResolvedValue([
    {
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
    },
  ]);
});

describe("GET /api/messaging/availability", () => {
  it("returns only operational data needed by the assistant", async () => {
    const response = await GET(request("checkIn=2026-09-12&checkOut=2026-09-14&guests=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({
      checked: 1,
      available: 1,
      unavailable: 0,
      requiresHumanReview: 1,
    });
    expect(body.available[0]).toMatchObject({
      propertyName: "Sky Elite 329",
      dateStatus: "available",
      capacityVerified: false,
    });
    expect(body.warnings).toContain(
      "Guest capacity is not stored yet; date availability only",
    );
  });

  it("returns 404 without revealing an inaccessible property", async () => {
    const response = await GET(
      request("checkIn=2026-09-12&checkOut=2026-09-14&propertyId=99"),
    );
    expect(response.status).toBe(404);
    expect(mocks.propertyFindMany).not.toHaveBeenCalled();
  });

  it("rejects malformed dates before querying inventory", async () => {
    const response = await GET(request("checkIn=tomorrow&checkOut=2026-09-14"));
    expect(response.status).toBe(400);
    expect(mocks.propertyFindMany).not.toHaveBeenCalled();
  });
});
