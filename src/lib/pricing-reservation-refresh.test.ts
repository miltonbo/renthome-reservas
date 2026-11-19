import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pricingPolicyFindMany: vi.fn(),
  syncLogCreate: vi.fn(),
  generateShadowPrices: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pricingPolicy: { findMany: mocks.pricingPolicyFindMany },
    syncLog: { create: mocks.syncLogCreate },
  },
}));
vi.mock("@/lib/pricing-shadow", () => ({
  generateShadowPrices: mocks.generateShadowPrices,
}));

import {
  recalculatePricingAfterReservation,
  RESERVATION_PRICE_REFRESH_DAYS,
} from "./pricing-reservation-refresh";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pricingPolicyFindMany.mockResolvedValue([{ propertyId: 2 }, { propertyId: 8 }]);
  mocks.generateShadowPrices.mockResolvedValue({ properties: 2, recommendations: 8 });
  mocks.syncLogCreate.mockResolvedValue({});
});

describe("reservation-triggered pricing refresh", () => {
  it("recalculates today and the following three days for the full portfolio", async () => {
    const result = await recalculatePricingAfterReservation("direct");

    expect(RESERVATION_PRICE_REFRESH_DAYS).toBe(4);
    expect(mocks.generateShadowPrices).toHaveBeenCalledWith({ propertyIds: [2, 8], days: 4 });
    expect(result).toEqual({ ok: true, properties: 2, recommendations: 8 });
  });

  it("keeps the received reservation durable and records a pricing failure", async () => {
    mocks.generateShadowPrices.mockRejectedValue(new Error("pricing unavailable"));

    const result = await recalculatePricingAfterReservation("calendar-sync");

    expect(result).toMatchObject({ ok: false, error: "pricing unavailable" });
    expect(mocks.syncLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ level: "error" }),
    });
  });
});
