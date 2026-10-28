"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { PropertySwitcher } from "@/components/property-switcher";
import { FinancialReportsPanel } from "@/components/financial-reports-panel";
import { useOfficialExchangeRate } from "@/lib/use-official-exchange-rate";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";
import type { Property } from "@/lib/types";

interface CopyShape {
  reports: string;
  portfolioSubtitle: (count: number) => string;
  propertySubtitle: (name: string) => string;
  noDataYet: string;
  pastWindow: (months: number) => string;
  noProperties: string;
  pastOccupancy: string;
  upcomingNights: string;
  upcomingNightsSubtitle: (months: number) => string;
  bookings: string;
  avgNights: (n: number) => string;
  allTime: string;
  cleaningsAhead: string;
  cleaningsAheadSubtitle: string;
  topSource: string;
  chartHeader: (max: string) => string;
  yAxisUnit: string;
  tooltipUnit: string;
  now: string;
  past: string;
  upcoming: string;
  noBookings: string;
  loading: string;
  byProperty: string;
  byPropertyHint: string;
  colProperty: string;
  colPastOcc: string;
  colUpcoming: string;
  colBookings: string;
  colCleanings: string;
  colTopSource: string;
  allPropertiesLabel: (count: number) => string;
  period: string;
  allPeriod: string;
  monthsLabel: (n: number) => string;
  periodHelp: string;
  exportTitle: string;
  exportingProperty: (name: string) => string;
  exportingAll: (count: number) => string;
  fromLabel: string;
  toLabel: string;
  downloadCsv: string;
  exportHelp: string;
  dataSources: string;
  dataSourcesHelp: string;
}

const COPY: Record<Locale, CopyShape> = {
  en: {
    reports: "Reports",
    portfolioSubtitle: (count) =>
      `Portfolio across ${count} ${count === 1 ? "property" : "properties"} — history + upcoming`,
    propertySubtitle: (name) => `${name} — history & pipeline`,
    noDataYet: "no data yet",
    pastWindow: (months) => `last ${months} ${months === 1 ? "month" : "months"}`,
    noProperties: "No properties to report on yet.",
    pastOccupancy: "Past occupancy",
    upcomingNights: "Upcoming nights",
    upcomingNightsSubtitle: (months) => `next ${months} mo.`,
    bookings: "Bookings",
    avgNights: (n) => `avg ${n} nights`,
    allTime: "all time",
    cleaningsAhead: "Cleanings ahead",
    cleaningsAheadSubtitle: "one per upcoming checkout",
    topSource: "Top source:",
    chartHeader: (max) => `Nights occupied per month (max ${max})`,
    yAxisUnit: "d",
    tooltipUnit: "nights",
    now: "now",
    past: "past",
    upcoming: "upcoming",
    noBookings: "No bookings yet.",
    loading: "Loading…",
    byProperty: "By property",
    byPropertyHint: "Click a property to open its scoped report.",
    colProperty: "Property",
    colPastOcc: "Past occ.",
    colUpcoming: "Upcoming",
    colBookings: "Bookings",
    colCleanings: "Cleanings",
    colTopSource: "Top source",
    allPropertiesLabel: (count) => `All properties (${count})`,
    period: "Period",
    allPeriod: "All",
    monthsLabel: (n) => `${n}M`,
    periodHelp: "Past window + next 6 months. \"All\" extends back to your earliest stay.",
    exportTitle: "Export reservations",
    exportingProperty: (name) => `Exporting ${name}.`,
    exportingAll: (count) =>
      `All ${count} ${count === 1 ? "property" : "properties"}.`,
    fromLabel: "From",
    toLabel: "To",
    downloadCsv: "Download CSV",
    exportHelp: "Leave dates blank to export everything. UTF-8 BOM for Excel.",
    dataSources: "Data sources",
    dataSourcesHelp:
      "Numbers combine your reservations + iCal events. A linked claim replaces its exact platform event; Direct extensions stay separate. Past stays remain in our DB after platforms drop them from their feeds.",
  },
  ru: {
    reports: "Отчёты",
    portfolioSubtitle: (count) => `Сводка по ${count} объектам — прошлое + ближайшие месяцы`,
    propertySubtitle: (name) => `${name} — история и план`,
    noDataYet: "нет данных",
    pastWindow: (months) => `${months} мес. назад`,
    noProperties: "Нет объектов для отчёта.",
    pastOccupancy: "Заполняемость",
    upcomingNights: "Ночей вперёд",
    upcomingNightsSubtitle: (months) => `на ${months} мес.`,
    bookings: "Бронирований",
    avgNights: (n) => `средн. ${n} ноч.`,
    allTime: "за весь период",
    cleaningsAhead: "Уборок впереди",
    cleaningsAheadSubtitle: "после выезда гостей",
    topSource: "Главный источник:",
    chartHeader: (max) => `Ночи занятости по месяцам (макс. ${max})`,
    yAxisUnit: "д",
    tooltipUnit: "ноч.",
    now: "сейчас",
    past: "прошедшие",
    upcoming: "впереди",
    noBookings: "Бронирований пока нет.",
    loading: "Загрузка…",
    byProperty: "По объектам",
    byPropertyHint: "Кликните по объекту, чтобы открыть его отчёт.",
    colProperty: "Объект",
    colPastOcc: "Заполн.",
    colUpcoming: "Впереди",
    colBookings: "Брон.",
    colCleanings: "Уборок",
    colTopSource: "Источник",
    allPropertiesLabel: (count) => `Все объекты (${count})`,
    period: "Период",
    allPeriod: "Все",
    monthsLabel: (n) => `${n}м`,
    periodHelp: "Прошлые месяцы + 6 месяцев вперёд. «Все» — с самой ранней брони.",
    exportTitle: "Экспорт броней",
    exportingProperty: (name) => `Будет выгружен ${name}.`,
    exportingAll: (count) => `Все ${count} объекта.`,
    fromLabel: "С",
    toLabel: "По",
    downloadCsv: "Скачать CSV",
    exportHelp: "Пустые поля = выгрузить все. UTF-8 BOM для Excel.",
    dataSources: "Источники данных",
    dataSourcesHelp:
      "Цифры считаются из ваших броней + событий iCal. Привязанная бронь заменяет точное событие платформы, а прямое продление учитывается отдельно. Прошлые брони сохраняются в нашей БД после удаления из фида.",
  },
  de: {
    reports: "Berichte",
    portfolioSubtitle: (count) =>
      `Portfolio über ${count} ${count === 1 ? "Unterkunft" : "Unterkünfte"} — Verlauf + Pipeline`,
    propertySubtitle: (name) => `${name} — Verlauf & Pipeline`,
    noDataYet: "noch keine Daten",
    pastWindow: (months) => `letzte ${months} ${months === 1 ? "Monat" : "Monate"}`,
    noProperties: "Noch keine Unterkünfte für Berichte.",
    pastOccupancy: "Auslastung (Vergangenheit)",
    upcomingNights: "Anstehende Nächte",
    upcomingNightsSubtitle: (months) => `nächste ${months} Mon.`,
    bookings: "Buchungen",
    avgNights: (n) => `Ø ${n} Nächte`,
    allTime: "gesamt",
    cleaningsAhead: "Anstehende Reinigungen",
    cleaningsAheadSubtitle: "eine pro anstehendem Check-out",
    topSource: "Top-Quelle:",
    chartHeader: (max) => `Belegte Nächte pro Monat (max. ${max})`,
    yAxisUnit: "T",
    tooltipUnit: "Nächte",
    now: "jetzt",
    past: "vergangen",
    upcoming: "anstehend",
    noBookings: "Noch keine Buchungen.",
    loading: "Wird geladen…",
    byProperty: "Pro Unterkunft",
    byPropertyHint: "Klicken Sie auf eine Unterkunft, um deren Bericht zu öffnen.",
    colProperty: "Unterkunft",
    colPastOcc: "Auslastung",
    colUpcoming: "Anstehend",
    colBookings: "Buchungen",
    colCleanings: "Reinigungen",
    colTopSource: "Top-Quelle",
    allPropertiesLabel: (count) => `Alle Unterkünfte (${count})`,
    period: "Zeitraum",
    allPeriod: "Alle",
    monthsLabel: (n) => `${n}M`,
    periodHelp: "Vergangenes Fenster + nächste 6 Monate. „Alle\" reicht zurück bis zur frühesten Buchung.",
    exportTitle: "Buchungen exportieren",
    exportingProperty: (name) => `Export von ${name}.`,
    exportingAll: (count) =>
      `Alle ${count} ${count === 1 ? "Unterkunft" : "Unterkünfte"}.`,
    fromLabel: "Von",
    toLabel: "Bis",
    downloadCsv: "CSV herunterladen",
    exportHelp: "Daten leer lassen, um alles zu exportieren. UTF-8 BOM für Excel.",
    dataSources: "Datenquellen",
    dataSourcesHelp:
      "Die Zahlen kombinieren Buchungen und iCal-Events. Eine verknüpfte Übernahme ersetzt nur ihr exaktes Plattform-Event; direkte Verlängerungen bleiben separat. Vergangene Buchungen bleiben in unserer DB erhalten.",
  },
  fr: {
    reports: "Rapports",
    portfolioSubtitle: (count) =>
      `Portefeuille de ${count} ${count === 1 ? "logement" : "logements"} — historique + à venir`,
    propertySubtitle: (name) => `${name} — historique & pipeline`,
    noDataYet: "pas encore de données",
    pastWindow: (months) => `${months} ${months === 1 ? "dernier mois" : "derniers mois"}`,
    noProperties: "Aucun logement à analyser pour le moment.",
    pastOccupancy: "Taux d’occupation passé",
    upcomingNights: "Nuits à venir",
    upcomingNightsSubtitle: (months) => `${months} prochains mois`,
    bookings: "Réservations",
    avgNights: (n) => `moy. ${n} nuits`,
    allTime: "depuis le début",
    cleaningsAhead: "Ménages à venir",
    cleaningsAheadSubtitle: "un par départ à venir",
    topSource: "Source principale :",
    chartHeader: (max) => `Nuits occupées par mois (max ${max})`,
    yAxisUnit: "j",
    tooltipUnit: "nuits",
    now: "maintenant",
    past: "passé",
    upcoming: "à venir",
    noBookings: "Aucune réservation pour le moment.",
    loading: "Chargement…",
    byProperty: "Par logement",
    byPropertyHint: "Cliquez sur un logement pour ouvrir son rapport ciblé.",
    colProperty: "Logement",
    colPastOcc: "Occ. passée",
    colUpcoming: "À venir",
    colBookings: "Réservations",
    colCleanings: "Ménages",
    colTopSource: "Source principale",
    allPropertiesLabel: (count) => `Tous les logements (${count})`,
    period: "Période",
    allPeriod: "Tout",
    monthsLabel: (n) => `${n}M`,
    periodHelp: "Fenêtre passée + 6 mois à venir. « Tout » remonte jusqu’à votre première réservation.",
    exportTitle: "Exporter les réservations",
    exportingProperty: (name) => `Export de ${name}.`,
    exportingAll: (count) =>
      `Les ${count} logements.`,
    fromLabel: "Du",
    toLabel: "Au",
    downloadCsv: "Télécharger CSV",
    exportHelp: "Laissez les dates vides pour tout exporter. BOM UTF-8 pour Excel.",
    dataSources: "Sources de données",
    dataSourcesHelp:
      "Les chiffres combinent vos réservations et les événements iCal. Une réservation associée remplace son événement de plateforme exact ; les prolongations directes restent séparées. Les séjours passés restent dans notre base.",
  },
  es: {
    reports: "Informes",
    portfolioSubtitle: (count) =>
      `Cartera de ${count} ${count === 1 ? "alojamiento" : "alojamientos"} — historial + próximas`,
    propertySubtitle: (name) => `${name} — historial y pipeline`,
    noDataYet: "aún sin datos",
    pastWindow: (months) => `últimos ${months} ${months === 1 ? "mes" : "meses"}`,
    noProperties: "Aún no hay alojamientos para informar.",
    pastOccupancy: "Ocupación pasada",
    upcomingNights: "Noches próximas",
    upcomingNightsSubtitle: (months) => `próximos ${months} meses`,
    bookings: "Reservas",
    avgNights: (n) => `media ${n} noches`,
    allTime: "histórico",
    cleaningsAhead: "Limpiezas próximas",
    cleaningsAheadSubtitle: "una por cada salida próxima",
    topSource: "Fuente principal:",
    chartHeader: (max) => `Noches ocupadas por mes (máx. ${max})`,
    yAxisUnit: "d",
    tooltipUnit: "noches",
    now: "ahora",
    past: "pasado",
    upcoming: "próximo",
    noBookings: "Aún no hay reservas.",
    loading: "Cargando…",
    byProperty: "Por alojamiento",
    byPropertyHint: "Haga clic en un alojamiento para abrir su informe.",
    colProperty: "Alojamiento",
    colPastOcc: "Ocup. pasada",
    colUpcoming: "Próximas",
    colBookings: "Reservas",
    colCleanings: "Limpiezas",
    colTopSource: "Fuente principal",
    allPropertiesLabel: (count) => `Todos los alojamientos (${count})`,
    period: "Período",
    allPeriod: "Todo",
    monthsLabel: (n) => `${n}M`,
    periodHelp: "Ventana pasada + próximos 6 meses. «Todo» llega hasta su primera estancia.",
    exportTitle: "Exportar reservas",
    exportingProperty: (name) => `Exportando ${name}.`,
    exportingAll: (count) =>
      `Los ${count} ${count === 1 ? "alojamiento" : "alojamientos"}.`,
    fromLabel: "Desde",
    toLabel: "Hasta",
    downloadCsv: "Descargar CSV",
    exportHelp: "Deje las fechas vacías para exportarlo todo. UTF-8 BOM para Excel.",
    dataSources: "Fuentes de datos",
    dataSourcesHelp:
      "Las cifras combinan sus reservas y eventos iCal. Una reserva vinculada sustituye solo su evento exacto de plataforma; las ampliaciones directas quedan separadas. Las estancias pasadas se conservan en nuestra base.",
  },
};

// Bundled platform presets — kept inline rather than imported from
// @/lib/platforms because that module's lazy `import("@/lib/prisma")`
// gets traced into the client bundle by Turbopack and breaks the
// build (prisma uses node:module).
const FALLBACK_PLATFORM_COLOR = "#6B7280";

const PLATFORM_PRESETS: ReadonlyArray<{ slug: string; displayName: string; color: string }> = [
  { slug: "airbnb", displayName: "Airbnb", color: "#FF385C" },
  { slug: "booking", displayName: "Booking.com", color: "#003580" },
  { slug: "vrbo", displayName: "Vrbo", color: "#245ABC" },
  { slug: "expedia", displayName: "Expedia", color: "#FFC72C" },
  { slug: "hostaway", displayName: "Hostaway", color: "#2E5BFF" },
  { slug: "lodgify", displayName: "Lodgify", color: "#00B5AD" },
  { slug: "hospitable", displayName: "Hospitable", color: "#1B5E20" },
  { slug: "smoobu", displayName: "Smoobu", color: "#4A148C" },
  { slug: "houfy", displayName: "Houfy", color: "#D84315" },
  { slug: "plumguide", displayName: "Plum Guide", color: "#2E1065" },
  { slug: "whimstay", displayName: "Whimstay", color: "#FF7043" },
  { slug: "direct", displayName: "Direct", color: FALLBACK_PLATFORM_COLOR },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function resolvePlatformColor(color: string | null | undefined): string {
  if (!color) return FALLBACK_PLATFORM_COLOR;
  return HEX_COLOR_RE.test(color) ? color : FALLBACK_PLATFORM_COLOR;
}

interface ReportsPanelProps {
  property: Property | null;
  properties: Property[];
}

type CurrentMonthFinancialData = {
  reservations: Array<{
    propertyId: number;
    receivedBOB: number;
    receivedUSD: number;
  }>;
};

export interface CalendarEventRow {
  id: number;
  propertyId: number;
  uid: string;
  platform: string;
  summary: string;
  startDate: string;
  endDate: string;
}

interface MonthBucket {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  totalDays: number;
  isPast: boolean;
  isCurrent: boolean;
  /** Per-platform occupancy: platform slug -> nights occupied in this month. */
  perPlatform: Record<string, number>;
}

type PeriodChoice = 3 | 6 | 12 | 24 | "all";
const DEFAULT_PERIOD: PeriodChoice = 6;
const FUTURE_MONTHS = 6; // forward window for upcoming nights

function ymKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface NormalizedStay {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD exclusive (checkout day not occupied)
  platform: string;
  propertyId: number;
  /** Exact source identity used only to collapse internal checkout
   *  boundaries for cleaning KPIs. Occupancy/channel KPIs still see each
   *  source and Direct segment as its own booking. */
  cleaningGroupKey?: string;
}

type LinkedEventRole = "claim" | "extension";

function normalizedPlatform(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** Calendar-event UIDs are unique only inside one platform feed. */
function linkedSourceKey(platform: string, uid: string): string {
  return `${normalizedPlatform(platform)}\u0000${uid.trim()}`;
}

/**
 * Build a [past N months · current · next FUTURE_MONTHS months] window
 * of buckets, trimmed at the edges to whatever data actually exists.
 * `pastMonths === "all"` skips the past cap entirely so every historical
 * stay in the DB renders. The forward edge always extends as far as the
 * latest upcoming stay (capped at +12 mo so an outlier booking 3 years
 * out doesn't squish the chart).
 */
function buildMonthRange(stays: NormalizedStay[], pastMonths: PeriodChoice): MonthBucket[] {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Start: the earliest stay's month, clamped to `pastMonths` back
  // (or no clamp at all in "all" mode).
  let earliestMonth = currentMonthStart;
  for (const s of stays) {
    const d = new Date(s.start + "T00:00:00");
    if (d < earliestMonth) earliestMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  let start: Date;
  if (pastMonths === "all") {
    start = earliestMonth;
  } else {
    const startCap = new Date(currentMonthStart);
    startCap.setMonth(startCap.getMonth() - pastMonths);
    start = earliestMonth < startCap ? startCap : earliestMonth;
  }

  // End: latest stay's month + 1, clamped to FUTURE_MONTHS forward
  // (with a hard 12-month forward cap so an outlier doesn't blow up).
  const endCap = new Date(currentMonthStart);
  endCap.setMonth(endCap.getMonth() + FUTURE_MONTHS);
  let latestMonth = endCap;
  for (const s of stays) {
    const d = new Date(s.end + "T00:00:00");
    if (d > latestMonth) latestMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const hardCap = new Date(currentMonthStart);
  hardCap.setMonth(hardCap.getMonth() + 12);
  const end = latestMonth > hardCap ? hardCap : latestMonth;

  const buckets: MonthBucket[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const monthEnd = new Date(year, monthIndex + 1, 0); // last day of month
    const totalDays = monthEnd.getDate();
    const isPast = monthEnd < today;
    const isCurrent =
      year === currentMonthStart.getFullYear() && monthIndex === currentMonthStart.getMonth();
    buckets.push({
      key: ymKey(year, monthIndex),
      label: cursor.toLocaleDateString("en-GB", {
        month: "short",
        // Show year on Jan and on the very first bucket so cross-year context is visible.
        year: monthIndex === 0 || buckets.length === 0 ? "2-digit" : undefined,
      }),
      year,
      monthIndex,
      totalDays,
      isPast,
      isCurrent,
      perPlatform: {},
    });
    cursor.setMonth(monthIndex + 1, 1);
  }
  return buckets;
}

/** Distribute each stay's occupied days across the month buckets. */
function fillBuckets(buckets: MonthBucket[], stays: NormalizedStay[]): void {
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const firstBucket = buckets[0];
  if (!firstBucket) return;
  const horizonStart = new Date(firstBucket.year, firstBucket.monthIndex, 1);
  const lastBucket = buckets[buckets.length - 1];
  const horizonEnd = new Date(lastBucket.year, lastBucket.monthIndex + 1, 1);

  for (const s of stays) {
    const stayStart = new Date(s.start + "T00:00:00");
    const stayEndExclusive = new Date(s.end + "T00:00:00");
    if (stayEndExclusive <= horizonStart) continue;
    if (stayStart >= horizonEnd) continue;

    const cur = new Date(Math.max(stayStart.getTime(), horizonStart.getTime()));
    const stop = new Date(Math.min(stayEndExclusive.getTime(), horizonEnd.getTime()));
    while (cur < stop) {
      const key = ymKey(cur.getFullYear(), cur.getMonth());
      const bucket = byKey.get(key);
      if (bucket) {
        bucket.perPlatform[s.platform] = (bucket.perPlatform[s.platform] ?? 0) + 1;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
}

interface PlatformMeta {
  slug: string;
  label: string;
  color: string;
}

function platformMeta(slug: string): PlatformMeta {
  const preset = PLATFORM_PRESETS.find((p) => p.slug === slug);
  if (preset) return { slug, label: preset.displayName, color: resolvePlatformColor(preset.color) };
  return { slug, label: slug.charAt(0).toUpperCase() + slug.slice(1), color: FALLBACK_PLATFORM_COLOR };
}

/** True for iCal summaries that indicate a generic blocked entry
 *  rather than a guest name (Airbnb's "Reserved", Booking's "CLOSED",
 *  host-blocks, etc.). Used to merge iCal twins of manually-entered
 *  Reservations on identical dates when the host hasn't gone through
 *  the bar-claim popover. */
function isGenericIcalName(summary: string): boolean {
  if (!summary) return true;
  const s = summary.toLowerCase().trim();
  return (
    s === "reserved" ||
    s === "closed" ||
    s.includes("not available") ||
    s.includes("blocked") ||
    s.includes("closed - not available")
  );
}

/** Build the deduped list of stays for one property. Three layers of
 *  dedup so the same real-world booking is never counted twice:
 *    1. An explicit linked `claim` replaces only its exact
 *       platform+UID iCal source. A linked `extension` remains a
 *       separate Direct segment and keeps the source in all KPIs.
 *       Legacy null-role rows are inferred by overlap vs adjacency.
 *    2. Same start+end + generic iCal summary → drop the iCal twin
 *       (catches manually-entered Reservations whose iCal feed is
 *       still emitting an unclaimed twin).
 *    3. Airbnb host-blocks → filtered out (not real guests). */
export function buildStaysForProperty(
  prop: Property,
  events: CalendarEventRow[],
): NormalizedStay[] {
  const propertyEvents = events.filter((event) => event.propertyId === prop.id);
  const eventBySource = new Map<string, CalendarEventRow>();
  for (const event of propertyEvents) {
    if (event.uid) {
      eventBySource.set(linkedSourceKey(event.platform, event.uid), event);
    }
  }

  const linkedRoleByReservation = new Map<number, LinkedEventRole | null>();
  const linkedSourceByReservation = new Map<number, string>();
  const claimedSources = new Set<string>();
  for (const reservation of prop.reservations) {
    const explicitRole = reservation.linkedEventRole;
    const uid = reservation.linkedEventUid?.trim();
    const reservationPlatform = normalizedPlatform(reservation.platform);
    const sourcePlatform = normalizedPlatform(
      reservation.linkedEventPlatform ||
        (reservationPlatform !== "direct" ? reservationPlatform : ""),
    );

    let role: LinkedEventRole | null = explicitRole || null;
    const sourceKey = uid && sourcePlatform
      ? linkedSourceKey(sourcePlatform, uid)
      : null;

    // Old rows have no role and used Reservation.platform as their
    // linked-source platform. Infer only from the exact pair; never let
    // a same-UID event from another feed decide whether this is a claim.
    if (!role && sourceKey) {
      const source = eventBySource.get(sourceKey);
      if (source) {
        const reservationStart = isoDate(new Date(reservation.checkIn));
        const reservationEnd = isoDate(new Date(reservation.checkOut));
        const overlapsSource =
          reservationStart < source.endDate && reservationEnd > source.startDate;
        const abutsSource =
          reservationEnd === source.startDate || reservationStart === source.endDate;
        if (overlapsSource) role = "claim";
        else if (abutsSource) role = "extension";
      }
    }

    linkedRoleByReservation.set(reservation.id, role);
    if (role && sourceKey) linkedSourceByReservation.set(reservation.id, sourceKey);
    if (role === "claim" && sourceKey) claimedSources.add(sourceKey);
  }

  const reservationDateKeys = new Set<string>();
  for (const r of prop.reservations) {
    // Role wins over the old same-date heuristic: extensions retain
    // their source even if malformed legacy data overlaps it.
    if (linkedRoleByReservation.get(r.id) === "extension") continue;
    reservationDateKeys.add(
      `${normalizedPlatform(r.platform)}\u0000${isoDate(new Date(r.checkIn))}|${isoDate(new Date(r.checkOut))}`,
    );
  }
  const stays: NormalizedStay[] = [];
  for (const ev of propertyEvents) {
    const platform = (ev.platform || "").toLowerCase();
    const isAirbnbBlock =
      platform === "airbnb" &&
      (ev.summary?.includes("Not available") || ev.summary?.includes("Blocked"));
    if (isAirbnbBlock) continue;
    if (ev.uid && claimedSources.has(linkedSourceKey(ev.platform, ev.uid))) continue;
    const dateKey = `${platform}\u0000${ev.startDate}|${ev.endDate}`;
    if (reservationDateKeys.has(dateKey) && isGenericIcalName(ev.summary || "")) continue;
    stays.push({
      start: ev.startDate,
      end: ev.endDate,
      platform,
      propertyId: prop.id,
      cleaningGroupKey: ev.uid
        ? linkedSourceKey(ev.platform, ev.uid)
        : undefined,
    });
  }
  for (const r of prop.reservations) {
    stays.push({
      start: isoDate(new Date(r.checkIn)),
      end: isoDate(new Date(r.checkOut)),
      platform:
        linkedRoleByReservation.get(r.id) === "extension"
          ? "direct"
          : (r.platform || "direct").toLowerCase(),
      propertyId: prop.id,
      cleaningGroupKey: linkedSourceByReservation.get(r.id),
    });
  }
  return stays;
}

/**
 * Count actionable checkout boundaries while treating connected pieces of
 * one exact linked stay as a single cleaning unit. This deliberately does
 * not alter booking/channel counts: only the internal source→Direct seam is
 * removed from the cleaning KPI.
 */
export function countUpcomingCleaningBoundaries(
  stays: NormalizedStay[],
  propertyId: number,
  today: Date,
  futureEndCap: Date,
): number {
  const grouped = new Map<string, NormalizedStay[]>();
  let unlinkedCount = 0;

  for (const stay of stays) {
    if (stay.propertyId !== propertyId) continue;
    const start = new Date(`${stay.start}T00:00:00`);
    const end = new Date(`${stay.end}T00:00:00`);
    if (end <= start) continue;

    if (!stay.cleaningGroupKey) {
      if (end > today && end <= futureEndCap) unlinkedCount += 1;
      continue;
    }

    const key = `${propertyId}\u0000${stay.cleaningGroupKey}`;
    const group = grouped.get(key);
    if (group) group.push(stay);
    else grouped.set(key, [stay]);
  }

  let linkedCount = 0;
  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) =>
      a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    let componentEnd = sorted[0]?.end;
    if (!componentEnd) continue;

    for (let i = 1; i < sorted.length; i++) {
      const stay = sorted[i];
      // Half-open ranges form one continuous stay when the next segment
      // begins no later than the current checkout (overlap or adjacency).
      if (stay.start <= componentEnd) {
        if (stay.end > componentEnd) componentEnd = stay.end;
        continue;
      }

      const end = new Date(`${componentEnd}T00:00:00`);
      if (end > today && end <= futureEndCap) linkedCount += 1;
      componentEnd = stay.end;
    }

    const end = new Date(`${componentEnd}T00:00:00`);
    if (end > today && end <= futureEndCap) linkedCount += 1;
  }

  return unlinkedCount + linkedCount;
}

/**
 * Per-property KPIs split into past + upcoming. Past occupancy is the
 * only honest "occupancy %" because future months still have bookable
 * days — counting those toward occupancy makes it look artificially
 * low for properties that get last-minute bookings.
 */
interface PropertyKpis {
  property: Property;
  pastNights: number;
  pastDays: number;
  pastOccupancy: number;     // % of completed past months that were occupied
  upcomingNights: number;    // raw nights booked in next FUTURE_MONTHS months
  totalBookings: number;     // count of stays touching the displayed window
  pastBookings: number;      // count of stays that ended in the past window
  avgStayNights: number;
  topPlatform: PlatformMeta | null;
  cleaningsUpcoming: number;
}

function computePropertyKpis(
  prop: Property,
  stays: NormalizedStay[],
  buckets: MonthBucket[],
): PropertyKpis {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const futureEndCap = new Date(now.getFullYear(), now.getMonth() + FUTURE_MONTHS + 1, 1);

  // Past horizon = first past bucket → end of the month before this one.
  const pastBuckets = buckets.filter((b) => b.isPast && stays.some((s) => s.propertyId === prop.id));
  // Past day total = sum of days in past months that are fully done.
  const pastStart = pastBuckets[0]
    ? new Date(pastBuckets[0].year, pastBuckets[0].monthIndex, 1)
    : currentMonthStart;
  const pastEnd = currentMonthStart; // exclusive (today's month is "current", not past)
  const pastDays = Math.round((pastEnd.getTime() - pastStart.getTime()) / 86_400_000);

  let pastNights = 0;
  let upcomingNights = 0;
  let totalBookings = 0;
  let pastBookings = 0;
  let totalNightsAllTime = 0;
  let cleaningsUpcoming = 0;
  const perPlatform = new Map<string, number>();

  for (const s of stays) {
    if (s.propertyId !== prop.id) continue;
    const sStart = new Date(s.start + "T00:00:00");
    const sEnd = new Date(s.end + "T00:00:00");

    // Past portion of stay: clipped to [pastStart, pastEnd)
    const pStart = new Date(Math.max(sStart.getTime(), pastStart.getTime()));
    const pStop = new Date(Math.min(sEnd.getTime(), pastEnd.getTime()));
    if (pStop > pStart) {
      pastNights += Math.round((pStop.getTime() - pStart.getTime()) / 86_400_000);
    }

    // Upcoming portion: clipped to [today, futureEndCap)
    const uStart = new Date(Math.max(sStart.getTime(), today.getTime()));
    const uStop = new Date(Math.min(sEnd.getTime(), futureEndCap.getTime()));
    if (uStop > uStart) {
      upcomingNights += Math.round((uStop.getTime() - uStart.getTime()) / 86_400_000);
    }

    // Total stay length toward avg-stay calculation (uses the WHOLE stay,
    // not just the part that fits the report window — a stay either is
    // a stay or it isn't).
    const stayNights = Math.max(0, Math.round((sEnd.getTime() - sStart.getTime()) / 86_400_000));
    if (stayNights > 0) {
      totalBookings += 1;
      totalNightsAllTime += stayNights;
      perPlatform.set(s.platform, (perPlatform.get(s.platform) ?? 0) + stayNights);
      if (sEnd <= today) pastBookings += 1;
    }
  }

  cleaningsUpcoming = countUpcomingCleaningBoundaries(
    stays,
    prop.id,
    today,
    futureEndCap,
  );

  const pastOccupancy = pastDays > 0 ? Math.round((100 * pastNights) / pastDays) : 0;
  const avgStayNights =
    totalBookings > 0 ? Math.round((totalNightsAllTime / totalBookings) * 10) / 10 : 0;

  let topPlatform: PlatformMeta | null = null;
  let topNights = 0;
  for (const [slug, n] of perPlatform) {
    if (n > topNights) {
      topNights = n;
      topPlatform = platformMeta(slug);
    }
  }

  return {
    property: prop,
    pastNights,
    pastDays,
    pastOccupancy,
    upcomingNights,
    totalBookings,
    pastBookings,
    avgStayNights,
    topPlatform,
    cleaningsUpcoming,
  };
}

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
}
function KpiCard({ label, value, subtitle, accent }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${accent ? "text-[var(--m-accent)]" : "text-[var(--ink)]"}`}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-0.5 text-[11px] text-[var(--ink-3)] leading-snug">{subtitle}</div>
      )}
    </div>
  );
}

export function ReportsPanel({ property, properties }: ReportsPanelProps) {
  const { locale } = useI18n();
  const c = COPY[locale];
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodMonths, setPeriodMonths] = useState<PeriodChoice>(DEFAULT_PERIOD);
  const [currentMonthFinancial, setCurrentMonthFinancial] = useState<CurrentMonthFinancialData | null>(null);
  const [currentMonthFinancialLoading, setCurrentMonthFinancialLoading] = useState(true);
  const [profitExchangeRate, setProfitExchangeRate] = useState("");
  const { rate: officialRate } = useOfficialExchangeRate();
  const abortRef = useRef<AbortController | null>(null);

  const targetProperties = useMemo(
    () => (property ? [property] : properties),
    [property, properties],
  );
  const isMulti = !property;

  const currentMonthPeriod = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      from: key(new Date(year, month, 1)),
      to: key(new Date(year, month + 1, 0)),
      label: new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric" }).format(now),
    };
  }, []);
  const targetIdsKey = useMemo(
    () => targetProperties.map((p) => p.id).sort((a, b) => a - b).join(","),
    [targetProperties],
  );

  useEffect(() => {
    if (targetProperties.length === 0) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate fetch-on-prop-change pattern; loading state must flip on the same render that kicks off the request
    setLoading(true);
    const url = property
      ? `/api/calendar/sync?propertyId=${property.id}&limit=2000`
      : `/api/calendar/sync?limit=5000`;
    fetch(url, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [property, targetIdsKey, targetProperties.length]);

  useEffect(() => {
    if (!isMulti || properties.length === 0) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh request must replace the prior period's loading state
    setCurrentMonthFinancialLoading(true);
    fetch(`/api/reports/financial?from=${currentMonthPeriod.from}&to=${currentMonthPeriod.to}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setCurrentMonthFinancial(data))
      .catch(() => {})
      .finally(() => setCurrentMonthFinancialLoading(false));
    return () => controller.abort();
  }, [currentMonthPeriod.from, currentMonthPeriod.to, isMulti, properties.length]);

  const propertyProfitability = useMemo(() => {
    const automaticExchangeRate = profitExchangeRate || (officialRate ? String(officialRate.bobPerUsd) : "12");
    const rate = Number(automaticExchangeRate.replace(",", "."));
    const validRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
    const incomeByProperty = new Map<number, { BOB: number; USD: number }>();
    for (const reservation of currentMonthFinancial?.reservations || []) {
      const totals = incomeByProperty.get(reservation.propertyId) || { BOB: 0, USD: 0 };
      totals.BOB += reservation.receivedBOB / 100;
      totals.USD += reservation.receivedUSD / 100;
      incomeByProperty.set(reservation.propertyId, totals);
    }
    return properties
      .filter((item) => (item.monthlyRentMinor || 0) + (item.monthlyServicesMinor || 0) + (item.monthlyMaintenanceMinor || 0) > 0)
      .map((item) => {
        const income = incomeByProperty.get(item.id) || { BOB: 0, USD: 0 };
        const grossBOB = income.BOB + income.USD * validRate;
        const rent = (item.monthlyRentMinor || 0) / 100;
        const services = (item.monthlyServicesMinor || 0) / 100;
        const maintenance = (item.monthlyMaintenanceMinor || 0) / 100;
        const administrationBps = item.financialModel === "operator_split" && item.financialOperator === "milton" ? 2000 : 0;
        return {
          property: item,
          income,
          grossBOB,
          rent,
          services,
          maintenance,
          administrationBps,
          grossProfitBOB: grossBOB - rent - services - maintenance,
        };
      })
      .sort((a, b) => a.property.name.localeCompare(b.property.name, "es"));
  }, [currentMonthFinancial, officialRate, profitExchangeRate, properties]);

  const allStays: NormalizedStay[] = useMemo(() => {
    const out: NormalizedStay[] = [];
    for (const p of targetProperties) {
      out.push(...buildStaysForProperty(p, events));
    }
    return out;
  }, [targetProperties, events]);

  const buckets = useMemo(() => {
    const b = buildMonthRange(allStays, periodMonths);
    fillBuckets(b, allStays);
    return b;
  }, [allStays, periodMonths]);

  const propertyKpis: PropertyKpis[] = useMemo(() => {
    return targetProperties.map((p) => computePropertyKpis(p, allStays, buckets));
  }, [targetProperties, allStays, buckets]);

  const aggregate = useMemo(() => {
    let pastNights = 0;
    let pastDays = 0;
    let upcomingNights = 0;
    let totalBookings = 0;
    let pastBookings = 0;
    let cleaningsUpcoming = 0;
    let totalNightsAllTime = 0;
    const perPlatform = new Map<string, number>();
    for (const k of propertyKpis) {
      pastNights += k.pastNights;
      pastDays += k.pastDays;
      upcomingNights += k.upcomingNights;
      totalBookings += k.totalBookings;
      pastBookings += k.pastBookings;
      cleaningsUpcoming += k.cleaningsUpcoming;
      totalNightsAllTime += k.avgStayNights * k.totalBookings;
    }
    // Per-platform totals derived from the VISIBLE buckets only. This
    // keeps the "Top source" pill consistent with what the user is
    // looking at — if the window is "Last 3 months" the source pill
    // reflects the 3-month winner, not all-time. Earlier the aggregate
    // used `allStays` (all-time) and the pill said "Booking" while the
    // chart only showed Airbnb because the user's Booking history fell
    // outside the visible window.
    for (const b of buckets) {
      for (const [slug, n] of Object.entries(b.perPlatform)) {
        perPlatform.set(slug, (perPlatform.get(slug) ?? 0) + n);
      }
    }
    const pastOccupancy = pastDays > 0 ? Math.round((100 * pastNights) / pastDays) : 0;
    const avgStayNights =
      totalBookings > 0 ? Math.round((totalNightsAllTime / totalBookings) * 10) / 10 : 0;
    let topPlatform: PlatformMeta | null = null;
    let topNights = 0;
    for (const [slug, n] of perPlatform) {
      if (n > topNights) {
        topNights = n;
        topPlatform = platformMeta(slug);
      }
    }
    return {
      pastNights,
      pastDays,
      pastOccupancy,
      upcomingNights,
      totalBookings,
      pastBookings,
      cleaningsUpcoming,
      avgStayNights,
      topPlatform,
    };
  }, [propertyKpis, buckets]);

  const activePlatforms = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of buckets) {
      for (const [slug, nights] of Object.entries(b.perPlatform)) {
        totals.set(slug, (totals.get(slug) ?? 0) + nights);
      }
    }
    const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    return entries.map(([slug]) => platformMeta(slug));
  }, [buckets]);

  const chartData = useMemo(
    () =>
      buckets.map((b) => {
        const row: Record<string, string | number | boolean> = {
          label: b.label,
          isPast: b.isPast,
          isCurrent: b.isCurrent,
          totalDays: b.totalDays,
        };
        for (const platform of activePlatforms) {
          row[platform.slug] = b.perPlatform[platform.slug] ?? 0;
        }
        return row;
      }),
    [buckets, activePlatforms],
  );

  // Auto y-axis: round up to next multiple of 5 above the busiest month
  // OR cap at typical max-month-days for visual stability.
  const yAxisMax = useMemo(() => {
    let maxNights = 0;
    for (const b of buckets) {
      const sum = Object.values(b.perPlatform).reduce((a, n) => a + n, 0);
      if (sum > maxNights) maxNights = sum;
    }
    const baseline = isMulti ? targetProperties.length * 31 : 31;
    // Don't shrink below the natural single-property month length so
    // the visual scale stays comparable across months. Round up to the
    // nearest 5 above the actual peak so labels read cleanly.
    return Math.max(baseline, Math.ceil((maxNights + 2) / 5) * 5);
  }, [buckets, isMulti, targetProperties.length]);

  const downloadCsv = () => {
    const params = new URLSearchParams();
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);
    if (property) params.set("propertyId", String(property.id));
    const qs = params.toString();
    window.location.href = `/api/reservations/export${qs ? `?${qs}` : ""}`;
  };

  // Today's column — used by ReferenceLine to show the "now" boundary.
  const currentBucketLabel = useMemo(() => {
    const now = new Date();
    const key = ymKey(now.getFullYear(), now.getMonth());
    return buckets.find((b) => b.key === key)?.label ?? null;
  }, [buckets]);

  const headerSubtitle = isMulti
    ? c.portfolioSubtitle(properties.length)
    : c.propertySubtitle(property!.name);

  const pastWindowLabel = useMemo(() => {
    const pastBuckets = buckets.filter((b) => b.isPast);
    if (pastBuckets.length === 0) return c.noDataYet;
    return c.pastWindow(pastBuckets.length);
  }, [buckets, c]);

  const noData = !loading && targetProperties.length > 0 && aggregate.totalBookings === 0;

  return (
    /* Calendar / cleaning-style two-column shell. Negative side margins
       escape the dashboard's <main> padding so the content lines up
       1:1 with the header; the inner max-w-[1760px] mx-auto matches
       the calendar exactly. */
    <div className="-mx-3 sm:-mx-6 lg:-mx-8">
      <div className="mx-auto max-w-[1760px] px-3 sm:px-5 flex flex-col lg:flex-row gap-6">
        {/* Mobile-only property switcher at the top of the page — on
            mobile the sidebar (with its own switcher) sits below the
            report, so without this the user has to scroll past the
            whole report to change scope. lg:hidden keeps it out of the
            desktop layout where the sidebar switcher is already visible. */}
        {properties.length > 1 && (
          <div className="lg:hidden">
            <PropertySwitcher
              properties={properties}
              selectedPropertyId={property?.id ?? null}
              view="reports"
              showAllOption
            />
          </div>
        )}
        <div className="min-w-0 lg:flex-1 space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--ink)]">
              {c.reports}
            </h1>
            <p className="mt-1 text-xs text-[var(--ink-3)]">{headerSubtitle}</p>
          </div>

          <FinancialReportsPanel propertyId={property?.id} properties={properties} />

          {targetProperties.length === 0 ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-6 text-center text-xs text-[var(--ink-4)]">
              {c.noProperties}
            </div>
          ) : (
            <>
              {/* KPI strip — past-based occupancy is the only honest %;
                  upcoming is shown as raw nights so it doesn't get
                  conflated with "we're 30% full forever" anxiety. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard
                  label={c.pastOccupancy}
                  value={`${aggregate.pastOccupancy}%`}
                  subtitle={pastWindowLabel}
                  accent
                />
                <KpiCard
                  label={c.upcomingNights}
                  value={aggregate.upcomingNights}
                  subtitle={c.upcomingNightsSubtitle(FUTURE_MONTHS)}
                />
                <KpiCard
                  label={c.bookings}
                  value={aggregate.totalBookings}
                  subtitle={
                    aggregate.avgStayNights > 0
                      ? c.avgNights(aggregate.avgStayNights)
                      : c.allTime
                  }
                />
                <KpiCard
                  label={c.cleaningsAhead}
                  value={aggregate.cleaningsUpcoming}
                  subtitle={c.cleaningsAheadSubtitle}
                />
              </div>

              {/* Top-platform readout — colored pill matches calendar bars. */}
              {aggregate.topPlatform && (
                <div className="flex items-center gap-2 text-xs text-[var(--ink-3)]">
                  <span>{c.topSource}</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: aggregate.topPlatform.color }}
                  >
                    {aggregate.topPlatform.label}
                  </span>
                </div>
              )}

              {/* Chart — past months muted via opacity so the eye lands
                  on the actionable upcoming window. ReferenceLine marks
                  "now". Custom legend renders colored pills (the default
                  Recharts legend's "Booking #003580" text was illegible
                  on dark theme). */}
              <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4 text-[var(--ink-3)]">
                <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                  <span className="text-[var(--ink-3)]">
                    {c.chartHeader(isMulti ? `${targetProperties.length} × 31` : "31")}
                  </span>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke="currentColor" strokeOpacity={0.16} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "currentColor", fontSize: 11 }}
                        axisLine={{ stroke: "currentColor", strokeOpacity: 0.18 }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "currentColor", fontSize: 11 }}
                        axisLine={{ stroke: "currentColor", strokeOpacity: 0.18 }}
                        tickLine={false}
                        domain={[0, yAxisMax]}
                        unit={c.yAxisUnit}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--m-accent)", fillOpacity: 0.06 }}
                        contentStyle={{
                          background: "var(--bg)",
                          border: "1px solid var(--line-2)",
                          borderRadius: 10,
                          color: "var(--ink)",
                          fontSize: 12,
                          boxShadow: "0 4px 16px -8px rgba(0,0,0,0.18)",
                        }}
                        itemStyle={{ color: "var(--ink)" }}
                        labelStyle={{ color: "var(--ink-3)", fontWeight: 500 }}
                        formatter={(value, name) => {
                          const meta = activePlatforms.find((p) => p.slug === name);
                          const label = meta?.label ?? String(name);
                          return [`${value} ${c.tooltipUnit}`, label];
                        }}
                      />
                      {currentBucketLabel && (
                        <ReferenceLine
                          x={currentBucketLabel}
                          stroke="var(--m-accent)"
                          strokeOpacity={0.5}
                          strokeDasharray="4 4"
                          label={{
                            value: c.now,
                            position: "top",
                            fill: "var(--m-accent)",
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        />
                      )}
                      {activePlatforms.map((p, idx) => (
                        <Bar
                          key={p.slug}
                          dataKey={p.slug}
                          stackId="src"
                          fill={p.color}
                          radius={idx === activePlatforms.length - 1 ? [4, 4, 0, 0] : 0}
                        >
                          {chartData.map((row, i) => (
                            <Cell
                              key={`c-${i}-${p.slug}`}
                              fillOpacity={row.isPast ? 0.55 : 1}
                            />
                          ))}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom legend — colored pills with white text, padded
                    enough to read against any theme. Replaces Recharts'
                    default tiny-square + neutral-text legend that hid
                    Booking's #003580 against dark backgrounds. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activePlatforms.map((p) => (
                    <span
                      key={p.slug}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.label}
                    </span>
                  ))}
                  {/* Past/upcoming legend swatch */}
                  {buckets.some((b) => b.isPast) && (
                    <>
                      <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-[11px] text-[var(--ink-3)]">
                        <span className="inline-block h-2 w-3 rounded-sm bg-[var(--ink-3)]/55" />
                        {c.past}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-[11px] text-[var(--ink-3)]">
                        <span className="inline-block h-2 w-3 rounded-sm bg-[var(--ink-3)]" />
                        {c.upcoming}
                      </span>
                    </>
                  )}
                </div>

                {noData && (
                  <p className="mt-3 text-center text-xs text-[var(--ink-4)]">
                    {c.noBookings}
                  </p>
                )}
                {loading && (
                  <p className="mt-3 text-center text-xs text-[var(--ink-4)]">
                    {c.loading}
                  </p>
                )}
              </div>

              {/* Current-month profitability for the properties whose
                  monthly operating costs are configured. */}
              {isMulti && propertyProfitability.length > 0 && (currentMonthFinancialLoading || currentMonthFinancial) && (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] overflow-hidden">
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--ink)]">Resultado por propiedad · {currentMonthPeriod.label}</h2>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">La utilidad bruta descuenta alquiler, servicios y mantenimiento. El porcentaje de administración se muestra como referencia y no se descuenta en esta fórmula.</p>
                    </div>
                    <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                      TC estimado USD → Bs
                      <input
                        aria-label="Tipo de cambio estimado de dólares a bolivianos"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={profitExchangeRate || (officialRate ? String(officialRate.bobPerUsd) : "12")}
                        onChange={(event) => setProfitExchangeRate(event.target.value)}
                        className="mt-1 block h-8 w-28 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-2 text-right text-xs font-semibold text-[var(--ink)]"
                      />
                      {officialRate && !profitExchangeRate && <span className="mt-1 block normal-case tracking-normal text-[9px] text-[var(--ink-4)]">BCB · {officialRate.effectiveDate}</span>}
                    </label>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium sm:px-4">Propiedad</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Alquiler</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Servicios aprox.</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Mantenimiento</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Administración</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Ingreso bruto</th>
                        <th className="px-3 py-2 text-right font-medium sm:px-4">Utilidad bruta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentMonthFinancialLoading && !currentMonthFinancial ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--ink-4)]">
                            Calculando los ingresos y la utilidad del mes…
                          </td>
                        </tr>
                      ) : (
                        <>
                          {propertyProfitability.map((row, index) => (
                          <tr key={row.property.id} className={`border-b border-[var(--line)]/50 last:border-0 hover:bg-[var(--bg-3)] ${index % 2 === 1 ? "bg-[var(--bg-3)]/35" : ""}`}>
                            <td className="px-3 py-2.5 text-[var(--ink)] font-medium sm:px-4">
                              <Link href={`/dashboard?property=${row.property.id}&view=reports`} className="hover:underline">
                                {row.property.name}
                              </Link>
                            </td>
                            <td className="px-3 py-2.5 text-right text-[var(--ink-2)] tabular-nums sm:px-4">Bs {row.rent.toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right text-[var(--ink-2)] tabular-nums sm:px-4">Bs {row.services.toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right text-[var(--ink-2)] tabular-nums sm:px-4">Bs {row.maintenance.toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right text-[var(--ink-2)] tabular-nums sm:px-4">{row.administrationBps ? `${row.administrationBps / 100}%` : "—"}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums sm:px-4"><span className="font-semibold text-[var(--ink)]">Bs {row.grossBOB.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>{row.income.USD > 0 && <span className="block text-[10px] text-[var(--ink-4)]">incluye USD {row.income.USD.toLocaleString("es-BO", { maximumFractionDigits: 2 })}</span>}</td>
                            <td className={`px-3 py-2.5 text-right font-bold tabular-nums sm:px-4 ${row.grossProfitBOB >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>Bs {row.grossProfitBOB.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                          ))}
                          <tr className="border-t-2 border-[var(--line-2)] bg-[var(--bg-3)] font-bold text-[var(--ink)]">
                            <td className="px-3 py-3 sm:px-4">Total</td>
                            <td className="px-3 py-3 text-right tabular-nums sm:px-4">Bs {propertyProfitability.reduce((sum, row) => sum + row.rent, 0).toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right tabular-nums sm:px-4">Bs {propertyProfitability.reduce((sum, row) => sum + row.services, 0).toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right tabular-nums sm:px-4">Bs {propertyProfitability.reduce((sum, row) => sum + row.maintenance, 0).toLocaleString("es-BO", { maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right sm:px-4">—</td>
                            <td className="px-3 py-3 text-right tabular-nums sm:px-4">Bs {propertyProfitability.reduce((sum, row) => sum + row.grossBOB, 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 sm:px-4">Bs {propertyProfitability.reduce((sum, row) => sum + row.grossProfitBOB, 0).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  </div>
                  {currentMonthFinancialLoading && <div className="border-t border-[var(--line)] px-4 py-2 text-xs text-[var(--ink-4)]">Actualizando ingresos del mes…</div>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar — same shape as the calendar / cleaning sidebars.
            Borderless rounded panel with a soft shadow; lg:top-3 for
            breathing room from the global header. */}
        <aside className="w-full lg:w-[360px] lg:shrink-0 lg:sticky lg:top-3 lg:self-start lg:max-h-[calc(100vh-84px)] rounded-2xl bg-[var(--bg)] shadow-[0_1px_3px_-1px_rgba(0,0,0,0.04),0_4px_16px_-8px_rgba(0,0,0,0.06)] [overflow:clip]">
          <div className="border-b border-[var(--line)] px-5 py-4 space-y-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-[var(--ink-4)]">
                {c.reports}
              </div>
              <div className="mt-0.5 text-base font-semibold text-[var(--ink)] truncate">
                {property ? property.name : c.allPropertiesLabel(properties.length)}
              </div>
            </div>
            <PropertySwitcher
              properties={properties}
              selectedPropertyId={property?.id ?? null}
              view="reports"
              showAllOption
              label={null}
            />
          </div>

          {/* Period selector — controls the past-window of the chart
              and every KPI that depends on it. Default 6 months back +
              6 forward (the original window). "All" stretches back to
              the earliest stay in the DB so historical-only data
              becomes visible — needed because past stays in iCal feeds
              age out, and once they do, the only way to see them is to
              widen the past window of our own DB snapshot. */}
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)] mb-2">
              {c.period}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {([3, 6, 12, 24, "all"] as PeriodChoice[]).map((p) => {
                const active = periodMonths === p;
                const label = p === "all" ? c.allPeriod : c.monthsLabel(p);
                return (
                  <button
                    key={String(p)}
                    type="button"
                    onClick={() => setPeriodMonths(p)}
                    className={`h-8 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? "bg-[var(--m-accent)] text-white"
                        : "bg-[var(--bg-2)] text-[var(--ink-2)] hover:bg-[var(--bg-3)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--ink-4)] leading-relaxed">
              {c.periodHelp}
            </p>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
              {c.exportTitle}
            </div>
            <p className="text-[11px] text-[var(--ink-3)] leading-relaxed">
              {property ? c.exportingProperty(property.name) : c.exportingAll(properties.length)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                  {c.fromLabel}
                </label>
                <input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="h-8 rounded-md border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">
                  {c.toLabel}
                </label>
                <input
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="h-8 rounded-md border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                />
              </div>
            </div>
            <button
              onClick={downloadCsv}
              disabled={targetProperties.length === 0}
              className="h-9 w-full rounded-md bg-[var(--m-accent)] px-3 text-sm font-medium text-white hover:bg-[var(--m-accent-2)] disabled:opacity-40 transition-colors"
            >
              {c.downloadCsv}
            </button>
            <p className="text-[11px] text-[var(--ink-4)] leading-relaxed">
              {c.exportHelp}
            </p>
          </div>

          {/* Notes about data sources — surfaces the reality that iCal
              feeds prune past stays, so historical numbers improve over
              time as the DB accumulates its own snapshot. */}
          <div className="border-t border-[var(--line)] px-5 py-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
              {c.dataSources}
            </div>
            <p className="text-[11px] text-[var(--ink-3)] leading-relaxed">
              {c.dataSourcesHelp}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
