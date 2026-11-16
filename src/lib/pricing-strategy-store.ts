import "server-only";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PRICING_STRATEGY,
  PRICING_STRATEGY_SETTINGS_KEY,
  normalizePricingStrategy,
  type PricingStrategyConfig,
} from "@/lib/pricing-strategy";

export async function getPricingStrategyConfig(): Promise<PricingStrategyConfig> {
  const row = await prisma.appSettings.findUnique({ where: { key: PRICING_STRATEGY_SETTINGS_KEY } });
  if (!row?.value) return DEFAULT_PRICING_STRATEGY;
  try {
    return normalizePricingStrategy(JSON.parse(row.value));
  } catch {
    return DEFAULT_PRICING_STRATEGY;
  }
}

export async function savePricingStrategyConfig(value: unknown): Promise<PricingStrategyConfig> {
  const strategy = normalizePricingStrategy(value);
  await prisma.appSettings.upsert({
    where: { key: PRICING_STRATEGY_SETTINGS_KEY },
    create: { key: PRICING_STRATEGY_SETTINGS_KEY, value: JSON.stringify(strategy) },
    update: { value: JSON.stringify(strategy) },
  });
  return strategy;
}
