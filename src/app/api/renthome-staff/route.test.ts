import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const { db, available } = vi.hoisted(() => ({
  available: vi.fn(),
  db: {
    property: { findFirst: vi.fn() },
    rentHomeRequest: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    rentHomeListing: { findUnique: vi.fn() },
    reservation: { create: vi.fn() },
    dateOverride: { deleteMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ userId: 1, role: "admin" }) }));
vi.mock("@/lib/ownership", () => ({ canManageProperty: async () => true }));
vi.mock("@/lib/prisma", () => ({ prisma: { ...db, $transaction: (work: (tx: typeof db) => unknown) => work(db) } }));
vi.mock("@/lib/renthome", () => ({
  rentHomeOwner: () => 1,
  rentHomeDates: () => ({ nights: 2 }),
  rentHomeAvailability: available,
}));
vi.mock("@/lib/audit", () => ({ logAudit: async () => {} }));
vi.mock("@/lib/pricing-reservation-refresh", () => ({ recalculatePricingAfterReservation: async () => {} }));

function confirm() {
  return PATCH(new NextRequest("http://localhost/api/renthome-staff", {
    method: "PATCH",
    body: JSON.stringify({ id: 11, action: "confirm", propertyId: 5 }),
  }));
}

describe("RentHome staff confirmation with a physical department", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    available.mockResolvedValue(true);
    db.rentHomeRequest.findUnique.mockResolvedValue({
      id: 11, requestedPropertyId: 3, assignedPropertyId: null, units: [],
      checkIn: "2027-01-20", checkOut: "2027-01-22", guests: 2, totalMinor: 56_400,
    });
    db.property.findFirst.mockResolvedValue({ id: 5 });
    db.rentHomeRequest.updateMany.mockResolvedValue({ count: 1 });
    db.reservation.create.mockResolvedValue({ id: 99, propertyId: 5 });
  });

  it("assigns and confirms an unassigned request in a single submission", async () => {
    const result = await confirm();
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ reservationId: 99 });
    expect(db.rentHomeRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 11, state: "pending", assignedPropertyId: null },
      data: { state: "confirmed", assignedPropertyId: 5 },
    });
    expect(db.reservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ propertyId: 5, totalPrice: 564, nightlyPrice: 282 }),
    });
    expect(db.rentHomeRequest.update).toHaveBeenCalledWith({ where: { id: 11 }, data: { reservationId: 99 } });
  });

  it("rejects an unavailable department before creating a reservation", async () => {
    available.mockResolvedValueOnce(false);
    expect((await confirm()).status).toBe(409);
    expect(db.reservation.create).not.toHaveBeenCalled();
  });
});
