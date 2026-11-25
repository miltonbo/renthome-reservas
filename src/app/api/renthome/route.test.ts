import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const { db, catalog } = vi.hoisted(() => ({
  db: {
    rentHomeRequest: { create: vi.fn(), findMany: vi.fn() },
    reservation: { findFirst: vi.fn() },
  },
  catalog: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (work: (tx: typeof db) => unknown) => work(db) } }));
vi.mock("@/lib/renthome", () => ({
  rentHomeCatalog: catalog,
  rentHomeDates: (input: { checkIn: string; checkOut: string }) => ({ ...input, guests: 2 }),
}));
vi.mock("@/lib/messaging-availability", () => ({ boliviaDateString: () => "2026-11-25" }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ ok: true }) }));

function send(extra = {}) {
  return POST(new NextRequest("http://localhost/api/renthome", {
    method: "POST",
    body: JSON.stringify({
      propertyId: 5, checkIn: "2026-12-02", checkOut: "2026-12-04",
      totalMinor: 50_000, guestName: "Huésped de prueba", phone: "7000-0001", ...extra,
    }),
  }));
}

describe("RentHome direct request WhatsApp confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog.mockResolvedValue([{ id: 5, totalMinor: 50_000 }]);
    db.rentHomeRequest.create.mockResolvedValue({ id: 2 });
    db.rentHomeRequest.findMany.mockResolvedValue([]);
    db.reservation.findFirst.mockResolvedValue(null);
  });

  it("normalizes Bolivian numbers and searches previous formats", async () => {
    expect((await send()).status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phone: "+59170000001" }),
    }));
    expect(db.rentHomeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { not: 2 },
        phone: { in: ["+59170000001", "59170000001", "0059170000001", "70000001"] },
        OR: [{ state: "pending", checkOut: { gt: "2026-11-25" } }, { state: "confirmed", reservationId: { not: null } }],
      }),
    }));
  });

  it("asks for explicit confirmation before accepting a different stay", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{ state: "pending", requestedPropertyId: 20 }]);
    const warning = await send({ phone: "00591 70000001" });
    expect(warning.status).toBe(409);
    expect(await warning.json()).toEqual({ code: "active_request", error: expect.any(String) });
    expect((await send({ confirmAnother: true })).status).toBe(201);
  });

  it("rejects the same apartment and dates even after confirmation", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{
      state: "pending", requestedPropertyId: 5, checkIn: "2026-12-02", checkOut: "2026-12-04",
    }]);
    const duplicate = await send({ confirmAnother: true });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ code: "duplicate_request", error: expect.any(String) });
  });

  it("uses the linked booking's current status and checkout date", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{ state: "confirmed", reservationId: 90 }]);
    db.reservation.findFirst.mockResolvedValueOnce({ id: 90 });
    expect((await send()).status).toBe(409);
    expect(db.reservation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [90] }, status: "confirmed", checkOut: { gt: new Date("2026-11-25") } },
    }));
    expect((await send()).status).toBe(201);
  });
});
