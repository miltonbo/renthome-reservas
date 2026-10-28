import { prisma } from "@/lib/prisma";

export const BCB_TCO_SERIES_URL = "https://www.bcb.gob.bo/grafico_evolutivo/download.php?serie=tipo_de_cambio&format=json";
export const BCB_TCO_SOURCE = "BCB_TCO";

type BcbSeriesPayload = {
  variable?: string;
  unidad?: string;
  datos?: Array<{ Fecha?: string; Valor?: number }>;
};

export type OfficialExchangeRate = {
  bobPerUsd: number;
  effectiveDate: string;
  fetchedAt: Date;
  stale: boolean;
};

function boliviaDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function boliviaPublicationWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const weekday = value("weekday");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  // RD 88/2026 establishes publication at 20:00 on business days. The
  // existing ten-minute system cron retries briefly after that time so a
  // small delay on the BCB site does not leave the next day's rate missing.
  return !["Sat", "Sun"].includes(weekday) && hour === 20 && minute >= 5 && minute <= 35;
}

export function selectBcbRates(payload: BcbSeriesPayload, today: string) {
  const rows = (payload.datos || [])
    .filter((row): row is { Fecha: string; Valor: number } =>
      typeof row.Fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.Fecha) &&
      typeof row.Valor === "number" && Number.isFinite(row.Valor) && row.Valor > 0,
    )
    .sort((a, b) => a.Fecha.localeCompare(b.Fecha));
  const current = [...rows].reverse().find((row) => row.Fecha <= today) || null;
  const latest = rows.at(-1) || null;
  return { current, latest };
}

async function saveRate(row: { Fecha: string; Valor: number }) {
  return prisma.exchangeRate.upsert({
    where: {
      effectiveDate_currency_source: {
        effectiveDate: row.Fecha,
        currency: "USD",
        source: BCB_TCO_SOURCE,
      },
    },
    create: {
      effectiveDate: row.Fecha,
      currency: "USD",
      source: BCB_TCO_SOURCE,
      bobPerUnitMinor: Math.round(row.Valor * 100),
      isManual: false,
    },
    update: {
      bobPerUnitMinor: Math.round(row.Valor * 100),
      fetchedAt: new Date(),
      isManual: false,
    },
  });
}

export async function refreshOfficialExchangeRate(date = new Date()): Promise<OfficialExchangeRate> {
  const today = boliviaDate(date);
  const response = await fetch(BCB_TCO_SERIES_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`BCB ${response.status}`);
  const payload = await response.json() as BcbSeriesPayload;
  const { current, latest } = selectBcbRates(payload, today);
  if (!current) throw new Error("BCB current official exchange rate not found");

  const savedCurrent = await saveRate(current);
  if (latest && latest.Fecha !== current.Fecha) await saveRate(latest);
  return {
    bobPerUsd: savedCurrent.bobPerUnitMinor / 100,
    effectiveDate: savedCurrent.effectiveDate,
    fetchedAt: savedCurrent.fetchedAt,
    stale: savedCurrent.effectiveDate < today,
  };
}

export async function getOfficialExchangeRate(date = new Date()): Promise<OfficialExchangeRate> {
  const today = boliviaDate(date);
  const cached = await prisma.exchangeRate.findFirst({
    where: {
      effectiveDate: { lte: today },
      currency: "USD",
      source: BCB_TCO_SOURCE,
    },
    orderBy: { effectiveDate: "desc" },
  });
  if (cached?.effectiveDate === today) {
    return {
      bobPerUsd: cached.bobPerUnitMinor / 100,
      effectiveDate: cached.effectiveDate,
      fetchedAt: cached.fetchedAt,
      stale: false,
    };
  }

  try {
    return await refreshOfficialExchangeRate(date);
  } catch (error) {
    if (!cached) throw error;
    return {
      bobPerUsd: cached.bobPerUnitMinor / 100,
      effectiveDate: cached.effectiveDate,
      fetchedAt: cached.fetchedAt,
      stale: true,
    };
  }
}
