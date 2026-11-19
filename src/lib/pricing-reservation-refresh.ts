import "server-only";

import { prisma } from "@/lib/prisma";
import { generateShadowPrices } from "@/lib/pricing-shadow";

export const RESERVATION_PRICE_REFRESH_DAYS = 4;

export type ReservationPriceRefreshResult = {
  ok: boolean;
  properties: number;
  recommendations: number;
  error?: string;
};

/**
 * Recalculate today plus the following three days whenever DeptosBO receives
 * a reservation. Availability is a portfolio-level signal, so the refresh
 * covers every property with an active policy, not only the booked unit.
 *
 * Reservation writes must remain durable even if pricing fails. The helper
 * therefore records the failure and returns it instead of rolling back a
 * successfully received booking.
 */
export async function recalculatePricingAfterReservation(
  source: "direct" | "calendar-sync" | "csv-import",
): Promise<ReservationPriceRefreshResult> {
  try {
    const policyRows = await prisma.pricingPolicy.findMany({
      where: { isActive: true },
      select: { propertyId: true },
      distinct: ["propertyId"],
    });
    const propertyIds = policyRows.map((row) => row.propertyId);
    if (propertyIds.length === 0) return { ok: true, properties: 0, recommendations: 0 };

    const result = await generateShadowPrices({
      propertyIds,
      days: RESERVATION_PRICE_REFRESH_DAYS,
    });
    await prisma.syncLog.create({
      data: {
        level: "success",
        message: `Pricing refreshed after ${source}: today + 3 days, ${result.properties} properties, ${result.recommendations} recommendations`,
      },
    });
    return { ok: true, properties: result.properties, recommendations: result.recommendations };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pricing] reservation refresh failed after ${source}:`, error);
    try {
      await prisma.syncLog.create({
        data: {
          level: "error",
          message: `Pricing refresh failed after ${source}: ${message}`,
        },
      });
    } catch {
      // The reservation is already stored; logging must not turn a pricing
      // failure into a false-negative booking response.
    }
    return { ok: false, properties: 0, recommendations: 0, error: message };
  }
}
