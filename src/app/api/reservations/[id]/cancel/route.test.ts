import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManageProperty: vi.fn(),
  logAudit: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  movementFindMany: vi.fn(),
  movementCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/ownership", () => ({ canManageProperty: mocks.canManageProperty }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { reservation: { findUnique: mocks.findUnique, findMany: mocks.findMany, updateMany: mocks.updateMany }, moneyMovement: { findMany: mocks.movementFindMany, create: mocks.movementCreate }, $transaction: mocks.transaction },
}));

import { POST } from "./route";

const request = (reason?: unknown) => new NextRequest("http://localhost/api/reservations/7/cancel", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason }),
});
const refundRequest = (refunds: unknown[]) => new NextRequest("http://localhost/api/reservations/7/cancel", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Salida anticipada", refunds }),
});
const params = { params: Promise.resolve({ id: "7" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ userId: 3, role: "user" });
  mocks.canManageProperty.mockResolvedValue(true);
  mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: null, status: "confirmed" });
  mocks.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);
  mocks.movementFindMany.mockResolvedValue([{ currency: "BOB", amountMinor: 100000 }]);
  mocks.movementCreate.mockResolvedValue({ id: 99 });
  mocks.transaction.mockImplementation(async (callback) => callback({ reservation: { updateMany: mocks.updateMany }, moneyMovement: { create: mocks.movementCreate } }));
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

  it("records a refund as a negative movement for monthly reconciliation", async () => {
    mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: null, status: "confirmed", property: { financialOperator: "deysi" } });
    const response = await POST(refundRequest([{ amount: 400, currency: "BOB", paymentMethod: "qr", paidBy: "milton" }]), params);
    expect(response.status).toBe(200);
    expect(mocks.movementCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: "refund", amountMinor: -40000, currency: "BOB", paymentMethod: "qr", receivedBy: "milton",
      allocations: { create: [{ person: "deysi", amountMinor: -40000, percentageBps: 10000 }] },
    }) });
  });

  it("rejects refunds above the amount actually received in that currency", async () => {
    mocks.findUnique.mockResolvedValue({ id: 7, propertyId: 12, extensionOfId: null, status: "confirmed", property: { financialOperator: "deysi" } });
    const response = await POST(refundRequest([{ amount: 1200, currency: "BOB", paymentMethod: "cash", paidBy: "deysi" }]), params);
    expect(response.status).toBe(400);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.movementCreate).not.toHaveBeenCalled();
  });
});
