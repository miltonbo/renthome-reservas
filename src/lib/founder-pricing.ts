import { prisma } from "@/lib/prisma";
import { FOUNDER_PRICING_LIMIT, parseFounderClaimCount } from "@/lib/founder-pricing-policy";
const FOUNDER_COUNTER_KEY = "founder_pricing_claimed";

export type PublicSignupUserData = {
  username: string;
  password: string;
  hasPassword?: boolean;
  email?: string | null;
  googleId?: string | null;
  role?: string;
};

/**
 * Creates a self-registered account and permanently grants the founder price
 * to the first ten completed registrations. The counter and user creation are
 * committed in one transaction, so a failed signup never consumes a slot.
 * Accounts created manually by an administrator intentionally use the normal
 * user creation path and do not consume this public-registration promotion.
 */
export async function createPublicSignupUser(data: PublicSignupUserData) {
  return prisma.$transaction(async (tx) => {
    // One SQLite statement claims the next number, preventing simultaneous
    // email/Google registrations from receiving the same founder slot.
    const claimedRows = await tx.$queryRawUnsafe<Array<{ value: string }>>(`
      INSERT INTO "SiteSetting" ("key", "value", "updatedAt")
      VALUES ('${FOUNDER_COUNTER_KEY}', '1', CURRENT_TIMESTAMP)
      ON CONFLICT("key") DO UPDATE SET
        "value" = CAST(CAST("value" AS INTEGER) + 1 AS TEXT),
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE CAST("value" AS INTEGER) < ${FOUNDER_PRICING_LIMIT}
      RETURNING "value"
    `);
    const founderNumber = claimedRows.length > 0
      ? parseFounderClaimCount(claimedRows[0]?.value)
      : null;

    return tx.user.create({
      data: {
        ...data,
        role: data.role ?? "user",
        founderNumber,
        founderPricingGrantedAt: founderNumber === null ? null : new Date(),
      },
    });
  });
}
