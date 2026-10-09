import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canManageProperty: vi.fn(),
  logAudit: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/ownership", () => ({
  canManageProperty: mocks.canManageProperty,
  canReadProperty: vi.fn(),
  listAccessiblePropertyIds: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dateOverride: {
      findUnique: mocks.findUnique,
      findMany: vi.fn(),
      upsert: mocks.upsert,
      delete: mocks.delete,
    },
  },
}));

import { POST } from "./route";

describe("POST /api/date-overrides", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ userId: 7, role: "owner" });
    mocks.canManageProperty.mockResolvedValue(true);
  });

  it("updates an existing block and its reason instead of toggling it off", async () => {
    mocks.findUnique.mockResolvedValue({ id: 44, propertyId: 24, date: "2026-10-17", type: "closed", note: "Anterior" });
    mocks.upsert.mockResolvedValue({ id: 44, propertyId: 24, date: "2026-10-17", type: "closed", note: "Mantenimiento" });
    const request = new NextRequest("http://localhost/api/date-overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: 24, date: "2026-10-17", type: "closed", note: "  Mantenimiento  " }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { type: "closed", note: "Mantenimiento" },
    }));
    expect(await response.json()).toEqual(expect.objectContaining({ action: "created" }));
  });
});
