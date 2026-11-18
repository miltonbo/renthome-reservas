import "server-only";

import { prisma } from "@/lib/prisma";
import { computePricingLearning, durationBand, type PricingLearningStat } from "@/lib/pricing-learning";

export const PRICING_FEEDBACK_MODEL_VERSION = "pricing-feedback-v1";

export type PricingRecommendationRecord = {
  propertyId: number;
  channel: string;
  stayDate: string;
  previousMinor?: number | null;
  recommendedMinor: number;
  currency: string;
  floorMinor: number;
  floorCurrency: string;
  promotionBps: number;
  commissionBps: number;
  minNights: number;
  availableRatioBps: number;
  leadDays: number;
  eventImpactBps: number;
  learningAdjustmentBps: number;
  reasonSummary: string;
};

export type PricingExposureInput = {
  propertyId: number;
  channel: string;
  stayDate: string;
  priceMinor: number;
  currency: string;
  promotionBps?: number;
  minNights?: number;
  availableUnits?: number;
  decisionId?: number | null;
  source?: string;
  observedAt?: Date;
};

export type PricingPerformanceMetricInput = {
  propertyId: number;
  channel: string;
  metric: string;
  periodStart: string;
  periodEnd: string;
  dimensionKey?: string;
  valueScaled: number;
  scale?: number;
  currency?: string | null;
  source?: string;
};

const METRICS = new Set([
  "search_impressions", "listing_views", "bookings", "conversion_bps", "wishlist_additions",
  "booking_lead_days", "room_nights", "revenue", "adr", "pace_room_nights",
  "pace_revenue", "search_length_of_stay_share_bps", "search_booking_window_share_bps",
]);

function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function dateKey(value: Date): string { return value.toISOString().slice(0, 10); }
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}
function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
}
function key(propertyId: number, channel: string, stayDate: string): string {
  return `${propertyId}:${channel}:${stayDate}`;
}
function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0)));
}

export async function persistPricingRecommendations(records: PricingRecommendationRecord[]): Promise<number> {
  const candidates = records.filter((row) => validDate(row.stayDate) && row.recommendedMinor >= 0);
  if (candidates.length === 0) return 0;
  const propertyIds = [...new Set(candidates.map((row) => row.propertyId))];
  const channels = [...new Set(candidates.map((row) => row.channel))];
  const dates = candidates.map((row) => row.stayDate).sort();
  const existing = await prisma.pricingDecision.findMany({
    where: {
      propertyId: { in: propertyIds }, channel: { in: channels },
      stayDate: { gte: dates[0], lte: dates.at(-1)! },
    },
    orderBy: { calculatedAt: "desc" },
  });
  const latest = new Map<string, typeof existing[number]>();
  for (const row of existing) {
    const rowKey = key(row.propertyId, row.channel, row.stayDate);
    if (!latest.has(rowKey)) latest.set(rowKey, row);
  }

  const now = new Date();
  const changed: PricingRecommendationRecord[] = [];
  const supersededIds: number[] = [];
  for (const row of candidates) {
    const previous = latest.get(key(row.propertyId, row.channel, row.stayDate));
    const materiallyEqual = previous &&
      previous.recommendedMinor === row.recommendedMinor && previous.currency === row.currency &&
      previous.floorMinor === row.floorMinor && previous.floorCurrency === row.floorCurrency &&
      previous.promotionBps === row.promotionBps && previous.minNights === row.minNights &&
      previous.status !== "failed";
    if (materiallyEqual) continue;
    if (previous?.status === "proposed") supersededIds.push(previous.id);
    changed.push(row);
  }
  if (supersededIds.length > 0) {
    await prisma.pricingDecision.updateMany({
      where: { id: { in: supersededIds } }, data: { status: "superseded", supersededAt: now },
    });
  }
  if (changed.length > 0) {
    await prisma.pricingDecision.createMany({ data: changed.map((row) => ({
      propertyId: row.propertyId, channel: row.channel, stayDate: row.stayDate,
      previousMinor: row.previousMinor ?? null, recommendedMinor: bounded(row.recommendedMinor, 0, 100_000_000),
      currency: row.currency, floorMinor: bounded(row.floorMinor, 0, 100_000_000), floorCurrency: row.floorCurrency,
      promotionBps: bounded(row.promotionBps, 0, 9_999), commissionBps: bounded(row.commissionBps, 0, 9_999),
      minNights: bounded(row.minNights, 1, 365), availableRatioBps: bounded(row.availableRatioBps, 0, 10_000),
      leadDays: bounded(row.leadDays, 0, 3_650), eventImpactBps: bounded(row.eventImpactBps, -5_000, 20_000),
      learningAdjustmentBps: bounded(row.learningAdjustmentBps, -500, 500),
      reasonSummary: row.reasonSummary.slice(0, 2_000), modelVersion: PRICING_FEEDBACK_MODEL_VERSION,
    })) });
  }
  return changed.length;
}

export async function recordAppliedPricingResults(options: {
  channel: string;
  results: Array<{
    propertyId: number; date: string; requestedMinor: number; previousMinor?: number | null;
    observedMinor?: number | null; requestedMinNights?: number; observedMinNights?: number | null;
    status: "verified" | "mismatch" | "failed";
  }>;
  appliedAt?: Date;
}) {
  const results = options.results.filter((row) => validDate(row.date));
  if (results.length === 0) return { decisions: 0, exposures: 0 };
  const propertyIds = [...new Set(results.map((row) => row.propertyId))];
  const dates = results.map((row) => row.date).sort();
  const [decisions, policies, dailyPrices] = await Promise.all([
    prisma.pricingDecision.findMany({
      where: { propertyId: { in: propertyIds }, channel: options.channel, stayDate: { gte: dates[0], lte: dates.at(-1)! } },
      orderBy: { calculatedAt: "desc" },
    }),
    prisma.pricingPolicy.findMany({ where: { propertyId: { in: propertyIds }, channel: options.channel } }),
    prisma.dailyPrice.findMany({ where: { propertyId: { in: propertyIds }, date: { gte: dates[0], lte: dates.at(-1)! } } }),
  ]);
  const decisionMap = new Map<string, typeof decisions[number][]>();
  for (const decision of decisions) {
    const decisionKey = key(decision.propertyId, decision.channel, decision.stayDate);
    const rows = decisionMap.get(decisionKey) || [];
    rows.push(decision);
    decisionMap.set(decisionKey, rows);
  }
  const policyMap = new Map(policies.map((row) => [row.propertyId, row]));
  const dailyMap = new Map(dailyPrices.map((row) => [`${row.propertyId}:${row.date}`, row]));
  const appliedAt = options.appliedAt || new Date();
  let storedDecisions = 0;
  const exposureInputs: PricingExposureInput[] = [];
  for (const result of results) {
    const candidates = decisionMap.get(key(result.propertyId, options.channel, result.date)) || [];
    const decision = candidates.find((row) => row.recommendedMinor === result.requestedMinor) || candidates[0];
    const appliedMinor = result.status === "failed" ? null : result.observedMinor ?? result.requestedMinor;
    const status = result.status === "verified" ? "applied" : result.status;
    if (decision) {
      await prisma.pricingDecision.update({ where: { id: decision.id }, data: {
        status, previousMinor: result.previousMinor ?? decision.previousMinor,
        appliedMinor, appliedAt: result.status === "failed" ? null : appliedAt,
      } });
      storedDecisions++;
      if (appliedMinor != null) exposureInputs.push({
        propertyId: result.propertyId, channel: options.channel, stayDate: result.date,
        priceMinor: appliedMinor, currency: decision.currency, promotionBps: decision.promotionBps,
        minNights: result.observedMinNights || result.requestedMinNights || decision.minNights,
        decisionId: decision.id, source: "automation_verification", observedAt: appliedAt,
      });
      continue;
    }
    const policy = policyMap.get(result.propertyId);
    const daily = dailyMap.get(`${result.propertyId}:${result.date}`);
    if (!policy) continue;
    const created = await prisma.pricingDecision.create({ data: {
      propertyId: result.propertyId, channel: options.channel, stayDate: result.date, status,
      previousMinor: result.previousMinor ?? null, recommendedMinor: result.requestedMinor, appliedMinor,
      currency: policy.currency, floorMinor: policy.floorMinor, floorCurrency: policy.floorCurrency,
      commissionBps: policy.commissionBps, minNights: result.requestedMinNights || policy.defaultMinNights,
      reasonSummary: daily?.reasonSummary || "Aplicación automática sin propuesta histórica disponible.",
      modelVersion: PRICING_FEEDBACK_MODEL_VERSION, appliedAt: result.status === "failed" ? null : appliedAt,
    } });
    storedDecisions++;
    if (appliedMinor != null) exposureInputs.push({
      propertyId: result.propertyId, channel: options.channel, stayDate: result.date,
      priceMinor: appliedMinor, currency: policy.currency,
      minNights: result.observedMinNights || result.requestedMinNights || policy.defaultMinNights,
      decisionId: created.id, source: "automation_verification", observedAt: appliedAt,
    });
  }
  const exposures = await recordPricingExposures(exposureInputs);
  return { decisions: storedDecisions, exposures };
}

export async function recordPricingExposures(inputs: PricingExposureInput[]): Promise<number> {
  const deduped = new Map<string, PricingExposureInput>();
  for (const input of inputs) {
    if (!validDate(input.stayDate) || input.priceMinor < 0) continue;
    deduped.set(key(input.propertyId, input.channel, input.stayDate), input);
  }
  const rows = [...deduped.values()];
  if (rows.length === 0) return 0;
  const propertyIds = [...new Set(rows.map((row) => row.propertyId))];
  const channels = [...new Set(rows.map((row) => row.channel))];
  const dates = rows.map((row) => row.stayDate).sort();
  const [active, decisions] = await Promise.all([
    prisma.pricingExposure.findMany({
      where: { propertyId: { in: propertyIds }, channel: { in: channels }, stayDate: { gte: dates[0], lte: dates.at(-1)! }, endedAt: null },
    }),
    prisma.pricingDecision.findMany({
      where: { propertyId: { in: propertyIds }, channel: { in: channels }, stayDate: { gte: dates[0], lte: dates.at(-1)! }, status: { in: ["applied", "mismatch", "proposed"] } },
      orderBy: { calculatedAt: "desc" },
    }),
  ]);
  const activeMap = new Map(active.map((row) => [key(row.propertyId, row.channel, row.stayDate), row]));
  const decisionMap = new Map<string, typeof decisions[number]>();
  for (const decision of decisions) {
    const decisionKey = key(decision.propertyId, decision.channel, decision.stayDate);
    if (!decisionMap.has(decisionKey)) decisionMap.set(decisionKey, decision);
  }

  const operations = [];
  for (const input of rows) {
    const rowKey = key(input.propertyId, input.channel, input.stayDate);
    const previous = activeMap.get(rowKey);
    const observedAt = input.observedAt || new Date();
    const promotionBps = bounded(input.promotionBps || 0, 0, 9_999);
    const minNights = bounded(input.minNights || 2, 1, 365);
    const availableUnits = bounded(input.availableUnits ?? 1, 0, 100);
    const matchedDecision = decisionMap.get(rowKey);
    const decisionId = input.decisionId ?? (
      matchedDecision && (matchedDecision.appliedMinor ?? matchedDecision.recommendedMinor) === input.priceMinor
        ? matchedDecision.id : null
    );
    const same = previous && previous.priceMinor === input.priceMinor && previous.currency === input.currency &&
      previous.promotionBps === promotionBps && previous.minNights === minNights && previous.availableUnits === availableUnits;
    if (same) {
      operations.push(prisma.pricingExposure.update({ where: { id: previous.id }, data: {
        lastObservedAt: observedAt, observationCount: { increment: 1 }, decisionId: previous.decisionId || decisionId,
      } }));
    } else {
      if (previous) operations.push(prisma.pricingExposure.update({ where: { id: previous.id }, data: { endedAt: observedAt } }));
      operations.push(prisma.pricingExposure.create({ data: {
        propertyId: input.propertyId, channel: input.channel, stayDate: input.stayDate,
        priceMinor: bounded(input.priceMinor, 0, 100_000_000), currency: input.currency,
        promotionBps, minNights, availableUnits, decisionId,
        source: (input.source || "platform_snapshot").slice(0, 80), startedAt: observedAt, lastObservedAt: observedAt,
      } }));
    }
  }
  for (let offset = 0; offset < operations.length; offset += 200) {
    await prisma.$transaction(operations.slice(offset, offset + 200));
  }
  return rows.length;
}

export async function ingestChannelPerformanceMetrics(inputs: PricingPerformanceMetricInput[]): Promise<number> {
  let stored = 0;
  for (const input of inputs.slice(0, 5_000)) {
    if (!METRICS.has(input.metric) || !validDate(input.periodStart) || !validDate(input.periodEnd) || input.periodStart > input.periodEnd) continue;
    const dimensionKey = (input.dimensionKey || "all").trim().slice(0, 120) || "all";
    const source = (input.source || "platform").trim().slice(0, 80) || "platform";
    await prisma.channelPerformanceMetric.upsert({
      where: { propertyId_channel_metric_periodStart_periodEnd_dimensionKey_source: {
        propertyId: input.propertyId, channel: input.channel, metric: input.metric,
        periodStart: input.periodStart, periodEnd: input.periodEnd, dimensionKey, source,
      } },
      create: {
        propertyId: input.propertyId, channel: input.channel, metric: input.metric,
        periodStart: input.periodStart, periodEnd: input.periodEnd, dimensionKey,
        valueScaled: Math.trunc(input.valueScaled), scale: bounded(input.scale || 1, 1, 1_000_000),
        currency: input.currency?.slice(0, 10) || null, source,
      },
      update: {
        valueScaled: Math.trunc(input.valueScaled), scale: bounded(input.scale || 1, 1, 1_000_000),
        currency: input.currency?.slice(0, 10) || null, collectedAt: new Date(),
      },
    });
    stored++;
  }
  return stored;
}

export async function refreshPricingOutcomes(now = new Date(), lookbackDays = 550): Promise<number> {
  const from = new Date(now.getTime() - lookbackDays * 86_400_000);
  const reservations = await prisma.reservation.findMany({
    where: {
      extensionOfId: null,
      createdAt: { gte: from },
      platform: { in: ["airbnb", "booking"] },
    },
    select: {
      id: true, propertyId: true, bookingOriginalPropertyId: true, platform: true, checkIn: true, checkOut: true, createdAt: true,
      nightlyPrice: true, totalPrice: true, priceCurrency: true, status: true,
    },
  });
  if (reservations.length === 0) return 0;
  const propertyIds = [...new Set(reservations.map((row) =>
    row.platform === "booking" ? row.bookingOriginalPropertyId || row.propertyId : row.propertyId,
  ))];
  const checkInDates = reservations.map((row) => dateKey(row.checkIn)).sort();
  const exposures = await prisma.pricingExposure.findMany({
    where: { propertyId: { in: propertyIds }, stayDate: { gte: checkInDates[0], lte: checkInDates.at(-1)! } },
    orderBy: { lastObservedAt: "desc" },
  });
  const exposureMap = new Map<string, typeof exposures>();
  for (const exposure of exposures) {
    const exposureKey = key(exposure.propertyId, exposure.channel, exposure.stayDate);
    const values = exposureMap.get(exposureKey) || [];
    values.push(exposure);
    exposureMap.set(exposureKey, values);
  }

  for (const reservation of reservations) {
    const attributionPropertyId = reservation.platform === "booking"
      ? reservation.bookingOriginalPropertyId || reservation.propertyId
      : reservation.propertyId;
    const nights = Math.max(1, Math.round((reservation.checkOut.getTime() - reservation.checkIn.getTime()) / 86_400_000));
    const candidates = exposureMap.get(key(attributionPropertyId, reservation.platform, dateKey(reservation.checkIn))) || [];
    const exact = candidates.find((exposure) => exposure.startedAt <= reservation.createdAt && (!exposure.endedAt || exposure.endedAt >= reservation.createdAt));
    const nearest = exact || candidates.find((exposure) => exposure.lastObservedAt <= reservation.createdAt) || candidates[0];
    const imported = reservation.createdAt >= reservation.checkIn;
    const attributionQuality = imported ? "imported" : exact ? "exact" : nearest ? "nearest" : "unattributed";
    const totalMinor = reservation.totalPrice == null ? null : Math.max(0, Math.round(reservation.totalPrice * 100));
    const nightlyMinor = reservation.nightlyPrice != null
      ? Math.max(0, Math.round(reservation.nightlyPrice * 100))
      : totalMinor == null ? null : Math.round(totalMinor / nights);
    await prisma.pricingOutcome.upsert({
      where: { reservationId: reservation.id },
      create: {
        reservationId: reservation.id, propertyId: attributionPropertyId, channel: reservation.platform,
        decisionId: nearest?.decisionId || null, exposureId: nearest?.id || null,
        outcomeType: reservation.status === "cancelled" ? "cancelled" : "booked",
        bookedAt: reservation.createdAt, checkIn: reservation.checkIn, checkOut: reservation.checkOut,
        nights, durationBand: durationBand(nights), totalMinor, nightlyMinor,
        currency: reservation.priceCurrency, leadDays: daysBetween(reservation.createdAt, reservation.checkIn), attributionQuality,
      },
      update: {
        propertyId: attributionPropertyId, channel: reservation.platform,
        decisionId: nearest?.decisionId || null, exposureId: nearest?.id || null,
        outcomeType: reservation.status === "cancelled" ? "cancelled" : "booked",
        bookedAt: reservation.createdAt, checkIn: reservation.checkIn, checkOut: reservation.checkOut,
        nights, durationBand: durationBand(nights), totalMinor, nightlyMinor,
        currency: reservation.priceCurrency, leadDays: daysBetween(reservation.createdAt, reservation.checkIn), attributionQuality,
      },
    });
  }
  return reservations.length;
}

export async function refreshPricingCalibrations(now = new Date(), lookbackDays = 120) {
  const until = addDays(dateKey(now), -1);
  const from = addDays(until, -(lookbackDays - 1));
  await prisma.pricingExposure.updateMany({
    where: { stayDate: { lte: until }, endedAt: null }, data: { endedAt: now },
  });
  const [exposures, outcomes] = await Promise.all([
    prisma.pricingExposure.findMany({
      where: { stayDate: { gte: from, lte: until }, channel: { in: ["airbnb", "booking"] } },
      orderBy: { lastObservedAt: "desc" },
    }),
    prisma.pricingOutcome.findMany({
      where: { checkIn: { gte: new Date(`${from}T00:00:00.000Z`), lt: new Date(`${addDays(until, 1)}T00:00:00.000Z`) }, channel: { in: ["airbnb", "booking"] } },
    }),
  ]);

  const finalExposure = new Map<string, typeof exposures[number]>();
  for (const exposure of exposures) {
    const exposureKey = key(exposure.propertyId, exposure.channel, exposure.stayDate);
    if (!finalExposure.has(exposureKey)) finalExposure.set(exposureKey, exposure);
  }
  const bookedByNight = new Map<string, number>();
  for (const outcome of outcomes.filter((row) => row.outcomeType === "booked")) {
    let stayDate = dateKey(outcome.checkIn);
    const checkOut = dateKey(outcome.checkOut);
    while (stayDate < checkOut) {
      const nightKey = key(outcome.propertyId, outcome.channel, stayDate);
      bookedByNight.set(nightKey, (bookedByNight.get(nightKey) || 0) + 1);
      stayDate = addDays(stayDate, 1);
    }
  }
  const statsMap = new Map<string, PricingLearningStat>();
  for (const [exposureKey, exposure] of finalExposure) {
    const statsKey = `${exposure.propertyId}:${exposure.channel}`;
    const stat = statsMap.get(statsKey) || { propertyId: exposure.propertyId, channel: exposure.channel, exposureNights: 0, bookedNights: 0, bookingCount: 0 };
    const capacity = Math.max(1, exposure.availableUnits);
    stat.exposureNights += capacity;
    stat.bookedNights += Math.min(capacity, bookedByNight.get(exposureKey) || 0);
    statsMap.set(statsKey, stat);
  }
  for (const outcome of outcomes.filter((row) => row.outcomeType === "booked")) {
    const statsKey = `${outcome.propertyId}:${outcome.channel}`;
    const stat = statsMap.get(statsKey);
    if (stat) stat.bookingCount++;
  }
  const learning = computePricingLearning([...statsMap.values()]);
  for (const row of learning) {
    await prisma.pricingCalibration.upsert({
      where: { propertyId_channel_durationBand: { propertyId: row.propertyId, channel: row.channel, durationBand: "all" } },
      create: { ...row, durationBand: "all", dataFrom: from, dataUntil: until },
      update: { ...row, dataFrom: from, dataUntil: until, calculatedAt: now },
    });
  }

  const durationGroups = new Map<string, typeof outcomes>();
  for (const outcome of outcomes.filter((row) => row.outcomeType === "booked")) {
    const groupKey = `${outcome.propertyId}:${outcome.channel}:${outcome.durationBand}`;
    const rows = durationGroups.get(groupKey) || [];
    rows.push(outcome);
    durationGroups.set(groupKey, rows);
  }
  for (const [groupKey, rows] of durationGroups) {
    const [propertyIdValue, channel, band] = groupKey.split(":");
    const sameCurrency = rows.every((row) => row.currency === rows[0].currency);
    const adrRows = rows.filter((row) => row.nightlyMinor != null);
    const averageAdrMinor = sameCurrency && adrRows.length > 0
      ? Math.round(adrRows.reduce((sum, row) => sum + (row.nightlyMinor || 0), 0) / adrRows.length)
      : null;
    const bookedNights = rows.reduce((sum, row) => sum + row.nights, 0);
    const confidenceBps = bounded(rows.length * 10_000 / (rows.length + 10), 0, 9_000);
    await prisma.pricingCalibration.upsert({
      where: { propertyId_channel_durationBand: { propertyId: Number(propertyIdValue), channel, durationBand: band } },
      create: {
        propertyId: Number(propertyIdValue), channel, durationBand: band, exposureNights: 0, bookedNights,
        bookingCount: rows.length, sellThroughBps: 0, peerSellThroughBps: 0, adjustmentBps: 0,
        confidenceBps, averageAdrMinor, currency: sameCurrency ? rows[0].currency : "MIXED", dataFrom: from, dataUntil: until,
      },
      update: {
        exposureNights: 0, bookedNights, bookingCount: rows.length, adjustmentBps: 0,
        confidenceBps, averageAdrMinor, currency: sameCurrency ? rows[0].currency : "MIXED",
        dataFrom: from, dataUntil: until, calculatedAt: now,
      },
    });
  }
  return { from, until, profiles: learning.length, durationProfiles: durationGroups.size };
}

export async function refreshPricingFeedback(now = new Date()) {
  const outcomes = await refreshPricingOutcomes(now);
  const calibration = await refreshPricingCalibrations(now);
  const supersededBefore = new Date(now.getTime() - 180 * 86_400_000);
  const exposureBefore = addDays(dateKey(now), -550);
  const metricBefore = addDays(dateKey(now), -730);
  const [decisionsPruned, exposuresPruned, metricsPruned] = await Promise.all([
    prisma.pricingDecision.deleteMany({ where: { status: { in: ["proposed", "superseded", "failed"] }, calculatedAt: { lt: supersededBefore } } }),
    prisma.pricingExposure.deleteMany({ where: { stayDate: { lt: exposureBefore }, endedAt: { not: null } } }),
    prisma.channelPerformanceMetric.deleteMany({ where: { periodEnd: { lt: metricBefore } } }),
  ]);
  return {
    outcomes, ...calibration,
    pruned: { decisions: decisionsPruned.count, exposures: exposuresPruned.count, metrics: metricsPruned.count },
  };
}

export async function getPricingLearningAdjustments(propertyIds: number[]) {
  if (propertyIds.length === 0) return new Map<string, { adjustmentBps: number; confidenceBps: number }>();
  const rows = await prisma.pricingCalibration.findMany({
    where: { propertyId: { in: propertyIds }, durationBand: "all", channel: { in: ["airbnb", "booking", "direct"] } },
  });
  return new Map(rows.map((row) => [`${row.propertyId}:${row.channel}`, {
    adjustmentBps: bounded(row.adjustmentBps, -500, 500), confidenceBps: bounded(row.confidenceBps, 0, 10_000),
  }]));
}
