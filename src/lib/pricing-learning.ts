export type DurationBand = "short" | "weekly" | "extended" | "monthly";

export type PricingLearningStat = {
  propertyId: number;
  channel: string;
  exposureNights: number;
  bookedNights: number;
  bookingCount: number;
};

export type PricingLearningResult = PricingLearningStat & {
  sellThroughBps: number;
  peerSellThroughBps: number;
  adjustmentBps: number;
  confidenceBps: number;
};

export function durationBand(nights: number): DurationBand {
  if (nights >= 28) return "monthly";
  if (nights >= 14) return "extended";
  if (nights >= 7) return "weekly";
  return "short";
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

/**
 * Produces a deliberately small price adjustment from relative sell-through.
 * The peer baseline is channel-specific and the result shrinks strongly toward
 * zero until enough expired exposure dates exist. Floors are never changed.
 */
export function computePricingLearning(stats: PricingLearningStat[]): PricingLearningResult[] {
  const channelTotals = new Map<string, { exposureNights: number; bookedNights: number }>();
  for (const stat of stats) {
    const current = channelTotals.get(stat.channel) || { exposureNights: 0, bookedNights: 0 };
    current.exposureNights += Math.max(0, stat.exposureNights);
    current.bookedNights += Math.max(0, Math.min(stat.bookedNights, stat.exposureNights));
    channelTotals.set(stat.channel, current);
  }

  return stats.map((stat) => {
    const exposureNights = Math.max(0, Math.trunc(stat.exposureNights));
    const bookedNights = Math.max(0, Math.min(Math.trunc(stat.bookedNights), exposureNights));
    const totals = channelTotals.get(stat.channel) || { exposureNights: 0, bookedNights: 0 };
    const sellThroughBps = exposureNights > 0 ? Math.round(bookedNights * 10_000 / exposureNights) : 0;
    const peerSellThroughBps = totals.exposureNights > 0
      ? Math.round(totals.bookedNights * 10_000 / totals.exposureNights)
      : 0;
    const confidenceBps = exposureNights < 14 ? 0 : bounded(exposureNights * 10_000 / (exposureNights + 30), 0, 9_000);
    // A 20 percentage-point advantage versus peers is at most a +5% raw
    // signal, then sample-size shrinkage reduces it further.
    const rawAdjustmentBps = Math.round((sellThroughBps - peerSellThroughBps) / 4);
    const adjustmentBps = confidenceBps === 0
      ? 0
      : bounded(rawAdjustmentBps * confidenceBps / 10_000, -500, 500);
    return {
      ...stat,
      exposureNights,
      bookedNights,
      sellThroughBps,
      peerSellThroughBps,
      adjustmentBps,
      confidenceBps,
    };
  });
}
