import "server-only";

import { prisma } from "@/lib/prisma";
import { generateShadowPrices } from "@/lib/pricing-shadow";
import { normalizePricingKnowledge } from "@/lib/pricing-strategy";

export const AUTOMATED_PRICING_CHANNELS = ["airbnb", "booking"] as const;
export type AutomatedPricingChannel = typeof AUTOMATED_PRICING_CHANNELS[number];

const PROMOTION_TYPES = new Set(["genius", "mobile", "country", "last_minute", "weekly", "monthly", "custom", "new_listing"]);

type SnapshotPromotion = {
  type: string;
  enabled: boolean;
  discountBps: number;
  stackable?: boolean;
  minNights?: number;
  minLeadDays?: number | null;
  maxLeadDays?: number | null;
};

export type ChannelListingSnapshot = {
  propertyId: number;
  externalListingId: string;
  externalRoomId?: string | null;
  externalRatePlanId?: string | null;
  status?: "connected" | "session_expired" | "verification_required" | "error";
  reviewCount?: number;
  rating?: number;
  promotions?: SnapshotPromotion[];
  observations?: Array<{
    date: string;
    priceMinor: number;
    currency?: "USD";
    minNights?: number;
    promotionBps?: number;
    availableUnits?: number;
  }>;
  metadata?: Record<string, unknown>;
  error?: string | null;
};

export type ChannelConnectionRegistration = Pick<
  ChannelListingSnapshot,
  "propertyId" | "externalListingId" | "externalRoomId" | "externalRatePlanId" | "status" | "metadata" | "error"
>;

export type AutomationVerificationResult = {
  propertyId: number;
  date: string;
  requestedMinor: number;
  previousMinor?: number | null;
  observedMinor?: number | null;
  currency?: "USD";
  requestedMinNights?: number;
  observedMinNights?: number | null;
  status: "verified" | "mismatch" | "failed";
  error?: string | null;
};

function dateKey(value = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback = minimum): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function historyStrength(reviewCount: number): "new" | "growing" | "established" {
  if (reviewCount >= 10) return "established";
  return reviewCount > 0 ? "growing" : "new";
}

export async function enqueuePricingAutomationRuns(slotKey: string, runType = "dynamic") {
  const rows = [];
  for (const channel of AUTOMATED_PRICING_CHANNELS) {
    const propertyCount = await prisma.pricingPolicy.count({ where: { channel, isActive: true } });
    rows.push(await prisma.pricingAutomationRun.upsert({
      where: { slotKey_channel_runType: { slotKey, channel, runType } },
      create: { slotKey, channel, runType, propertyCount },
      update: {},
    }));
  }
  return rows;
}

export async function claimNextPricingAutomationRun(workerId: string, channels: string[]) {
  const allowed = channels.filter((channel): channel is AutomatedPricingChannel => AUTOMATED_PRICING_CHANNELS.includes(channel as AutomatedPricingChannel));
  if (!workerId.trim() || allowed.length === 0) return null;
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  await prisma.pricingAutomationRun.updateMany({
    where: { status: "claimed", lastHeartbeatAt: { lt: staleBefore }, attempts: { lt: 3 } },
    data: { status: "queued", workerId: null, claimedAt: null, errorCode: "stale_claim", errorMessage: "El trabajador dejó de enviar señales." },
  });
  const candidates = await prisma.pricingAutomationRun.findMany({
    where: { status: "queued", channel: { in: allowed }, scheduledAt: { lte: new Date() }, attempts: { lt: 3 } },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: 5,
  });
  for (const candidate of candidates) {
    const claimed = await prisma.pricingAutomationRun.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: { status: "claimed", workerId, claimedAt: new Date(), lastHeartbeatAt: new Date(), attempts: { increment: 1 }, errorCode: null, errorMessage: null },
    });
    if (claimed.count === 1) {
      const properties = await prisma.pricingPolicy.findMany({
        where: { channel: candidate.channel, isActive: true },
        select: { property: { select: { id: true, name: true } } },
        orderBy: { property: { name: "asc" } },
      });
      return { ...candidate, status: "claimed", workerId, properties: properties.map((row) => row.property) };
    }
  }
  return null;
}

export async function heartbeatPricingAutomationRun(runId: number, workerId: string) {
  const updated = await prisma.pricingAutomationRun.updateMany({
    where: { id: runId, workerId, status: { in: ["claimed", "calculated", "applying"] } },
    data: { lastHeartbeatAt: new Date() },
  });
  return updated.count === 1;
}

export async function registerPricingChannelConnections(options: {
  channel: AutomatedPricingChannel;
  listings: ChannelConnectionRegistration[];
}) {
  const candidates = options.listings.slice(0, 500);
  const propertyIds = [...new Set(candidates.map((listing) => boundedInteger(listing.propertyId, 1, Number.MAX_SAFE_INTEGER, 0)).filter(Boolean))];
  const properties = await prisma.property.findMany({
    where: { id: { in: propertyIds }, isPaused: false },
    select: { id: true, name: true },
  });
  const allowed = new Map(properties.map((property) => [property.id, property]));
  const now = new Date();
  const connected: Array<{ propertyId: number; propertyName: string; externalListingId: string }> = [];
  const rejected: Array<{ propertyId: number; reason: string }> = [];

  for (const listing of candidates) {
    const propertyId = boundedInteger(listing.propertyId, 1, Number.MAX_SAFE_INTEGER, 0);
    const property = allowed.get(propertyId);
    const externalListingId = String(listing.externalListingId || "").trim().slice(0, 200);
    if (!property) {
      rejected.push({ propertyId, reason: "Alojamiento inexistente o pausado." });
      continue;
    }
    if (!externalListingId) {
      rejected.push({ propertyId, reason: "Falta el identificador externo." });
      continue;
    }
    const snapshotJson = JSON.stringify(listing.metadata || {}).slice(0, 20_000);
    const status = listing.status || "connected";
    await prisma.pricingChannelConnection.upsert({
      where: { propertyId_channel: { propertyId, channel: options.channel } },
      create: {
        propertyId,
        channel: options.channel,
        externalListingId,
        externalRoomId: listing.externalRoomId?.trim().slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.trim().slice(0, 200) || null,
        status,
        snapshotJson,
        lastCollectedAt: now,
        lastError: listing.error?.slice(0, 1_000) || null,
      },
      update: {
        externalListingId,
        externalRoomId: listing.externalRoomId?.trim().slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.trim().slice(0, 200) || null,
        status,
        snapshotJson,
        lastCollectedAt: now,
        lastError: listing.error?.slice(0, 1_000) || null,
      },
    });
    connected.push({ propertyId, propertyName: property.name, externalListingId });
  }

  return { channel: options.channel, connected, rejected };
}

export async function collectPricingChannelSnapshot(options: {
  channel: AutomatedPricingChannel;
  listings: ChannelListingSnapshot[];
}) {
  const candidates = options.listings.slice(0, 500);
  const propertyIds = [...new Set(candidates.map((listing) => boundedInteger(listing.propertyId, 1, Number.MAX_SAFE_INTEGER, 0)).filter(Boolean))];
  const [properties, policies] = await Promise.all([
    prisma.property.findMany({
      where: { id: { in: propertyIds }, isPaused: false },
      select: { id: true, name: true, pricingProfile: true },
    }),
    prisma.pricingPolicy.findMany({
      where: { propertyId: { in: propertyIds }, channel: options.channel, isActive: true },
    }),
  ]);
  const allowed = new Map(properties.map((property) => [property.id, property]));
  const policyMap = new Map(policies.map((policy) => [policy.propertyId, policy]));
  const now = new Date();
  let observations = 0;
  let promotions = 0;
  const collected: Array<{ propertyId: number; propertyName: string }> = [];
  const rejected: Array<{ propertyId: number; reason: string }> = [];

  for (const listing of candidates) {
    const propertyId = boundedInteger(listing.propertyId, 1, Number.MAX_SAFE_INTEGER, 0);
    const property = allowed.get(propertyId);
    const externalListingId = String(listing.externalListingId || "").trim().slice(0, 200);
    if (!property || !externalListingId) {
      rejected.push({ propertyId, reason: !property ? "Alojamiento inexistente o pausado." : "Falta el identificador externo." });
      continue;
    }

    const reviewCount = boundedInteger(listing.reviewCount, 0, 100_000, 0);
    const ratingHundredths = Math.round(Math.max(0, Math.min(options.channel === "airbnb" ? 5 : 10, Number(listing.rating) || 0)) * 100);
    const currentProfile = normalizePricingKnowledge(property.name, property.pricingProfile);
    const observedMaxSellableUnits = Math.max(1, ...(listing.observations || []).map((row) => boundedInteger(row.availableUnits, 0, 100, 0)));
    const maxSellableUnits = Math.max(currentProfile.bookingMaxSellableUnits, observedMaxSellableUnits);
    const profileValues = normalizePricingKnowledge(property.name, {
      ...currentProfile,
      ...(options.channel === "airbnb" ? {
        airbnbReviewCount: reviewCount,
        airbnbRatingHundredths: ratingHundredths,
        airbnbHistoryStrength: historyStrength(reviewCount),
      } : {
        bookingReviewCount: reviewCount,
        bookingRatingHundredths: ratingHundredths,
        bookingHistoryStrength: historyStrength(reviewCount),
        bookingFlexibleInventory: currentProfile.bookingFlexibleInventory || maxSellableUnits > 1,
        bookingMaxSellableUnits: maxSellableUnits,
      }),
    });
    await prisma.propertyPricingProfile.upsert({
      where: { propertyId }, create: { propertyId, ...profileValues }, update: profileValues,
    });

    await prisma.pricingChannelConnection.upsert({
      where: { propertyId_channel: { propertyId, channel: options.channel } },
      create: {
        propertyId, channel: options.channel, externalListingId,
        externalRoomId: listing.externalRoomId?.trim().slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.trim().slice(0, 200) || null,
        status: listing.status || "connected", snapshotJson: JSON.stringify(listing.metadata || {}).slice(0, 20_000),
        lastCollectedAt: now, lastError: listing.error?.slice(0, 1_000) || null,
      },
      update: {
        externalListingId, externalRoomId: listing.externalRoomId?.trim().slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.trim().slice(0, 200) || null,
        status: listing.status || "connected", snapshotJson: JSON.stringify(listing.metadata || {}).slice(0, 20_000),
        lastCollectedAt: now, lastError: listing.error?.slice(0, 1_000) || null,
      },
    });

    const policy = policyMap.get(propertyId);
    if (policy) {
      for (const promotion of (listing.promotions || []).slice(0, 30)) {
        if (!PROMOTION_TYPES.has(promotion.type)) continue;
        await prisma.promotionPolicy.upsert({
          where: { propertyId_channel_promotionType: { propertyId, channel: options.channel, promotionType: promotion.type } },
          create: {
            propertyId, channel: options.channel, promotionType: promotion.type, enabled: Boolean(promotion.enabled),
            discountBps: boundedInteger(promotion.discountBps, 0, 9_999), stackable: options.channel === "booking" && Boolean(promotion.stackable),
            minNights: boundedInteger(promotion.minNights, 1, 365, 1), minLeadDays: promotion.minLeadDays == null ? null : boundedInteger(promotion.minLeadDays, 0, 3_650),
            maxLeadDays: promotion.maxLeadDays == null ? null : boundedInteger(promotion.maxLeadDays, 0, 3_650),
            netFloorMinor: policy.floorMinor, netFloorCurrency: policy.floorCurrency, source: "platform", lastSyncedAt: now,
          },
          update: {
            enabled: Boolean(promotion.enabled), discountBps: boundedInteger(promotion.discountBps, 0, 9_999),
            stackable: options.channel === "booking" && Boolean(promotion.stackable), minNights: boundedInteger(promotion.minNights, 1, 365, 1),
            minLeadDays: promotion.minLeadDays == null ? null : boundedInteger(promotion.minLeadDays, 0, 3_650),
            maxLeadDays: promotion.maxLeadDays == null ? null : boundedInteger(promotion.maxLeadDays, 0, 3_650), source: "platform", lastSyncedAt: now,
          },
        });
        promotions += 1;
      }
    }

    for (const observation of (listing.observations || []).slice(0, 370)) {
      if (!validDate(observation.date)) continue;
      await prisma.channelPriceObservation.upsert({
        where: { propertyId_channel_date: { propertyId, channel: options.channel, date: observation.date } },
        create: {
          propertyId, channel: options.channel, date: observation.date,
          priceMinor: boundedInteger(observation.priceMinor, 0, 100_000_000), currency: "USD",
          minNights: boundedInteger(observation.minNights, 1, 365, 2), promotionBps: boundedInteger(observation.promotionBps, 0, 9_999),
          availableUnits: boundedInteger(observation.availableUnits, 0, 100, 1), observedAt: now,
        },
        update: {
          priceMinor: boundedInteger(observation.priceMinor, 0, 100_000_000), currency: "USD",
          minNights: boundedInteger(observation.minNights, 1, 365, 2), promotionBps: boundedInteger(observation.promotionBps, 0, 9_999),
          availableUnits: boundedInteger(observation.availableUnits, 0, 100, 1), observedAt: now,
        },
      });
      observations += 1;
    }
    collected.push({ propertyId, propertyName: property.name });
  }

  await prisma.channelPriceObservation.deleteMany({ where: { date: { lt: addDays(dateKey(), -7) } } });
  return { channel: options.channel, collected, rejected, observations, promotions };
}

export async function ingestPricingAutomationSnapshot(options: {
  runId: number;
  workerId: string;
  channel: AutomatedPricingChannel;
  listings: ChannelListingSnapshot[];
}) {
  const run = await prisma.pricingAutomationRun.findFirst({
    where: { id: options.runId, workerId: options.workerId, channel: options.channel, status: "claimed" },
  });
  if (!run) throw new Error("La ejecución no está reclamada por este trabajador.");
  const activePolicies = await prisma.pricingPolicy.findMany({
    where: { channel: options.channel, isActive: true },
    include: { property: { select: { id: true, name: true, pricingProfile: true } } },
  });
  const allowed = new Map(activePolicies.map((policy) => [policy.propertyId, policy]));
  const now = new Date();
  const collectedPropertyIds = new Set<number>();

  for (const listing of options.listings.slice(0, 500)) {
    const policy = allowed.get(boundedInteger(listing.propertyId, 1, Number.MAX_SAFE_INTEGER, 0));
    if (!policy) continue;
    const propertyId = policy.propertyId;
    collectedPropertyIds.add(propertyId);
    const reviewCount = boundedInteger(listing.reviewCount, 0, 100_000, 0);
    const ratingHundredths = Math.round(Math.max(0, Math.min(options.channel === "airbnb" ? 5 : 10, Number(listing.rating) || 0)) * 100);
    const currentProfile = normalizePricingKnowledge(policy.property.name, policy.property.pricingProfile);
    const profileValues = normalizePricingKnowledge(policy.property.name, {
      ...currentProfile,
      ...(options.channel === "airbnb" ? {
        airbnbReviewCount: reviewCount,
        airbnbRatingHundredths: ratingHundredths,
        airbnbHistoryStrength: historyStrength(reviewCount),
      } : {
        bookingReviewCount: reviewCount,
        bookingRatingHundredths: ratingHundredths,
        bookingHistoryStrength: historyStrength(reviewCount),
      }),
    });
    await prisma.propertyPricingProfile.upsert({
      where: { propertyId }, create: { propertyId, ...profileValues }, update: profileValues,
    });

    const snapshotJson = JSON.stringify(listing.metadata || {}).slice(0, 20_000);
    const connectionStatus = listing.status || "connected";
    await prisma.pricingChannelConnection.upsert({
      where: { propertyId_channel: { propertyId, channel: options.channel } },
      create: {
        propertyId, channel: options.channel, externalListingId: String(listing.externalListingId || "").slice(0, 200),
        externalRoomId: listing.externalRoomId?.slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.slice(0, 200) || null,
        status: connectionStatus, snapshotJson, lastCollectedAt: now, lastError: listing.error?.slice(0, 1_000) || null,
      },
      update: {
        externalListingId: String(listing.externalListingId || "").slice(0, 200),
        externalRoomId: listing.externalRoomId?.slice(0, 200) || null,
        externalRatePlanId: listing.externalRatePlanId?.slice(0, 200) || null,
        status: connectionStatus, snapshotJson, lastCollectedAt: now, lastError: listing.error?.slice(0, 1_000) || null,
      },
    });

    for (const promotion of (listing.promotions || []).slice(0, 30)) {
      if (!PROMOTION_TYPES.has(promotion.type)) continue;
      await prisma.promotionPolicy.upsert({
        where: { propertyId_channel_promotionType: { propertyId, channel: options.channel, promotionType: promotion.type } },
        create: {
          propertyId, channel: options.channel, promotionType: promotion.type, enabled: Boolean(promotion.enabled),
          discountBps: boundedInteger(promotion.discountBps, 0, 9_999), stackable: options.channel === "booking" && Boolean(promotion.stackable),
          minNights: boundedInteger(promotion.minNights, 1, 365, 1), minLeadDays: promotion.minLeadDays == null ? null : boundedInteger(promotion.minLeadDays, 0, 3_650),
          maxLeadDays: promotion.maxLeadDays == null ? null : boundedInteger(promotion.maxLeadDays, 0, 3_650),
          netFloorMinor: policy.floorMinor, netFloorCurrency: policy.floorCurrency, source: "platform", lastSyncedAt: now,
        },
        update: {
          enabled: Boolean(promotion.enabled), discountBps: boundedInteger(promotion.discountBps, 0, 9_999),
          stackable: options.channel === "booking" && Boolean(promotion.stackable), minNights: boundedInteger(promotion.minNights, 1, 365, 1),
          minLeadDays: promotion.minLeadDays == null ? null : boundedInteger(promotion.minLeadDays, 0, 3_650),
          maxLeadDays: promotion.maxLeadDays == null ? null : boundedInteger(promotion.maxLeadDays, 0, 3_650), source: "platform", lastSyncedAt: now,
        },
      });
    }

    for (const observation of (listing.observations || []).slice(0, 370)) {
      if (!validDate(observation.date)) continue;
      await prisma.channelPriceObservation.upsert({
        where: { propertyId_channel_date: { propertyId, channel: options.channel, date: observation.date } },
        create: {
          propertyId, channel: options.channel, date: observation.date,
          priceMinor: boundedInteger(observation.priceMinor, 0, 100_000_000), currency: "USD",
          minNights: boundedInteger(observation.minNights, 1, 365, 2), promotionBps: boundedInteger(observation.promotionBps, 0, 9_999),
          availableUnits: boundedInteger(observation.availableUnits, 0, 100, 1), observedAt: now,
        },
        update: {
          priceMinor: boundedInteger(observation.priceMinor, 0, 100_000_000), currency: "USD",
          minNights: boundedInteger(observation.minNights, 1, 365, 2), promotionBps: boundedInteger(observation.promotionBps, 0, 9_999),
          availableUnits: boundedInteger(observation.availableUnits, 0, 100, 1), observedAt: now,
        },
      });
    }
  }

  const propertyIds = [...collectedPropertyIds];
  if (propertyIds.length > 0) await generateShadowPrices({ propertyIds, days: 90 });
  const plan = await buildPricingAutomationPlan(options.channel, propertyIds);
  await prisma.pricingAutomationRun.update({
    where: { id: run.id },
    data: { status: "calculated", plannedChanges: plan.changeCount, propertyCount: propertyIds.length, lastHeartbeatAt: now },
  });
  await prisma.channelPriceObservation.deleteMany({ where: { date: { lt: addDays(dateKey(), -7) } } });
  return plan;
}

export async function buildPricingAutomationPlan(channel: AutomatedPricingChannel, propertyIds: number[]) {
  if (propertyIds.length === 0) return { channel, changeCount: 0, listings: [] as Array<Record<string, unknown>> };
  const [properties, dailyPrices, observations, connections, policies] = await Promise.all([
    prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true } }),
    prisma.dailyPrice.findMany({ where: { propertyId: { in: propertyIds }, date: { gte: dateKey(), lte: addDays(dateKey(), 89) }, status: { not: "occupied" } }, orderBy: [{ propertyId: "asc" }, { date: "asc" }] }),
    prisma.channelPriceObservation.findMany({ where: { propertyId: { in: propertyIds }, channel, date: { gte: dateKey(), lte: addDays(dateKey(), 89) } } }),
    prisma.pricingChannelConnection.findMany({ where: { propertyId: { in: propertyIds }, channel } }),
    prisma.pricingPolicy.findMany({ where: { propertyId: { in: propertyIds }, channel, isActive: true } }),
  ]);
  const observationMap = new Map(observations.map((row) => [`${row.propertyId}:${row.date}`, row]));
  const connectionMap = new Map(connections.map((row) => [row.propertyId, row]));
  const policyMap = new Map(policies.map((row) => [row.propertyId, row]));
  const propertyMap = new Map(properties.map((row) => [row.id, row]));
  const listings = [];
  let changeCount = 0;
  for (const propertyId of propertyIds) {
    const property = propertyMap.get(propertyId);
    const policy = policyMap.get(propertyId);
    if (!property || !policy) continue;
    const connection = connectionMap.get(propertyId);
    const dates = dailyPrices.filter((row) => row.propertyId === propertyId).flatMap((row) => {
      const recommendedMinor = channel === "airbnb" ? row.airbnbUsdMinor : row.bookingUsdMinor;
      if (recommendedMinor == null) return [];
      const current = observationMap.get(`${propertyId}:${row.date}`);
      const recommendedMinNights = row.reasonSummary.includes("hueco de una noche") ? policy.gapMinNights : policy.defaultMinNights;
      if (current && current.priceMinor === recommendedMinor && current.minNights === recommendedMinNights) return [];
      return [{
        date: row.date, currentPriceMinor: current?.priceMinor ?? null, recommendedPriceMinor: recommendedMinor,
        currency: "USD", currentMinNights: current?.minNights ?? null, recommendedMinNights,
        floorBobMinor: row.floorBobMinor, reasons: row.reasonSummary,
      }];
    });
    changeCount += dates.length;
    if (dates.length > 0) listings.push({
      propertyId, propertyName: property.name, externalListingId: connection?.externalListingId || "",
      externalRoomId: connection?.externalRoomId || null, externalRatePlanId: connection?.externalRatePlanId || null, dates,
    });
  }
  return { channel, changeCount, listings };
}

function nextDate(value: string): string { return addDays(value, 1); }

export function groupAutomationResults(results: AutomationVerificationResult[]) {
  const sorted = [...results].filter((row) => validDate(row.date)).sort((a, b) => a.propertyId - b.propertyId || a.date.localeCompare(b.date));
  const groups: Array<AutomationVerificationResult & { startsOn: string; endsOn: string }> = [];
  for (const row of sorted) {
    const previous = groups.at(-1);
    const same = previous && previous.propertyId === row.propertyId && nextDate(previous.endsOn) === row.date &&
      previous.requestedMinor === row.requestedMinor && previous.previousMinor === row.previousMinor && previous.observedMinor === row.observedMinor && previous.status === row.status;
    if (same) previous.endsOn = row.date;
    else groups.push({ ...row, startsOn: row.date, endsOn: row.date });
  }
  return groups;
}

export async function completePricingAutomationRun(options: {
  runId: number; workerId: string; results: AutomationVerificationResult[];
}) {
  const run = await prisma.pricingAutomationRun.findFirst({
    where: { id: options.runId, workerId: options.workerId, status: { in: ["calculated", "applying"] } },
  });
  if (!run) throw new Error("La ejecución no pertenece a este trabajador.");
  const now = new Date();
  const validResults = options.results.slice(0, 10_000).filter((row) => validDate(row.date));
  const groups = groupAutomationResults(validResults);
  if (groups.length > 0) {
    await prisma.pricingChange.createMany({ data: groups.map((group) => ({
      propertyId: group.propertyId, channel: run.channel, startsOn: group.startsOn, endsOn: group.endsOn,
      previousMinor: group.previousMinor ?? null, newMinor: group.requestedMinor, currency: group.currency || "USD",
      reasonCode: "automatic_pricing", reason: `Ejecución automática ${run.slotKey}`,
      executionStatus: group.status === "failed" ? "failed" : "applied",
      verificationStatus: group.status, appliedAt: now, verifiedAt: group.status === "failed" ? null : now,
    })) });
  }
  for (const result of validResults) {
    if (result.observedMinor != null) {
      await prisma.channelPriceObservation.upsert({
        where: { propertyId_channel_date: { propertyId: result.propertyId, channel: run.channel, date: result.date } },
        create: { propertyId: result.propertyId, channel: run.channel, date: result.date, priceMinor: result.observedMinor, currency: "USD", minNights: result.observedMinNights || result.requestedMinNights || 2, observedAt: now },
        update: { priceMinor: result.observedMinor, minNights: result.observedMinNights || result.requestedMinNights || 2, observedAt: now },
      });
    }
  }
  const propertyIds = [...new Set(validResults.map((row) => row.propertyId))];
  const failed = validResults.filter((row) => row.status === "failed").length;
  const mismatched = validResults.filter((row) => row.status === "mismatch").length;
  const verified = validResults.filter((row) => row.status === "verified").length;
  const status = failed === validResults.length && failed > 0 ? "failed" : failed > 0 || mismatched > 0 ? "partial" : "completed";
  await prisma.pricingAutomationRun.update({ where: { id: run.id }, data: {
    status, appliedChanges: validResults.length - failed, verifiedChanges: verified, completedAt: now, lastHeartbeatAt: now,
    errorCode: failed || mismatched ? "verification_incomplete" : null,
    errorMessage: failed || mismatched ? `${failed} fallidos y ${mismatched} diferentes.` : null,
  } });
  await prisma.pricingChannelConnection.updateMany({
    where: { propertyId: { in: propertyIds }, channel: run.channel },
    data: { lastAppliedAt: now, lastVerifiedAt: verified > 0 ? now : undefined, status: status === "failed" ? "error" : "connected", lastError: failed || mismatched ? `${failed} fallidos y ${mismatched} diferentes.` : null },
  });
  return { status, applied: validResults.length - failed, verified, failed, mismatched };
}

export async function failPricingAutomationRun(runId: number, workerId: string, code: string, message: string) {
  const blocked = code === "session_expired" || code === "verification_required" || code === "captcha";
  const run = await prisma.pricingAutomationRun.update({ where: { id: runId }, data: {
    status: blocked ? "blocked" : "failed", workerId, completedAt: new Date(), errorCode: code.slice(0, 80), errorMessage: message.slice(0, 1_000), lastHeartbeatAt: new Date(),
  } });
  await prisma.pricingChannelConnection.updateMany({
    where: { channel: run.channel },
    data: { status: code === "session_expired" ? "session_expired" : code === "verification_required" || code === "captcha" ? "verification_required" : "error", lastError: message.slice(0, 1_000) },
  });
  return run;
}
