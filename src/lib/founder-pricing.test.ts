import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOUNDER_PRICING_LIMIT, parseFounderClaimCount } from "@/lib/founder-pricing-policy";

const mocks = vi.hoisted(() => ({
  claimFounderSlot: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      $queryRawUnsafe: mocks.claimFounderSlot,
      user: { create: mocks.createUser },
    }),
  },
}));

import { createPublicSignupUser } from "@/lib/founder-pricing";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createUser.mockImplementation(async ({ data }) => ({ id: 99, ...data }));
});

describe("founder pricing allocation", () => {
  it("starts at zero when the counter is absent or invalid", () => {
    expect(parseFounderClaimCount(undefined)).toBe(0);
    expect(parseFounderClaimCount("invalid")).toBe(0);
    expect(parseFounderClaimCount("-2")).toBe(0);
  });

  it("keeps valid claimed slots and caps them at the founder limit", () => {
    expect(parseFounderClaimCount("7")).toBe(7);
    expect(parseFounderClaimCount("100")).toBe(FOUNDER_PRICING_LIMIT);
  });
});

describe("public signup founder benefit", () => {
  it("assigns slot ten and stores the permanent benefit atomically", async () => {
    mocks.claimFounderSlot.mockResolvedValue([{ value: "10" }]);

    const user = await createPublicSignupUser({ username: "host@example.com", password: "hash" });

    expect(mocks.claimFounderSlot).toHaveBeenCalledOnce();
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ founderNumber: 10 }) });
    expect(user.founderNumber).toBe(10);
  });

  it("stops granting the benefit after the first ten completed registrations", async () => {
    mocks.claimFounderSlot.mockResolvedValue([]);

    const user = await createPublicSignupUser({ username: "later@example.com", password: "hash" });

    expect(mocks.claimFounderSlot).toHaveBeenCalledOnce();
    expect(mocks.createUser).toHaveBeenCalledWith({ data: expect.objectContaining({ founderNumber: null, founderPricingGrantedAt: null }) });
    expect(user.founderNumber).toBeNull();
  });
});
