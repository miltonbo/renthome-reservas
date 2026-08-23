import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManageProperty: vi.fn(),
  logAudit: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/ownership", () => ({ canManageProperty: mocks.canManageProperty }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { reservation: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } },
}));

import { POST } from "./route";

const request = (reason?: unknown) => new NextRequest("http://localhost/api/reservations/7/cancel", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason }),
});
const params = { params: Promise.resolve({ id: "7" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ userId: 3, role: "user" });
  mocks.canManageProperty.mockResolvedValue(true);
  mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: null, status: "confirmed" });
  mocks.updateMany.mockResolvedValue({ count: 2 });
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("POST /api/reservations/:id/cancel", () => {
  it("soft-cancels a root reservation and its extensions with an optional reason", async () => {
    const response = await POST(request("El huésped cambió de planes"), params);
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ id: 7 }, { extensionOfId: 7 }],
        status: "confirmed",
      },
      data: expect.objectContaining({
        status: "cancelled",
        cancellationReason: "El huésped cambió de planes",
        cancelledAt: expect.any(Date),
      }),
    }));
    expect(mocks.logAudit).toHaveBeenCalledWith(3, "update", "reservation", 7, expect.objectContaining({
      status: "cancelled",
      affectedReservations: 2,
    }));
  });

  it("cancels only the selected segment when it is an extension", async () => {
    mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: 4, status: "confirmed" });
    await POST(request(), params);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7, status: "confirmed" },
    }));
  });

  it("is idempotent for an already cancelled reservation", async () => {
    mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: null, status: "cancelled" });
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
