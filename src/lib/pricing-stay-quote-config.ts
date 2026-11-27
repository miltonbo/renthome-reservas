import "server-only";
import { prisma } from "@/lib/prisma";
import { getOfficialExchangeRate } from "@/lib/bcb-exchange-rate";
import { boliviaDateString } from "@/lib/messaging-availability";
import { getPricingStrategyConfig } from "@/lib/pricing-strategy-store";
import { nightlyFloorBobMinor, rentHomeMonthlyFloorBobMinor, type StayQuoteConfig } from "@/lib/pricing-stay-quote";

export async function getStayQuoteConfig(propertyIds: number[], rentHomeOwnerId: number | null, channels = ["direct", "airbnb", "booking"]): Promise<StayQuoteConfig> {
  const [policies, promotions, exchange, strategy] = await Promise.all([
    prisma.pricingPolicy.findMany({
      where: { propertyId: { in: propertyIds }, isActive: true, channel: { in: channels } },
      include: { property: { select: { name: true, userId: true } } },
    }),
    prisma.promotionPolicy.findMany({
      where: { propertyId: { in: propertyIds }, channel: { in: channels }, enabled: true },
      select: { propertyId: true, channel: true, promotionType: true, enabled: true, discountBps: true, stackable: true, minNights: true, minLeadDays: true, maxLeadDays: true },
    }),
    getOfficialExchangeRate(),
    getPricingStrategyConfig(),
  ]);
  return {
    policies: policies.map((policy) => {
      const isRentHome = policy.property.userId === rentHomeOwnerId;
      return {
        propertyId: policy.propertyId,
        channel: policy.channel,
        commissionBps: policy.commissionBps,
        floorBobMinor: nightlyFloorBobMinor(policy, exchange.bobPerUsd, isRentHome),
        monthlyFloorBobMinor: isRentHome ? rentHomeMonthlyFloorBobMinor(policy.property.name) : null,
        isRentHome,
        promotions: promotions.filter((promotion) => promotion.propertyId === policy.propertyId && promotion.channel === policy.channel),
      };
    }),
    bobPerUsd: exchange.bobPerUsd,
    gapPremiumBobMinor: strategy.oneNightGapPremiumBobMinor,
    today: boliviaDateString(),
  };
}
