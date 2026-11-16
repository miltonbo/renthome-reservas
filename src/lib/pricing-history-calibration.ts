import "server-only";

import { prisma } from "@/lib/prisma";

export type HistoricalPricingEvent = { name: string; startsOn: string; endsOn: string };
export type HistoricalReservation = {
  propertyId: number; platform: string; priceCurrency: string;
  checkIn: Date; checkOut: Date; nightlyPrice: number | null; totalPrice: number | null;
};
export type EventCalibrationProfile = {
  eventKey: string; channel: string; upliftBps: number; rawMedianBps: number; samplePairs: number;
};

const CALIBRATION_KEY = "pricing_event_calibration_v1";

// Official dates: https://www.fexpocruz.com.bo/expocruz-2026
export const KNOWN_HISTORICAL_EVENTS: HistoricalPricingEvent[] = [
  { name: "Expocruz 2026", startsOn: "2026-09-18", endsOn: "2026-09-27" },
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function eventFamilyKey(name: string): string {
  const value = stripAccents(name);
  if (/\bexpocruz\b/.test(value)) return "expocruz";
  if (/ano nuevo/.test(value)) return "ano_nuevo";
  if (/navidad/.test(value)) return "navidad";
  if (/carnaval/.test(value)) return "carnaval";
  if (/larga noche/.test(value)) return "larga_noche_museos";
  return value.replace(/\b20\d{2}\b/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function dateKey(value: Date): string { return value.toISOString().slice(0, 10); }
function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

export function computeEventCalibrations(events: HistoricalPricingEvent[], reservations: HistoricalReservation[]): EventCalibrationProfile[] {
  const nightRows: Array<{ date: string; group: string; channel: string; adr: number }> = [];
  for (const reservation of reservations) {
    const nights = Math.max(1, Math.round((reservation.checkOut.getTime() - reservation.checkIn.getTime()) / 86_400_000));
    const adr = reservation.nightlyPrice ?? ((reservation.totalPrice || 0) / nights);
    if (!Number.isFinite(adr) || adr <= 0) continue;
    for (let date = dateKey(reservation.checkIn); date < dateKey(reservation.checkOut); date = addDays(date, 1)) {
      nightRows.push({ date, group: `${reservation.propertyId}:${reservation.platform}:${reservation.priceCurrency}`, channel: reservation.platform, adr });
    }
  }

  const pairUplifts = new Map<string, number[]>();
  for (const event of events) {
    const comparisonStart = addDays(event.startsOn, -17);
    const comparisonEnd = addDays(event.endsOn, 18);
    const groups = new Map<string, { channel: string; event: number[]; baseline: number[] }>();
    for (const row of nightRows) {
      if (row.date < comparisonStart || row.date > comparisonEnd) continue;
      const group = groups.get(row.group) || { channel: row.channel, event: [], baseline: [] };
      if (row.date >= event.startsOn && row.date <= event.endsOn) group.event.push(row.adr);
      else group.baseline.push(row.adr);
      groups.set(row.group, group);
    }
    for (const group of groups.values()) {
      if (group.event.length < 2 || group.baseline.length < 2) continue;
      const baseline = median(group.baseline);
      if (baseline <= 0) continue;
      const uplift = Math.max(-2_000, Math.min(6_000, Math.round((median(group.event) / baseline - 1) * 10_000)));
      const key = `${eventFamilyKey(event.name)}:${group.channel}`;
      const values = pairUplifts.get(key) || [];
      values.push(uplift);
      pairUplifts.set(key, values);
    }
  }

  return [...pairUplifts.entries()].map(([key, values]) => {
    const separator = key.lastIndexOf(":");
    const rawMedianBps = median(values);
    // Bayesian-style shrinkage toward zero prevents a handful of properties
    // from creating an aggressive portfolio-wide rule.
    const upliftBps = Math.max(0, Math.round(rawMedianBps * values.length / (values.length + 10)));
    return { eventKey: key.slice(0, separator), channel: key.slice(separator + 1), upliftBps, rawMedianBps, samplePairs: values.length };
  });
}

export async function refreshPricingHistoricalCalibration(now = new Date()): Promise<EventCalibrationProfile[]> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const events = KNOWN_HISTORICAL_EVENTS.filter((event) => event.endsOn < today);
  const reservations = await prisma.reservation.findMany({
    where: { status: "confirmed", checkIn: { lt: now }, OR: [{ nightlyPrice: { not: null } }, { totalPrice: { not: null } }] },
    select: { propertyId: true, platform: true, priceCurrency: true, checkIn: true, checkOut: true, nightlyPrice: true, totalPrice: true },
  });
  const profiles = computeEventCalibrations(events, reservations);
  await prisma.appSettings.upsert({
    where: { key: CALIBRATION_KEY },
    update: { value: JSON.stringify({ calculatedAt: now.toISOString(), profiles }) },
    create: { key: CALIBRATION_KEY, value: JSON.stringify({ calculatedAt: now.toISOString(), profiles }) },
  });
  return profiles;
}

export async function getPricingHistoricalCalibration(): Promise<EventCalibrationProfile[]> {
  const row = await prisma.appSettings.findUnique({ where: { key: CALIBRATION_KEY } });
  if (!row?.value) return [];
  try { return (JSON.parse(row.value) as { profiles?: EventCalibrationProfile[] }).profiles || []; } catch { return []; }
}
