import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

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
  rentHomeDates: (input: { checkIn: string; checkOut: string; guests?: string }) => ({ ...input, guests: Number(input.guests ?? 2) }),
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
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    catalog.mockResolvedValue([{ id: 5, details: { title: "Departamento A", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0 }]);
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

  it("displays and stores the calendar total with the stay discount already included", async () => {
    catalog.mockResolvedValue([{ id: 5, details: { title: "Departamento A", capacity: 3 }, totalMinor: 174_370, savingsMinor: 11_130 }]);
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-09&guests=3"));
    expect(await response.json()).toMatchObject({ listings: [{ totalMinor: 209_244, savingsMinor: 13_356 }] });

    const booking = { checkOut: "2026-12-09", guests: "3" };
    expect((await send({ ...booking, totalMinor: 222_600 })).status).toBe(409);
    expect((await send({ ...booking, totalMinor: 209_244 })).status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ totalMinor: 209_244 }),
    }));
  });

  it("asks for explicit confirmation before accepting a different stay", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{ state: "pending", requestedPropertyId: 20, units: [] }]);
    const warning = await send({ phone: "00591 70000001" });
    expect(warning.status).toBe(409);
    expect(await warning.json()).toEqual({ code: "active_request", error: expect.any(String) });
    expect((await send({ confirmAnother: true })).status).toBe(201);
  });

  it("rejects the same apartment and dates even after confirmation", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{
      state: "pending", requestedPropertyId: 5, checkIn: "2026-12-02", checkOut: "2026-12-04", units: [],
    }]);
    const duplicate = await send({ confirmAnother: true });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ code: "duplicate_request", error: expect.any(String) });
  });

  it("uses the linked booking's current status and checkout date", async () => {
    db.rentHomeRequest.findMany.mockResolvedValue([{ state: "confirmed", reservationId: 90, units: [] }]);
    db.reservation.findFirst.mockResolvedValueOnce({ id: 90 });
    expect((await send()).status).toBe(409);
    expect(db.reservation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [90] }, status: "confirmed", checkOut: { gt: new Date("2026-11-25") } },
    }));
    expect((await send()).status).toBe(201);
  });

  it("returns a same-building pair for five guests even when neither listing fits alone", async () => {
    catalog.mockResolvedValue([
      { id: 5, building: "Sky Elite", details: { title: "Departamento A", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0 },
      { id: 6, building: "Sky Elite", details: { title: "Departamento B", capacity: 3 }, totalMinor: 60_000, savingsMinor: 0 },
      { id: 7, building: "Sky Moon", details: { title: "Departamento C", capacity: 3 }, totalMinor: 40_000, savingsMinor: 0 },
    ]);
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=5"));
    expect(await response.json()).toMatchObject({ listings: [], groups: [{
      building: "Sky Elite", totalMinor: 122_000,
      units: [{ propertyId: 5, guests: 2, totalMinor: 50_000 }, { propertyId: 6, guests: 3, totalMinor: 72_000 }],
    }] });
  });

  it("offers three units when two cannot hold the group", async () => {
    catalog.mockResolvedValue([5, 6, 7].map((id) => ({
      id, building: "Sky Elite", details: { title: "Departamento", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0,
    })));
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=5"));
    const result = await response.json();
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].units.map((unit: { guests: number }) => unit.guests)).toEqual([2, 2, 1]);
  });

  it("returns every valid same-building combination before considering other buildings", async () => {
    vi.stubEnv("RENTHOME_BUILDING_LOCATIONS", JSON.stringify({ "Sky Elite": [0, 0], "Sky Moon": [0, 0.01] }));
    catalog.mockResolvedValue([5, 6, 7, 8].map((id) => ({
      id, building: id === 8 ? "Sky Moon" : "Sky Elite", details: { title: "Departamento", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0,
    })));
    const url = "http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=3";
    const preview = await (await GET(new NextRequest(url))).json();
    const { groups, listings, groupCount } = await (await GET(new NextRequest(`${url}&groups=all`))).json();
    expect(preview.groupCount).toBe(4);
    expect(preview.groups).toEqual(groups.slice(0, 3));
    expect(groupCount).toBe(4);
    expect(listings).toEqual([]);
    expect(groups).toHaveLength(4);
    expect(groups.every((group: { building: string; distanceMeters: number }) => group.building === "Sky Elite" && group.distanceMeters === 0)).toBe(true);
  });

  it("ranks nearby buildings first when no building fits and records the chosen units", async () => {
    vi.stubEnv("RENTHOME_BUILDING_LOCATIONS", JSON.stringify({
      "Sky Elite": [0, 0], "Sky Luxia": [0, 0.001], "Sky Moon": [0, 0.01],
    }));
    catalog.mockResolvedValue(["Sky Moon", "Sky Elite", "Sky Luxia"].map((building, index) => ({
      id: index + 5, building, details: { title: building, capacity: 2 }, totalMinor: 50_000, savingsMinor: 0,
    })));
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=4&groups=all"));
    const { groups } = await response.json();
    expect(groups).toHaveLength(4);
    const distances = groups.map((group: { distanceMeters: number }) => group.distanceMeters);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    expect(distances[0]).toBe(110);
    const firstUnits = [
      { propertyId: 6, guests: 2, totalMinor: 50_000 }, { propertyId: 7, guests: 2, totalMinor: 50_000 },
    ];
    expect(groups[0].units).toMatchObject(firstUnits);
    expect((await send({ guests: "4", units: firstUnits, totalMinor: 100_000 })).status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ units: { create: firstUnits } }),
    }));
  });

  it("returns the property's approximate map position without exposing the building pin", async () => {
    vi.stubEnv("RENTHOME_BUILDING_LOCATIONS", JSON.stringify({ "Sky Elite": [-17.70041, -63.10062] }));
    catalog.mockResolvedValue([
      { id: 5, building: "Sky Elite", details: { title: "Departamento A", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0 },
      { id: 6, building: "Por ubicar", details: { title: "Departamento B", capacity: 2 }, totalMinor: 55_000, savingsMinor: 0 },
    ]);
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=2"));
    const { listings } = await response.json();
    expect(listings.map((listing: { mapLocation: [number, number] | null }) => listing.mapLocation))
      .toEqual([[-17.7004, -63.1006], null]);
    expect(listings[0]).not.toHaveProperty("building");
  });

  it("quotes and stores two guests per unit when both can hold two", async () => {
    catalog.mockResolvedValue([
      { id: 5, building: "Sky Elite", details: { title: "Departamento A", capacity: 3 }, totalMinor: 50_000, savingsMinor: 0 },
      { id: 6, building: "Sky Elite", details: { title: "Departamento B", capacity: 2 }, totalMinor: 60_000, savingsMinor: 0 },
    ]);
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=4"));
    const result = await response.json();
    const units = [
      { propertyId: 5, guests: 2, totalMinor: 50_000 },
      { propertyId: 6, guests: 2, totalMinor: 60_000 },
    ];
    expect(result.groups).toMatchObject([{ units, totalMinor: 110_000 }]);
    expect((await send({ guests: "4", units, totalMinor: 110_000 })).status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ units: { create: units } }),
    }));
  });

  it("charges the third guest only when all three stay in one unit", async () => {
    catalog.mockResolvedValue([
      { id: 5, building: "Sky Elite", details: { title: "Departamento A", capacity: 3 }, totalMinor: 50_000, savingsMinor: 0 },
      { id: 6, building: "Sky Elite", details: { title: "Departamento B", capacity: 2 }, totalMinor: 60_000, savingsMinor: 0 },
    ]);
    const response = await GET(new NextRequest("http://localhost/api/renthome?checkIn=2026-12-02&checkOut=2026-12-04&guests=3"));
    expect(await response.json()).toMatchObject({
      listings: [{ id: 5, totalMinor: 60_000 }],
      groups: [{ totalMinor: 110_000, units: [
        { propertyId: 5, guests: 2, totalMinor: 50_000 }, { propertyId: 6, guests: 1, totalMinor: 60_000 },
      ] }],
    });
    expect((await send({ guests: "3" })).status).toBe(409);
    expect((await send({ guests: "3", totalMinor: 60_000 })).status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ guests: 3, totalMinor: 60_000 }),
    }));
  });

  it("stores the price and occupancy of both units and rejects stale per-unit prices", async () => {
    catalog.mockResolvedValue([
      { id: 5, building: "Sky Elite", details: { title: "Departamento A", capacity: 2 }, totalMinor: 50_000, savingsMinor: 0 },
      { id: 6, building: "Sky Elite", details: { title: "Departamento B", capacity: 3 }, totalMinor: 60_000, savingsMinor: 0 },
    ]);
    const units = [{ propertyId: 5, totalMinor: 50_000 }, { propertyId: 6, totalMinor: 72_000 }];
    const response = await send({ guests: "5", units, totalMinor: 122_000 });
    expect(response.status).toBe(201);
    expect(db.rentHomeRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      guests: 5, totalMinor: 122_000, units: { create: [
        { ...units[0], guests: 2 }, { ...units[1], guests: 3 },
      ] },
    }) }));
    expect((await send({ guests: "5", units: [{ propertyId: 5, totalMinor: 49_000 }, { propertyId: 6, totalMinor: 73_000 }], totalMinor: 122_000 })).status).toBe(409);
    expect(db.rentHomeRequest.create).toHaveBeenCalledTimes(1);
  });
});
