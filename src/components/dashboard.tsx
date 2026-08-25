"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { DateSlider } from "@/components/date-slider";
import { CleaningSchedule, type CleanerAssignmentInfo } from "@/components/cleaning-schedule";
import { DashboardOnboarding } from "@/components/dashboard-onboarding";
import { MasterCalendar, type MasterCalendarStay } from "@/components/master-calendar";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";
import type { Property, Reservation, CalendarLink, DateOverride } from "@/lib/types";
import { isAvailabilityBlockEvent } from "@/lib/calendar-event-kind";

interface CopyShape {
  dateLocale: string;
  reservationsCount: (count: number) => string;
  reservationsAcross: (resCount: number, propCount: number) => string;
  needsAttention: string;
  doubleBooking: string;
  moreCount: (n: number) => string;
  cleanerConflict: string;
  moreCountSuffix: (n: number) => string;
  openCleaning: string;
  noCalendars: string;
  connectCalendars: string;
  reservationLabel: string;
  availableLabel: string;
  nextLabel: string;
  noUpcoming: string;
  bookingsCountShort: string;
  minNightsLabel: (n: number) => string;
  syncShort: string;
  searchPlaceholder: string;
  foundLabel: string;
  currentlyStaying: string;
  daysShort: string;
  guestShort: string;
  untilNightsLeft: (date: string, nights: number) => string;
  inDays: (date: string, days: number) => string;
}

const COPY: Record<Locale, CopyShape> = {
  en: {
    dateLocale: "en-GB",
    reservationsCount: (count) => `${count} ${count === 1 ? "reservation" : "reservations"}`,
    reservationsAcross: (resCount, propCount) =>
      `${resCount} reservations across ${propCount} ${propCount === 1 ? "property" : "properties"}`,
    needsAttention: "Needs attention",
    doubleBooking: "Double booking:",
    moreCount: (n) => `+ ${n} more`,
    cleanerConflict: "Cleaner conflict:",
    moreCountSuffix: (n) => ` + ${n} more`,
    openCleaning: "Open cleaning →",
    noCalendars: "No calendars connected:",
    connectCalendars: "Connect calendars",
    reservationLabel: "Reservation",
    availableLabel: "Available",
    nextLabel: "Next:",
    noUpcoming: "No upcoming bookings",
    bookingsCountShort: "bookings",
    minNightsLabel: (n) => `min ${n}n`,
    syncShort: "Sync",
    searchPlaceholder: "Search by guest name...",
    foundLabel: "found",
    currentlyStaying: "Currently staying",
    daysShort: "d",
    guestShort: "g",
    untilNightsLeft: (date, nights) =>
      `until ${date} · ${nights} ${nights === 1 ? "night" : "nights"} left`,
    inDays: (date, days) => `${date} (in ${days}d)`,
  },
  ru: {
    dateLocale: "ru-RU",
    reservationsCount: (count) =>
      `${count} ${count === 1 ? "бронирование" : count < 5 ? "бронирования" : "бронирований"}`,
    reservationsAcross: (resCount, propCount) =>
      `${resCount} бронирований в ${propCount} ${propCount === 1 ? "объекте" : "объектах"}`,
    needsAttention: "Требует внимания",
    doubleBooking: "Двойное бронирование:",
    moreCount: (n) => `+ ещё ${n}`,
    cleanerConflict: "Конфликт уборщиков:",
    moreCountSuffix: (n) => ` + ещё ${n}`,
    openCleaning: "Открыть уборки →",
    noCalendars: "Календари не подключены:",
    connectCalendars: "Подключить",
    reservationLabel: "Бронь",
    availableLabel: "Свободно",
    nextLabel: "Далее:",
    noUpcoming: "Нет предстоящих броней",
    bookingsCountShort: "бронир.",
    minNightsLabel: (n) => `мин. ${n}н.`,
    syncShort: "Синхр.",
    searchPlaceholder: "Поиск по имени гостя...",
    foundLabel: "найдено",
    currentlyStaying: "Сейчас в гостях",
    daysShort: "д",
    guestShort: "г",
    untilNightsLeft: (date, nights) =>
      `до ${date} · ${nights} ${nights === 1 ? "ночь" : nights < 5 ? "ночи" : "ноч."}`,
    inDays: (date, days) => `${date} (через ${days} д.)`,
  },
  de: {
    dateLocale: "de-DE",
    reservationsCount: (count) => `${count} ${count === 1 ? "Buchung" : "Buchungen"}`,
    reservationsAcross: (resCount, propCount) =>
      `${resCount} Buchungen in ${propCount} ${propCount === 1 ? "Unterkunft" : "Unterkünften"}`,
    needsAttention: "Erfordert Aufmerksamkeit",
    doubleBooking: "Doppelbuchung:",
    moreCount: (n) => `+ ${n} weitere`,
    cleanerConflict: "Reinigungskonflikt:",
    moreCountSuffix: (n) => ` + ${n} weitere`,
    openCleaning: "Reinigung öffnen →",
    noCalendars: "Keine Kalender verbunden:",
    connectCalendars: "Kalender verbinden",
    reservationLabel: "Buchung",
    availableLabel: "Frei",
    nextLabel: "Nächste:",
    noUpcoming: "Keine bevorstehenden Buchungen",
    bookingsCountShort: "Buchungen",
    minNightsLabel: (n) => `min. ${n} N.`,
    syncShort: "Sync",
    searchPlaceholder: "Nach Gastnamen suchen...",
    foundLabel: "gefunden",
    currentlyStaying: "Aktuell im Haus",
    daysShort: "T",
    guestShort: "G",
    untilNightsLeft: (date, nights) =>
      `bis ${date} · noch ${nights} ${nights === 1 ? "Nacht" : "Nächte"}`,
    inDays: (date, days) => `${date} (in ${days} T.)`,
  },
  fr: {
    dateLocale: "fr-FR",
    reservationsCount: (count) => `${count} ${count === 1 ? "réservation" : "réservations"}`,
    reservationsAcross: (resCount, propCount) =>
      `${resCount} réservations sur ${propCount} ${propCount === 1 ? "logement" : "logements"}`,
    needsAttention: "À traiter",
    doubleBooking: "Double réservation :",
    moreCount: (n) => `+ ${n} autres`,
    cleanerConflict: "Conflit d’agent de ménage :",
    moreCountSuffix: (n) => ` + ${n} autres`,
    openCleaning: "Ouvrir le ménage →",
    noCalendars: "Aucun calendrier connecté :",
    connectCalendars: "Connecter des calendriers",
    reservationLabel: "Réservation",
    availableLabel: "Disponible",
    nextLabel: "Suivante :",
    noUpcoming: "Aucune réservation à venir",
    bookingsCountShort: "rés.",
    minNightsLabel: (n) => `min ${n} n`,
    syncShort: "Sync",
    searchPlaceholder: "Rechercher par nom de voyageur…",
    foundLabel: "trouvés",
    currentlyStaying: "Sur place",
    daysShort: "j",
    guestShort: "v",
    untilNightsLeft: (date, nights) =>
      `jusqu’au ${date} · ${nights} ${nights === 1 ? "nuit" : "nuits"} restantes`,
    inDays: (date, days) => `${date} (dans ${days} j)`,
  },
  es: {
    dateLocale: "es-ES",
    reservationsCount: (count) => `${count} ${count === 1 ? "reserva" : "reservas"}`,
    reservationsAcross: (resCount, propCount) =>
      `${resCount} reservas en ${propCount} ${propCount === 1 ? "alojamiento" : "alojamientos"}`,
    needsAttention: "Requiere atención",
    doubleBooking: "Doble reserva:",
    moreCount: (n) => `+ ${n} más`,
    cleanerConflict: "Conflicto de limpieza:",
    moreCountSuffix: (n) => ` + ${n} más`,
    openCleaning: "Abrir limpieza →",
    noCalendars: "Sin calendarios conectados:",
    connectCalendars: "Conectar calendarios",
    reservationLabel: "Reserva",
    availableLabel: "Disponible",
    nextLabel: "Siguiente:",
    noUpcoming: "No hay reservas próximas",
    bookingsCountShort: "reservas",
    minNightsLabel: (n) => `mín. ${n}n`,
    syncShort: "Sync",
    searchPlaceholder: "Buscar por nombre del huésped…",
    foundLabel: "encontradas",
    currentlyStaying: "Alojados ahora",
    daysShort: "d",
    guestShort: "h",
    untilNightsLeft: (date, nights) =>
      `hasta ${date} · ${nights} ${nights === 1 ? "noche" : "noches"} restantes`,
    inDays: (date, days) => `${date} (en ${days} d)`,
  },
};

// RT-25.6 tick 2 — bundled platform presets, kept inline rather than
// imported from @/lib/platforms because that module's lazy
// `import("@/lib/prisma")` gets traced into the client bundle by
// Turbopack and breaks the build (matches the reports-panel.tsx
// approach landed in RT-25.5 / commit bd37271). Slugs and colors mirror
// the seed in prisma/push-schema.ts so the form pills match the
// calendar bars exactly.
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

const PRESET_BY_SLUG = new Map(PLATFORM_PRESETS.map((p) => [p.slug, p]));

function platformDisplayName(slug: string): string {
  return PRESET_BY_SLUG.get(slug)?.displayName ?? slug;
}

function platformColor(slug: string): string {
  return PRESET_BY_SLUG.get(slug)?.color ?? FALLBACK_PLATFORM_COLOR;
}

export interface CalendarEvent {
  id: number;
  propertyId?: number;
  platform: string;
  uid?: string;
  summary: string;
  startDate: string;
  endDate: string;
}

export interface UnifiedStay {
  start: Date;
  end: Date;
  name: string;
  platform: string;
  reservationId?: number;
  totalPrice?: number | null;
  extensionOfId?: number | null;
  currency?: "BOB" | "USD";
  hasOutstandingBalance?: boolean;
  uid?: string;
}

type LinkedEventRole = "claim" | "extension";

function normalizedPlatform(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** Calendar-event UIDs are unique only inside one platform feed. */
function linkedSourceKey(platform: string, uid: string): string {
  return `${normalizedPlatform(platform)}\u0000${uid.trim()}`;
}

/** Local-date YYYY-MM-DD formatter. Crucial: do NOT use
 *  d.toISOString().substring(0, 10) here — that converts to UTC and
 *  shifts the date by ±1 day in non-UTC timezones, which broke both
 *  the dashboard's "until DATE" text and the dedup heuristic that
 *  compares iCal date strings against Reservation date keys. */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  lodging: "Hospedaje", parking: "Parqueo", guarantee: "Garantía",
  additional: "Ingreso adicional", adjustment: "Ajuste", refund: "Reembolso",
};

function segmentFinancials(reservation: Reservation) {
  const expected = { BOB: 0, USD: 0 };
  const paid = { BOB: 0, USD: 0 };
  if (reservation.totalPrice != null) expected[reservation.priceCurrency || "BOB"] += reservation.totalPrice;
  if (reservation.parkingTotalPrice != null) expected[reservation.parkingCurrency || "BOB"] += reservation.parkingTotalPrice;
  if (reservation.guaranteeAmount != null) expected[reservation.guaranteeCurrency || "BOB"] += reservation.guaranteeAmount;
  for (const movement of reservation.moneyMovements || []) {
    if (["lodging", "parking", "guarantee", "refund"].includes(movement.type)) {
      paid[movement.currency] += movement.amountMinor / 100;
    }
  }
  const balance = { BOB: paid.BOB - expected.BOB, USD: paid.USD - expected.USD };
  const manuallySettled = Boolean(reservation.settledManuallyAt);
  if (manuallySettled) {
    if (balance.BOB < 0) balance.BOB = 0;
    if (balance.USD < 0) balance.USD = 0;
  }
  const hasKnownCharge = reservation.totalPrice != null || reservation.parkingTotalPrice != null || reservation.guaranteeAmount != null;
  return { expected, paid, balance, manuallySettled, hasOutstandingBalance: hasKnownCharge && (balance.BOB < -0.005 || balance.USD < -0.005) };
}

/** Reservation dates are calendar dates, not instants. Prisma/API values may
 * arrive as ISO timestamps at UTC midnight; constructing a Date from those in
 * Bolivia shifts them to the previous day. Preserve the ISO date component. */
function reservationDateKey(value: string | Date): string {
  const raw = value instanceof Date ? value.toISOString() : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return toLocalDateStr(new Date(value));
}

function reservationLocalDate(value: string | Date): Date {
  const [year, month, day] = reservationDateKey(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return toLocalDateStr(new Date(year, month - 1, day + days));
}

/** True for iCal summaries that almost always indicate "this is a
 *  generic blocked booking, not a guest name" — Airbnb's "Reserved",
 *  Booking.com's "CLOSED - Not available", host-blocks, etc. Used to
 *  distinguish iCal twins of manually-entered Reservations (which the
 *  host hasn't claimed via the bar-claim popover) from a real second
 *  booking that just happens to overlap on the same dates. */
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

/** Display-safe name for an iCal-imported event. Falls back to the
 *  platform brand name ("Booking.com" / "Airbnb" / …) when the raw
 *  summary is generic-marker text — surfacing "CLOSED - Not available"
 *  as the upcoming-guest label on the dashboard is confusing for the
 *  host. They know it's a fetched stay; the platform name is the
 *  truthful answer until the host claims the bar and gives it a real
 *  guest name. Matches what the calendar grid already does for bar
 *  labels (use-calendar-data.ts swaps generic labels for "Airbnb"
 *  / "Booking" before rendering). */
function friendlyIcalName(summary: string | null | undefined, platform: string): string {
  if (!summary || isGenericIcalName(summary)) return platformDisplayName(platform);
  return summary;
}

/** Imported availability blocks belong in the operational calendar, but
 * they are not guest reservations and must not affect reservation stats. */
function isAvailabilityBlock(event: CalendarEvent): boolean {
  return isAvailabilityBlockEvent(event);
}

/** Build a deduped list of stays for one property from Reservation rows
 *  + iCal-synced events. Three layers of dedup so the dashboard never
 *  double-counts the SAME booking represented in two places:
 *    1. An explicit linked `claim` replaces only its exact
 *       platform+UID iCal source. A linked `extension` is a separate
 *       Direct segment, so both it and the original source remain.
 *       Legacy rows without a role are inferred from overlap (claim)
 *       versus adjacency (extension).
 *    2. iCal events with generic summaries (Reserved / Blocked / etc)
 *       whose start+end exactly match a Reservation's dates → drop
 *       the iCal side. This catches the very common case of a host
 *       creating a Reservation manually without going through the
 *       bar-claim popover, leaving the iCal twin orphaned.
 *    3. Airbnb host-blocks ("Not available" / "Blocked") are filtered
 *       out — they're not real guests.
 *  Sorted by start asc. */
export function buildUnifiedStays(p: Property, events: CalendarEvent[]): UnifiedStay[] {
  const eventBySource = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (event.uid) {
      eventBySource.set(linkedSourceKey(event.platform, event.uid), event);
    }
  }

  const linkedRoleByReservation = new Map<number, LinkedEventRole | null>();
  const claimedSources = new Set<string>();
  for (const reservation of p.reservations) {
    const explicitRole = reservation.linkedEventRole;
    const uid = reservation.linkedEventUid?.trim();
    const sourcePlatform = normalizedPlatform(
      reservation.linkedEventPlatform || reservation.platform,
    );

    let role: LinkedEventRole | null = explicitRole || null;
    const sourceKey = uid && sourcePlatform
      ? linkedSourceKey(sourcePlatform, uid)
      : null;

    // Backward compatibility for rows created before linkedEventRole:
    // the old schema stored the source platform in Reservation.platform.
    // Infer only against that exact platform+UID event so a reused UID in
    // another feed cannot hide an unrelated booking.
    if (!role && sourceKey) {
      const source = eventBySource.get(sourceKey);
      if (source) {
        const reservationStart = reservationDateKey(reservation.checkIn);
        const reservationEnd = reservationDateKey(reservation.checkOut);
        const overlapsSource =
          reservationStart < source.endDate && reservationEnd > source.startDate;
        const abutsSource =
          reservationEnd === source.startDate || reservationStart === source.endDate;
        if (overlapsSource) role = "claim";
        else if (abutsSource) role = "extension";
      }
    }

    linkedRoleByReservation.set(reservation.id, role);
    if (role === "claim" && sourceKey) claimedSources.add(sourceKey);
  }

  // Reservation date-range keys — used to silently merge generic-named
  // iCal events with the host's manual entry on identical dates. Include
  // platform in the key: identical dates on two platforms are not proof
  // that both events belong to the same local row.
  const reservationDateKeys = new Set<string>();
  for (const r of p.reservations) {
    // An explicit/inferred extension must never suppress an iCal row,
    // even if malformed legacy data happens to give both ranges the
    // same dates. Its role is authoritative: source + Direct both stay.
    if (linkedRoleByReservation.get(r.id) === "extension") continue;
    const start = reservationDateKey(r.checkIn);
    const end = reservationDateKey(r.checkOut);
    reservationDateKeys.add(`${normalizedPlatform(r.platform)}\u0000${start}|${end}`);
  }
  const stays: UnifiedStay[] = [];
  for (const r of p.reservations) {
    const start = reservationLocalDate(r.checkIn);
    const end = reservationLocalDate(r.checkOut);
    stays.push({
      start,
      end,
      name: r.name,
      // A direct-pay extension is deliberately its own source segment,
      // even for legacy rows whose platform column still names Airbnb /
      // Booking because it doubled as linked-source identity.
      platform:
        linkedRoleByReservation.get(r.id) === "extension"
          ? "direct"
          : r.platform || "direct",
      reservationId: r.id,
      totalPrice: r.totalPrice,
      extensionOfId: r.extensionOfId,
      currency: r.priceCurrency || "BOB",
      hasOutstandingBalance: segmentFinancials(r).hasOutstandingBalance,
    });
  }
  for (const ev of events) {
    if (ev.uid && claimedSources.has(linkedSourceKey(ev.platform, ev.uid))) continue;
    // Host-blocks are NEVER real guest reservations — they're dates
    // the host blocked manually in the platform's own calendar. Each
    // platform marks them differently: Airbnb uses "Not available" /
    // "Blocked"; Booking.com / Vrbo / Trip.com use "CLOSED" or
    // "CLOSED - Not available". Without this filter, overlapping
    // host-blocks from the SAME platform (e.g. Booking fragmenting one
    // blocked range into two overlapping events with different UIDs)
    // surface as a phantom "Booking.com & Booking.com" double-booking
    // on the dashboard.
    if (isAvailabilityBlock(ev)) continue;
    // Same-dates + generic-summary heuristic: drop the iCal twin.
    const dateKey = `${normalizedPlatform(ev.platform)}\u0000${ev.startDate}|${ev.endDate}`;
    if (reservationDateKeys.has(dateKey) && isGenericIcalName(ev.summary || "")) continue;
    const start = reservationLocalDate(ev.startDate);
    const end = reservationLocalDate(ev.endDate);
    stays.push({ start, end, name: friendlyIcalName(ev.summary, ev.platform), platform: ev.platform, uid: ev.uid });
  }

  // Cross-platform echo collapse. A host who runs the normal multi-
  // platform setup syncs their master calendar (usually Airbnb) INTO
  // Booking / Trip.com / Agoda, so every confirmed booking is
  // reflected back out in EVERY platform's exported iCal. DeptosBO
  // imports all those feeds and ends up with N copies of the same
  // booking — and detectDoubleBookings() then flags (N-1) false
  // "double booking" conflicts for every single reservation.
  //
  // Two stays with the EXACT same (start, end) date range are
  // collapsed to one. Exact-match is the safe signature: a genuine
  // independent double-booking with byte-identical check-in AND
  // check-out dates is rare, and even when it happens the calendar
  // grid still renders both bars (separate code path) so the host
  // isn't blind to it. A partial overlap (Booking 1-10 + Trip 5-7)
  // is NOT collapsed — that can't be a clean echo and still warrants
  // a conflict warning.
  //
  // When collapsing, keep the entry with the most informative name:
  // a real guest name beats a generic platform block string
  // ("RoomStatus Fully booked", "CLOSED - Not available", "Reserved").
  const collapsed: UnifiedStay[] = [];
  const byRange = new Map<string, UnifiedStay>();
  for (const s of stays) {
    const key = `${toLocalDateStr(s.start)}|${toLocalDateStr(s.end)}`;
    const existing = byRange.get(key);
    if (!existing) {
      byRange.set(key, s);
      collapsed.push(s);
      continue;
    }
    // Same date range already seen — this is an echo. Upgrade the
    // kept copy's name/platform if the echo carries a real guest
    // name and the kept copy only had a generic block string.
    if (isGenericIcalName(existing.name) && !isGenericIcalName(s.name)) {
      existing.name = s.name;
      existing.platform = s.platform;
      if (s.reservationId) existing.reservationId = s.reservationId;
    }
  }

  collapsed.sort((a, b) => a.start.getTime() - b.start.getTime());
  return collapsed;
}

/** Confirmed stays plus imported periods in which the physical apartment is
 * unavailable. Blocks intentionally have no reservation id. */
export function buildMasterCalendarStays(
  property: Property,
  events: CalendarEvent[],
): UnifiedStay[] {
  const stays = buildUnifiedStays(property, events);
  for (const event of events.filter(isAvailabilityBlock)) {
    stays.push({
      start: reservationLocalDate(event.startDate),
      end: reservationLocalDate(event.endDate),
      name: "No disponible",
      platform: `${event.platform}-block`,
    });
  }
  return stays.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Per-property double-booking detection. Returns the list of overlapping
 *  pairs whose overlap range still touches today-or-future, so a stale
 *  past conflict doesn't show as an active alert on the dashboard. */
function detectDoubleBookings(stays: UnifiedStay[], today: Date): Array<{
  aName: string;
  bName: string;
  overlapStart: Date;
  overlapEnd: Date;
}> {
  const out: Array<{ aName: string; bName: string; overlapStart: Date; overlapEnd: Date }> = [];
  for (let i = 0; i < stays.length; i++) {
    for (let j = i + 1; j < stays.length; j++) {
      const a = stays[i];
      const b = stays[j];
      // Strict overlap: a.start < b.end AND b.start < a.end. Touching
      // dates (a.end === b.start) are NOT a conflict — that's a normal
      // turnover (one guest checks out, next checks in same day).
      if (a.start < b.end && b.start < a.end) {
        const overlapStart = a.start > b.start ? a.start : b.start;
        const overlapEnd = a.end < b.end ? a.end : b.end;
        if (overlapEnd > today) {
          out.push({ aName: a.name, bName: b.name, overlapStart, overlapEnd });
        }
      }
    }
  }
  return out;
}

interface DashboardProps {
  properties: Property[];
  /**
   * True while the parent is fetching the properties list. Used to
   * suppress the zero-property onboarding wizard during the loading
   * window — without it, a returning user (who DOES have properties)
   * sees an empty list for ~100–500ms after page mount and gets the
   * "Name your first property" wizard, which creates a duplicate
   * property if they start typing before the fetch resolves.
   */
  loadingProperties?: boolean;
  selectedProperty: Property | null;
  onSelectProperty: (id: number) => void;
  onSelectReservation: (id: number) => void;
  onAddReservation: (data: {
    name: string;
    checkIn: string;
    checkOut: string;
    platform: string;
    propertyId: number;
    nightlyPrice?: number | null;
    totalPrice?: number | null;
    priceCurrency?: "BOB" | "USD";
    guaranteeAmount?: number | null;
    guaranteeCurrency?: "BOB" | "USD";
    hasParking?: boolean;
    parkingNightlyPrice?: number | null;
    parkingTotalPrice?: number | null;
    parkingCurrency?: "BOB" | "USD";
    linkedEventUid?: string;
    linkedEventPlatform?: string;
    linkedEventRole?: "claim" | "extension";
    extensionOfId?: number | null;
    note?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateReservation?: (id: number, data: {
    name?: string; checkIn?: string; checkOut?: string; platform?: string;
    nightlyPrice?: number | null; totalPrice?: number | null;
    priceCurrency?: "BOB" | "USD";
    guaranteeAmount?: number | null; hasParking?: boolean;
    guaranteeCurrency?: "BOB" | "USD";
    parkingNightlyPrice?: number | null; parkingTotalPrice?: number | null;
    parkingCurrency?: "BOB" | "USD";
    note?: string | null;
    settledManually?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onCancelReservation?: (id: number, reason?: string, refunds?: Array<{ amount: number; currency: "BOB" | "USD"; paymentMethod: string; paidBy: "deysi" | "milton" }>) => Promise<{ ok: boolean; error?: string }>;
  onAddProperty?: (name: string) => Promise<void> | void;
  /** Rename a property in place. Lets the host rename from the
   *  dashboard header without opening Sync settings. Optional so
   *  callers that never show a selected property can skip it. */
  onUpdateProperty?: (id: number, data: { name?: string }) => Promise<void> | void;
  /** Re-fetch properties on the parent. The new in-dashboard
   *  onboarding wizard calls /api/properties and /api/calendar/links
   *  directly, so the parent has no idea anything changed until this
   *  fires. Optional so existing callers don't need to pass it. */
  onRefresh?: () => Promise<void> | void;
}

export function Dashboard({
  properties,
  loadingProperties = false,
  selectedProperty,
  onSelectProperty,
  onSelectReservation,
  onAddReservation,
  onUpdateReservation,
  onCancelReservation,
  onAddProperty,
  onUpdateProperty,
  onRefresh,
}: DashboardProps) {
  const { t, locale } = useI18n();
  const c = COPY[locale];
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPropertyId, setFormPropertyId] = useState<number | "">(
    selectedProperty?.id || (properties.length > 0 ? properties[0].id : "")
  );
  const [formPlatform, setFormPlatform] = useState("direct");
  const [formCheckIn, setFormCheckIn] = useState("");
  const [formCheckOut, setFormCheckOut] = useState("");
  const [formNightlyPrice, setFormNightlyPrice] = useState("");
  const [formTotalPrice, setFormTotalPrice] = useState("");
  const [formPriceCurrency, setFormPriceCurrency] = useState<"BOB" | "USD">("BOB");
  const [formGuarantee, setFormGuarantee] = useState("");
  const [formGuaranteeCurrency, setFormGuaranteeCurrency] = useState<"BOB" | "USD">("BOB");
  const [formHasParking, setFormHasParking] = useState(false);
  const [formParkingNightlyPrice, setFormParkingNightlyPrice] = useState("");
  const [formParkingTotalPrice, setFormParkingTotalPrice] = useState("");
  const [formParkingCurrency, setFormParkingCurrency] = useState<"BOB" | "USD">("BOB");
  const [formNote, setFormNote] = useState("");
  const [savingReservation, setSavingReservation] = useState(false);
  const [reservationSaveError, setReservationSaveError] = useState("");
  const [inspectedReservationId, setInspectedReservationId] = useState<number | null>(null);
  const [inspectedImportedStay, setInspectedImportedStay] = useState<{ propertyId: number; stay: MasterCalendarStay } | null>(null);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementType, setMovementType] = useState<"lodging" | "parking" | "guarantee" | "additional">("lodging");
  const [movementMethod, setMovementMethod] = useState("qr");
  const [movementCurrency, setMovementCurrency] = useState<"BOB" | "USD">("BOB");
  const [movementReceiver, setMovementReceiver] = useState<"deysi" | "milton">("deysi");
  const [movementNote, setMovementNote] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [deletingMovementId, setDeletingMovementId] = useState<number | null>(null);
  const [movementError, setMovementError] = useState("");
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [airbnbGuestName, setAirbnbGuestName] = useState("");
  const [airbnbAmount, setAirbnbAmount] = useState("");
  const [savingAirbnbDetails, setSavingAirbnbDetails] = useState(false);
  const [formExtensionOfId, setFormExtensionOfId] = useState<number | null>(null);
  const [formEditingId, setFormEditingId] = useState<number | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellingReservation, setCancellingReservation] = useState(false);
  const [cancellationError, setCancellationError] = useState("");
  const [refundBob, setRefundBob] = useState("");
  const [refundUsd, setRefundUsd] = useState("");
  const [refundBobMethod, setRefundBobMethod] = useState("qr");
  const [refundUsdMethod, setRefundUsdMethod] = useState("cash");
  const [refundPaidBy, setRefundPaidBy] = useState<"deysi" | "milton">("deysi");
  const [priceSource, setPriceSource] = useState<"nightly" | "total">("nightly");
  const [parkingPriceSource, setParkingPriceSource] = useState<"nightly" | "total">("nightly");
  const [allSyncedEvents, setAllSyncedEvents] = useState<Record<number, CalendarEvent[]>>({});
  const [allLinks, setAllLinks] = useState<Record<number, CalendarLink[]>>({});
  const [allOverrides, setAllOverrides] = useState<Record<number, DateOverride[]>>({});
  const [loadingCalendarData, setLoadingCalendarData] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Inline property rename from the dashboard header (pencil next to
  // the title). Mirrors the rename in Sync settings — same PATCH.
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  // Inline rename on a property card in the portfolio (all-properties)
  // view — editingCardId holds the card currently being renamed.
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardNameDraft, setCardNameDraft] = useState("");
  const [savingCardId, setSavingCardId] = useState<number | null>(null);
  // RT-25.6 tick 2 — distinct platform slugs across the user's CalendarLinks.
  // Populated regardless of selectedProperty so the form pills always reflect
  // the user's real platform set (Airbnb + Booking + any custom platforms).
  const [linkedPlatformSlugs, setLinkedPlatformSlugs] = useState<string[]>([]);
  // RT-25.10 tick 3 — per-property cleaner-assignment data, threaded
  // into <CleaningSchedule> for cleaner-conflict detection. Populated
  // from /api/cleaners?withAssignments=1 in dashboard mode only.
  const [cleanerAssignments, setCleanerAssignments] = useState<Record<number, CleanerAssignmentInfo[]>>({});
  const [assignmentsFetched, setAssignmentsFetched] = useState(false);
  const [cleanerConflictDates, setCleanerConflictDates] = useState<string[]>([]);

  // Fetch all calendar data in three account-scoped requests. The previous
  // per-property fan-out made 69 simultaneous requests for DeptosBO's 23
  // units (and twice that under React Strict Mode), which could exhaust the
  // development server and leave the master calendar partially populated.
  const fetchAllCalendarData = useCallback(async () => {
    if (selectedProperty || properties.length === 0) return;
    try {
      const [syncRes, linksRes, overridesRes] = await Promise.all([
        fetch("/api/calendar/sync?limit=200"),
        fetch("/api/calendar/links"),
        fetch("/api/date-overrides"),
      ]);
      if (!syncRes.ok || !linksRes.ok || !overridesRes.ok) {
        throw new Error("Unable to load master calendar data");
      }
      const syncData = await syncRes.json();
      const linksData: CalendarLink[] = await linksRes.json();
      const overridesData: DateOverride[] = await overridesRes.json();
      const evMap: Record<number, CalendarEvent[]> = {};
      const lnMap: Record<number, CalendarLink[]> = {};
      const ovMap: Record<number, DateOverride[]> = {};
      for (const property of properties) {
        evMap[property.id] = [];
        lnMap[property.id] = [];
        ovMap[property.id] = [];
      }
      for (const event of (syncData.events || []) as CalendarEvent[]) {
        if (event.propertyId != null) (evMap[event.propertyId] ||= []).push(event);
      }
      for (const link of linksData) (lnMap[link.propertyId] ||= []).push(link);
      for (const override of overridesData) (ovMap[override.propertyId] ||= []).push(override);
      setAllSyncedEvents(evMap);
      setAllLinks(lnMap);
      setAllOverrides(ovMap);
    } catch (error) {
      console.error("Master calendar load failed", error);
    } finally {
      setLoadingCalendarData(false);
    }
  }, [properties, selectedProperty]);

  useEffect(() => {
    fetchAllCalendarData();
  }, [fetchAllCalendarData]);

  // RT-25.6 tick 2 — fetch the user's full link inventory once on mount
  // (single call, no per-property fan-out) so the platform pills are
  // accurate even in per-property mode where fetchAllCalendarData
  // early-exits.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calendar/links`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CalendarLink[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const slugs = Array.from(new Set(rows.map((r) => r.platform).filter(Boolean)));
        setLinkedPlatformSlugs(slugs);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // RT-25.10 tick 3 — fetch the host's cleaner pool with assignments so
  // CleaningSchedule can detect cleaner conflicts across properties.
  // Only meaningful in dashboard mode (multi-property); per-property
  // mode has its own fetch in PropertyCleaningView. Skip until at least
  // one property exists.
  useEffect(() => {
    if (selectedProperty || properties.length === 0) {
      setCleanerAssignments({});
      return;
    }
    let cancelled = false;
    fetch(`/api/cleaners?withAssignments=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: number; name: string; assignments?: Array<{ propertyId: number; priority: number }> }>) => {
        if (cancelled || !Array.isArray(rows)) return;
        const map: Record<number, CleanerAssignmentInfo[]> = {};
        for (const c of rows) {
          for (const a of c.assignments ?? []) {
            const list = map[a.propertyId] ?? (map[a.propertyId] = []);
            list.push({ identityKey: `p:${c.id}`, name: c.name, priority: a.priority });
          }
        }
        for (const list of Object.values(map)) list.sort((a, b) => a.priority - b.priority);
        setCleanerAssignments(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAssignmentsFetched(true);
      });
    return () => { cancelled = true; };
  }, [selectedProperty, properties.length]);

  // Platform pills shown in the Add-Reservation form. Order:
  //   1. Slugs the user has linked (in PLATFORM_PRESETS sort order, then alpha)
  //   2. Booking and Vrbo — always available for manually entered stays
  //   3. "direct" — always offered as the manual-add channel
  // Airbnb remains available whenever it is linked; brand-new accounts get it
  // as a sensible fallback alongside the fixed manual channels.
  const formPlatformOptions = useMemo<string[]>(() => {
    const linked = new Set(
      linkedPlatformSlugs.length > 0
        ? [...linkedPlatformSlugs, "booking", "vrbo"]
        : ["airbnb", "booking", "vrbo"],
    );
    const ordered: string[] = [];
    for (const preset of PLATFORM_PRESETS) {
      if (preset.slug === "direct") continue;
      if (linked.has(preset.slug)) ordered.push(preset.slug);
    }
    // Custom slugs that aren't in the bundled presets: tail in alpha order.
    const known = new Set(PLATFORM_PRESETS.map((p) => p.slug));
    for (const slug of [...linked].sort()) {
      if (!known.has(slug)) ordered.push(slug);
    }
    ordered.push("direct");
    return ordered;
  }, [linkedPlatformSlugs]);

  // Keep formPlatform in the available set; if it drops out (rare —
  // user removed the only link of that type), reset to the first option.
  useEffect(() => {
    if (formPlatformOptions.length === 0) return;
    if (!formPlatformOptions.includes(formPlatform)) {
      setFormPlatform(formPlatformOptions[0]);
    }
  }, [formPlatformOptions, formPlatform]);

  useEffect(() => {
    if (selectedProperty) {
      setFormPropertyId(selectedProperty.id);
    }
  }, [selectedProperty]);

  // The old WelcomeModal is replaced by DashboardOnboarding (an
  // in-place empty-state takeover). Modal state hooks intentionally
  // removed.

  // Per-property mode: keep the original "newest booking first" sort
  // (the per-property reservation list is more about audit-trail than
  // daily-ops planning). Global mode: sort upcoming-first so a returning
  // host sees what's happening today + this week at the top of the page.
  // RT-25.6 tick 3.
  const allReservations = selectedProperty
    ? selectedProperty.reservations
        .map((r) => ({ ...r, propertyName: selectedProperty.name, propertyId: selectedProperty.id }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : properties
        .flatMap((p) =>
          p.reservations.map((r) => ({
            ...r,
            propertyName: p.name,
            propertyId: p.id,
          }))
        );

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const sevenDaysOutStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // RT-25.6 tick 5 — today's check-ins / check-outs across all
  // properties. Drives the "Today" strip at the top of the global
  // dashboard so a returning host can scan today's events without
  // hunting through the upcoming-week list. Hidden when both buckets
  // are empty so the strip doesn't add noise on quiet days.
  const { todayCheckIns, todayCheckOuts } = useMemo(() => {
    if (selectedProperty) {
      return { todayCheckIns: [], todayCheckOuts: [] as typeof allReservations };
    }
    const ins: typeof allReservations = [];
    const outs: typeof allReservations = [];
    for (const r of allReservations) {
      if (r.checkIn === todayStr) ins.push(r);
      if (r.checkOut === todayStr) outs.push(r);
    }
    return { todayCheckIns: ins, todayCheckOuts: outs };
  }, [allReservations, selectedProperty, todayStr]);

  // Four buckets so the host scans the list top-down by urgency:
  //   active    — currently staying (checkIn ≤ today < checkOut)
  //   next7     — arriving within the next 7 days
  //   later     — arriving more than 7 days out
  //   past      — already checked out (collapsed, click to expand)
  const { active, next7, later, past } = useMemo(() => {
    if (selectedProperty) {
      return { active: [], next7: [], later: [], past: [] as typeof allReservations };
    }
    const activeBucket: typeof allReservations = [];
    const next7Bucket: typeof allReservations = [];
    const laterBucket: typeof allReservations = [];
    const pastBucket: typeof allReservations = [];
    for (const r of allReservations) {
      if (r.checkOut <= todayStr) {
        pastBucket.push(r);
      } else if (r.checkIn <= todayStr) {
        // checkIn already happened AND checkOut still ahead → active.
        activeBucket.push(r);
      } else if (r.checkIn < sevenDaysOutStr) {
        next7Bucket.push(r);
      } else {
        laterBucket.push(r);
      }
    }
    activeBucket.sort((a, b) => a.checkOut.localeCompare(b.checkOut)); // earliest-leave first
    next7Bucket.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    laterBucket.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    pastBucket.sort((a, b) => b.checkOut.localeCompare(a.checkOut));
    return { active: activeBucket, next7: next7Bucket, later: laterBucket, past: pastBucket };
  }, [allReservations, selectedProperty, todayStr, sevenDaysOutStr]);

  // RT-25.10 tick 3 — derive whether each visible bucket overlaps any
  // cleaner-conflict date so the badge only shows when relevant.
  const hasCleanerConflictToday = useMemo(
    () => cleanerConflictDates.includes(todayStr),
    [cleanerConflictDates, todayStr]
  );
  const hasCleanerConflictNext7 = useMemo(
    () => cleanerConflictDates.some((d) => d >= todayStr && d < sevenDaysOutStr),
    [cleanerConflictDates, todayStr, sevenDaysOutStr]
  );

  // Per-property "now / next" data drives the property cards: who is
  // currently in the property and how many nights they have left, plus
  // the next arriving guest. Computed once per render against the
  // unified stay list so reservations + iCal events stay in lockstep.
  const propertyOccupancy = useMemo(() => {
    if (selectedProperty) return new Map<number, { current: UnifiedStay | null; next: UnifiedStay | null }>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const map = new Map<number, { current: UnifiedStay | null; next: UnifiedStay | null }>();
    for (const p of properties) {
      const stays = buildUnifiedStays(p, allSyncedEvents[p.id] || []);
      const current = stays.find((s) => s.start <= today && s.end > today) ?? null;
      const next = stays.find((s) => s.start > today) ?? null;
      map.set(p.id, { current, next });
    }
    return map;
  }, [properties, allSyncedEvents, selectedProperty]);

  // Double-booking + no-cleaner alerts. Surfaced in the Alerts strip
  // above the property cards so the host sees structural problems
  // before scanning individual properties. Only computed in dashboard
  // mode (where the strip renders).
  const dashboardAlerts = useMemo(() => {
    if (selectedProperty) {
      return {
        doubleBookings: [] as Array<{ propertyName: string; aName: string; bName: string; overlapStart: Date; overlapEnd: Date }>,
        propertiesWithoutCalendar: [] as Array<{ id: number; name: string }>,
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const doubleBookings: Array<{ propertyName: string; aName: string; bName: string; overlapStart: Date; overlapEnd: Date }> = [];
    // Properties that haven't connected any iCal feed AND don't have any
    // manual reservations either — these need the host's attention because
    // the dashboard is empty for them. We flag both conditions together
    // because a property with manual reservations doesn't need a sync to
    // be useful (some hosts don't list on Airbnb / Booking at all).
    const propertiesWithoutCalendar: Array<{ id: number; name: string }> = [];
    for (const p of properties) {
      const stays = buildUnifiedStays(p, allSyncedEvents[p.id] || []);
      const overlaps = detectDoubleBookings(stays, today);
      for (const o of overlaps) {
        doubleBookings.push({ propertyName: p.name, ...o });
      }
      const links = allLinks[p.id];
      const hasLinks = Array.isArray(links) && links.length > 0;
      const hasReservations = p.reservations.length > 0;
      if (!hasLinks && !hasReservations) {
        propertiesWithoutCalendar.push({ id: p.id, name: p.name });
      }
    }
    return { doubleBookings, propertiesWithoutCalendar };
  }, [properties, allSyncedEvents, allLinks, selectedProperty]);

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // When searching, flatten all buckets and filter — sectioning only
  // makes sense for the daily-ops scan, not for "find a guest by name".
  // Per-property mode also stays flat (preserves prior behavior).
  const sortedFlat = useMemo(() => {
    if (selectedProperty) return allReservations;
    return [...next7, ...later, ...past];
  }, [selectedProperty, allReservations, next7, later, past]);

  const displayReservations = trimmedQuery
    ? sortedFlat.filter((r) => r.name.toLowerCase().includes(trimmedQuery))
    : sortedFlat;

  const [showPast, setShowPast] = useState(false);
  const useSections = !selectedProperty && !trimmedQuery && (active.length + next7.length + later.length + past.length) > 0;

  // RT-25.6 tick 7 — in-form conflict warning. Surfaces overlapping
  // reservations + synced calendar events on the picked property/date
  // range BEFORE the host hits "Create Reservation". Addresses a slice
  // of the tick 2 deferred "show what's already booked" item without
  // touching DateSlider's internals (a separate larger lift).
  // Touching dates (checkout === next checkin) are NOT counted as
  // overlap to match the same-day-turnover convention used elsewhere.
  // Synced events come from allSyncedEvents (populated in dashboard
  // mode); in selectedProperty mode the warning relies on the
  // property's Reservation rows alone, which is acceptable since most
  // synced bookings ARE represented as reservations or via the
  // calendar's own conflict UI in that view.
  const formConflicts = useMemo(() => {
    if (!formPropertyId || !formCheckIn || !formCheckOut) return [];
    if (formCheckIn >= formCheckOut) return [];
    const pid = Number(formPropertyId);
    const property = properties.find((p) => p.id === pid);
    type Conflict = { key: string; name: string; platform: string; from: string; to: string };
    const out: Conflict[] = [];
    if (property) {
      for (const res of property.reservations) {
        if (res.id === formEditingId) continue;
        const checkIn = reservationDateKey(res.checkIn);
        const checkOut = reservationDateKey(res.checkOut);
        if (checkIn < formCheckOut && checkOut > formCheckIn) {
          out.push({
            key: `r-${res.id}`,
            name: res.name,
            platform: res.platform,
            from: checkIn,
            to: checkOut,
          });
        }
      }
    }
    const events = allSyncedEvents[pid] || [];
    for (const ev of events) {
      if (isAvailabilityBlock(ev)) continue;
      const startDate = reservationDateKey(ev.startDate);
      const endDate = reservationDateKey(ev.endDate);
      if (startDate < formCheckOut && endDate > formCheckIn) {
        out.push({
          key: `e-${ev.id}`,
          name: friendlyIcalName(ev.summary, ev.platform),
          platform: ev.platform,
          from: startDate,
          to: endDate,
        });
      }
    }
    return out;
  }, [formPropertyId, formCheckIn, formCheckOut, formEditingId, properties, allSyncedEvents]);

  // RT-25.6 tick 8 — booked-dates set for the in-form date picker.
  // Same data sources as the conflict warning (tick 7) — Reservation
  // rows + allSyncedEvents — but rolled out into a Set<dateString> so
  // CalendarGrid can mark each occupied day with a small amber dot.
  // Convention: a booking [checkIn, checkOut) occupies the nights from
  // checkIn (inclusive) through the day BEFORE checkOut (exclusive),
  // matching the "touching dates aren't a conflict" rule the rest of
  // the app uses (same-day turnovers are allowed). Recomputes only
  // when the picked property's data actually changes; the form being
  // hidden costs nothing at runtime.
  const bookedDates = useMemo(() => {
    const set = new Set<string>();
    if (!formPropertyId) return set;
    const pid = Number(formPropertyId);
    const property = properties.find((p) => p.id === pid);
    const addRange = (from: string, to: string) => {
      const fromDate = reservationDateKey(from);
      const toDate = reservationDateKey(to);
      if (!fromDate || !toDate || fromDate >= toDate) return;
      const start = new Date(fromDate + "T12:00:00");
      const end = new Date(toDate + "T12:00:00");
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        set.add(`${y}-${m}-${day}`);
      }
    };
    if (property) {
      for (const res of property.reservations) {
        if (res.id === formEditingId) continue;
        addRange(res.checkIn, res.checkOut);
      }
    }
    const events = allSyncedEvents[pid] || [];
    for (const ev of events) {
      if (isAvailabilityBlock(ev)) continue;
      addRange(ev.startDate, ev.endDate);
    }
    return set;
  }, [formPropertyId, formEditingId, properties, allSyncedEvents]);

  const formNightCount = useMemo(() => {
    if (!formCheckIn || !formCheckOut || formCheckIn >= formCheckOut) return 0;
    const start = new Date(`${formCheckIn}T12:00:00`);
    const end = new Date(`${formCheckOut}T12:00:00`);
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }, [formCheckIn, formCheckOut]);

  const moneyValue = (value: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const formatMoneyInput = (value: number) =>
    Number(value.toFixed(2)).toString();

  useEffect(() => {
    if (formNightCount <= 0) return;
    if (priceSource === "nightly") {
      const nightly = moneyValue(formNightlyPrice);
      setFormTotalPrice(nightly === null ? "" : formatMoneyInput(nightly * formNightCount));
    } else {
      const total = moneyValue(formTotalPrice);
      setFormNightlyPrice(total === null ? "" : formatMoneyInput(total / formNightCount));
    }
  }, [formNightCount, formNightlyPrice, formTotalPrice, priceSource]);

  useEffect(() => {
    if (!formHasParking || formNightCount <= 0) return;
    if (parkingPriceSource === "nightly") {
      const nightly = moneyValue(formParkingNightlyPrice);
      setFormParkingTotalPrice(nightly === null ? "" : formatMoneyInput(nightly * formNightCount));
    } else {
      const total = moneyValue(formParkingTotalPrice);
      setFormParkingNightlyPrice(total === null ? "" : formatMoneyInput(total / formNightCount));
    }
  }, [formHasParking, formNightCount, formParkingNightlyPrice, formParkingTotalPrice, parkingPriceSource]);

  const formTotals = useMemo(() => {
    const totals = { BOB: 0, USD: 0 };
    totals[formPriceCurrency] += moneyValue(formTotalPrice) || 0;
    if (!formExtensionOfId) totals[formGuaranteeCurrency] += moneyValue(formGuarantee) || 0;
    if (formHasParking) totals[formParkingCurrency] += moneyValue(formParkingTotalPrice) || 0;
    return totals;
  }, [formPriceCurrency, formTotalPrice, formGuaranteeCurrency, formGuarantee, formExtensionOfId, formHasParking, formParkingCurrency, formParkingTotalPrice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCheckIn || !formCheckOut || !formPropertyId || savingReservation) return;
    setSavingReservation(true);
    setReservationSaveError("");
    const reservationData = {
      name: formName.trim(),
      checkIn: formCheckIn,
      checkOut: formCheckOut,
      platform: formPlatform,
      nightlyPrice: moneyValue(formNightlyPrice),
      totalPrice: moneyValue(formTotalPrice),
      priceCurrency: formPriceCurrency,
      guaranteeAmount: moneyValue(formGuarantee),
      guaranteeCurrency: formGuaranteeCurrency,
      hasParking: formHasParking,
      parkingNightlyPrice: formHasParking ? moneyValue(formParkingNightlyPrice) : null,
      parkingTotalPrice: formHasParking ? moneyValue(formParkingTotalPrice) : null,
      parkingCurrency: formParkingCurrency,
      note: formNote.trim() || null,
    };
    const result = formEditingId && onUpdateReservation
      ? await onUpdateReservation(formEditingId, reservationData).catch(() => ({ ok: false, error: "No se pudo conectar con el servidor." }))
      : await onAddReservation({
          ...reservationData,
          propertyId: Number(formPropertyId),
          extensionOfId: formExtensionOfId,
        }).catch(() => ({ ok: false, error: "No se pudo conectar con el servidor." }));
    setSavingReservation(false);
    if (!result.ok) {
      setReservationSaveError(result.error || "No se pudo guardar la reserva.");
      return;
    }
    setFormName("");
    setFormCheckIn("");
    setFormCheckOut("");
    setFormNightlyPrice("");
    setFormTotalPrice("");
    setFormPriceCurrency("BOB");
    setFormGuarantee("");
    setFormGuaranteeCurrency("BOB");
    setFormHasParking(false);
    setFormParkingNightlyPrice("");
    setFormParkingTotalPrice("");
    setFormParkingCurrency("BOB");
    setFormNote("");
    setPriceSource("nightly");
    setParkingPriceSource("nightly");
    setFormPlatform("direct");
    setFormExtensionOfId(null);
    setFormEditingId(null);
    setShowForm(false);
  };

  const handleRowClick = (propertyId: number, reservationId: number) => {
    onSelectProperty(propertyId);
    setTimeout(() => onSelectReservation(reservationId), 50);
  };

  const inspectedContext = useMemo(() => {
    if (!inspectedReservationId) return null;
    for (const property of properties) {
      const selected = property.reservations.find((item) => item.id === inspectedReservationId);
      if (!selected) continue;
      const rootId = selected.extensionOfId || selected.id;
      const root = property.reservations.find((item) => item.id === rootId) || selected;
      const family = property.reservations.filter((item) => item.id === rootId || item.extensionOfId === rootId);
      family.sort((a, b) => reservationDateKey(a.checkIn).localeCompare(reservationDateKey(b.checkIn)));
      const initialCheckIn = family.map((item) => reservationDateKey(item.checkIn)).sort()[0];
      const finalCheckOut = family.map((item) => reservationDateKey(item.checkOut)).sort().at(-1)!;
      const lodgingTotal = family.reduce((totals, item) => {
        totals[item.priceCurrency || "BOB"] += item.totalPrice || 0; return totals;
      }, { BOB: 0, USD: 0 });
      const parkingTotal = family.reduce((totals, item) => {
        totals[item.parkingCurrency || "BOB"] += item.parkingTotalPrice || 0; return totals;
      }, { BOB: 0, USD: 0 });
      return { property, selected, root, rootId, family, initialCheckIn, finalCheckOut, lodgingTotal, parkingTotal, selectedFinancials: segmentFinancials(selected) };
    }
    return null;
  }, [inspectedReservationId, properties]);

  const openExtensionForm = () => {
    if (!inspectedContext) return;
    setFormPropertyId(inspectedContext.property.id);
    setFormName(inspectedContext.root.name);
    setFormCheckIn(inspectedContext.finalCheckOut);
    setFormCheckOut("");
    setFormNightlyPrice(inspectedContext.root.nightlyPrice == null ? "" : formatMoneyInput(inspectedContext.root.nightlyPrice));
    setFormTotalPrice(inspectedContext.root.totalPrice == null ? "" : formatMoneyInput(inspectedContext.root.totalPrice));
    setFormPriceCurrency(inspectedContext.root.priceCurrency || "BOB");
    setFormGuarantee("");
    setFormHasParking(Boolean(inspectedContext.root.hasParking));
    setFormParkingNightlyPrice(inspectedContext.root.parkingNightlyPrice == null ? "" : formatMoneyInput(inspectedContext.root.parkingNightlyPrice));
    setFormParkingTotalPrice(inspectedContext.root.parkingTotalPrice == null ? "" : formatMoneyInput(inspectedContext.root.parkingTotalPrice));
    setFormParkingCurrency(inspectedContext.root.parkingCurrency || inspectedContext.root.priceCurrency || "BOB");
    setFormNote("");
    setPriceSource("nightly");
    setParkingPriceSource("nightly");
    setFormPlatform("direct");
    setFormExtensionOfId(inspectedContext.rootId);
    setFormEditingId(null);
    setReservationSaveError("");
    setInspectedReservationId(null);
    setShowForm(true);
  };

  const openEditForm = () => {
    if (!inspectedContext) return;
    const reservation = inspectedContext.selected;
    setFormPropertyId(inspectedContext.property.id);
    setFormName(reservation.name);
    setFormCheckIn(reservationDateKey(reservation.checkIn));
    setFormCheckOut(reservationDateKey(reservation.checkOut));
    setFormNightlyPrice(reservation.nightlyPrice == null ? "" : formatMoneyInput(reservation.nightlyPrice));
    setFormTotalPrice(reservation.totalPrice == null ? "" : formatMoneyInput(reservation.totalPrice));
    setFormPriceCurrency(reservation.priceCurrency || "BOB");
    setFormGuarantee(reservation.guaranteeAmount == null ? "" : formatMoneyInput(reservation.guaranteeAmount));
    setFormGuaranteeCurrency(reservation.guaranteeCurrency || "BOB");
    setFormHasParking(Boolean(reservation.hasParking));
    setFormParkingNightlyPrice(reservation.parkingNightlyPrice == null ? "" : formatMoneyInput(reservation.parkingNightlyPrice));
    setFormParkingTotalPrice(reservation.parkingTotalPrice == null ? "" : formatMoneyInput(reservation.parkingTotalPrice));
    setFormParkingCurrency(reservation.parkingCurrency || reservation.priceCurrency || "BOB");
    setFormNote(reservation.note || "");
    setFormPlatform(reservation.platform || "direct");
    setPriceSource("nightly");
    setParkingPriceSource("nightly");
    setFormExtensionOfId(null);
    setFormEditingId(reservation.id);
    setReservationSaveError("");
    setInspectedReservationId(null);
    setShowForm(true);
  };

  const confirmCancellation = async () => {
    if (!inspectedContext || !onCancelReservation || cancellingReservation) return;
    setCancellingReservation(true);
    setCancellationError("");
    const refunds = [
      { amount: Number(refundBob), currency: "BOB" as const, paymentMethod: refundBobMethod, paidBy: refundPaidBy },
      { amount: Number(refundUsd), currency: "USD" as const, paymentMethod: refundUsdMethod, paidBy: refundPaidBy },
    ].filter((item) => Number.isFinite(item.amount) && item.amount > 0);
    const result = await onCancelReservation(inspectedContext.selected.id, cancellationReason, refunds)
      .catch(() => ({ ok: false, error: "No se pudo conectar con el servidor." }));
    setCancellingReservation(false);
    if (!result.ok) {
      setCancellationError(result.error || "No se pudo cancelar la reserva.");
      return;
    }
    setCancellationReason("");
    setRefundBob(""); setRefundUsd("");
    setShowCancelForm(false);
    setInspectedReservationId(null);
  };

  const selectMovementMethod = (method: string) => {
    setMovementMethod(method);
    if (method === "qr" || method === "transfer") setMovementCurrency("BOB");
    else if (method !== "cash") setMovementCurrency("USD");
    if (method === "airbnb") setMovementType("lodging");
  };

  useEffect(() => {
    if (inspectedContext && inspectedContext.selected.platform !== "airbnb" && movementMethod === "airbnb") {
      selectMovementMethod("qr");
    }
  }, [inspectedContext, movementMethod]);

  const saveAdditionalIncome = async (reservationId: number) => {
    const amount = Number(movementAmount);
    if (!Number.isFinite(amount) || amount <= 0 || (movementType === "additional" && !movementNote.trim())) return;
    setSavingMovement(true);
    setMovementError("");
    const response = await fetch(`/api/reservations/${reservationId}/money-movements`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: movementType, amount, currency: movementCurrency,
        paymentMethod: movementMethod, receivedBy: movementReceiver,
        note: movementNote.trim(),
      }),
    });
    setSavingMovement(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMovementError(body.error || "No se pudo registrar el ingreso.");
      return;
    }
    setMovementAmount(""); setMovementNote("");
    await onRefresh?.();
  };

  const toggleManualSettlement = async () => {
    if (!inspectedContext || !onUpdateReservation || savingSettlement) return;
    setSavingSettlement(true); setMovementError("");
    const result = await onUpdateReservation(inspectedContext.selected.id, { settledManually: !inspectedContext.selectedFinancials.manuallySettled });
    setSavingSettlement(false);
    if (!result.ok) setMovementError(result.error || "No se pudo actualizar el estado de pago.");
  };

  const deleteMoneyMovement = async (movementId: number) => {
    if (deletingMovementId != null) return;
    setDeletingMovementId(movementId); setMovementError("");
    const response = await fetch(`/api/money-movements/${movementId}`, { method: "DELETE" });
    setDeletingMovementId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMovementError(body.error || "No se pudo eliminar el ingreso.");
      return;
    }
    await onRefresh?.();
  };

  const saveImportedAirbnb = async (propertyId: number, stay: MasterCalendarStay) => {
    const amount = Number(airbnbAmount);
    if (!airbnbGuestName.trim() || !stay.uid || !Number.isFinite(amount) || amount <= 0) return;
    setSavingAirbnbDetails(true);
    setMovementError("");
    const reservationResponse = await fetch("/api/reservations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: airbnbGuestName.trim(), propertyId, platform: "airbnb",
        checkIn: toLocalDateStr(stay.start), checkOut: toLocalDateStr(stay.end),
        totalPrice: amount, priceCurrency: "USD",
        linkedEventUid: stay.uid, linkedEventPlatform: "airbnb", linkedEventRole: "claim",
      }),
    });
    if (!reservationResponse.ok) {
      const body = await reservationResponse.json().catch(() => ({}));
      setSavingAirbnbDetails(false);
      setMovementError(body.error || "No se pudieron guardar los datos de Airbnb.");
      return;
    }
    const reservation = await reservationResponse.json();
    const movementResponse = await fetch(`/api/reservations/${reservation.id}/money-movements`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lodging", amount, currency: "USD", paymentMethod: "airbnb", note: "Monto recibido por Airbnb" }),
    });
    setSavingAirbnbDetails(false);
    if (!movementResponse.ok) {
      const body = await movementResponse.json().catch(() => ({}));
      setMovementError(body.error || "La reserva se guardó, pero no su monto recibido.");
      return;
    }
    setAirbnbGuestName(""); setAirbnbAmount(""); setInspectedImportedStay(null);
    await onRefresh?.();
  };

  const masterCalendarProperties = useMemo(() => properties.map((property) => ({
    id: property.id,
    name: property.name,
    stays: buildMasterCalendarStays(property, allSyncedEvents[property.id] || []),
    syncError: (allLinks[property.id] || []).some((link) => Boolean(link.lastError)),
  })), [properties, allSyncedEvents, allLinks]);

  const openReservationFormForProperty = (propertyId: number) => {
    setFormPropertyId(propertyId);
    setFormName("");
    setFormCheckIn("");
    setFormCheckOut("");
    setFormNightlyPrice("");
    setFormTotalPrice("");
    setFormGuarantee("");
    setFormHasParking(false);
    setFormParkingNightlyPrice("");
    setFormParkingTotalPrice("");
    setFormNote("");
    setPriceSource("nightly");
    setParkingPriceSource("nightly");
    setFormPlatform("direct");
    setFormExtensionOfId(null);
    setFormEditingId(null);
    setReservationSaveError("");
    setShowForm(true);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(c.dateLocale, { day: "2-digit", month: "short" });

  const dayCount = (checkIn: string, checkOut: string) => {
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const title = selectedProperty ? selectedProperty.name : t("dashboard.title");
  const resCount = displayReservations.length;
  const subtitle = selectedProperty
    ? c.reservationsCount(resCount)
    : c.reservationsAcross(resCount, properties.length);

  // Zero-property first-screen — the dashboard's main column becomes
  // the onboarding wizard until the user has named one property AND
  // saved at least one calendar feed (or used the sample-property
  // escape, or chose to add reservations manually).
  //
  // The `!loadingProperties` gate matters: without it, a returning
  // user who already has properties sees the wizard for the ~100-500ms
  // it takes the parent to fetch /api/properties (initial state is
  // []). If they start typing before the fetch resolves, the wizard
  // creates a duplicate "My first property" alongside their real
  // properties.
  const isZeroProperties =
    !loadingProperties && !selectedProperty && properties.length === 0;

  const handleSaveName = async () => {
    if (!selectedProperty || !onUpdateProperty) return;
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === selectedProperty.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await onUpdateProperty(selectedProperty.id, { name: trimmed });
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveCardName = async (id: number, original: string) => {
    if (!onUpdateProperty) return;
    const trimmed = cardNameDraft.trim();
    if (!trimmed || trimmed === original) {
      setEditingCardId(null);
      return;
    }
    setSavingCardId(id);
    try {
      await onUpdateProperty(id, { name: trimmed });
      setEditingCardId(null);
    } finally {
      setSavingCardId(null);
    }
  };

  return (
    <div className={`-mx-3 sm:-mx-6 lg:-mx-8 ${selectedProperty ? "" : "h-full min-h-0"}`}>
    <div className={`mx-auto max-w-none px-2 sm:px-4 ${selectedProperty ? "space-y-6" : "flex h-full min-h-0 flex-col gap-3 sm:gap-4"}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          {selectedProperty && editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
                disabled={savingName}
                className="min-w-0 rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-2 py-0.5 text-2xl font-bold text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
              />
              <button
                onClick={handleSaveName}
                disabled={savingName}
                aria-label={t("common.save")}
                title={t("common.save")}
                className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
              <button
                onClick={() => setEditingName(false)}
                disabled={savingName}
                aria-label={t("common.cancel")}
                title={t("common.cancel")}
                className="rounded-md p-1.5 text-[var(--ink-4)] hover:bg-[var(--line-2)] hover:text-[var(--ink)] disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--ink)] sm:text-2xl">
              {title}
              {loadingCalendarData && (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-[var(--line-2)] border-t-[#58a6ff]" />
              )}
              {selectedProperty && onUpdateProperty && (
                <button
                  onClick={() => {
                    setNameValue(selectedProperty.name);
                    setEditingName(true);
                  }}
                  aria-label={t("common.edit")}
                  title={t("common.edit")}
                  className="rounded-md p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--line-2)] hover:text-[var(--ink)]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 7.125L16.875 4.5" />
                  </svg>
                </button>
              )}
            </h1>
          )}
          {!isZeroProperties && (
            <p className="mt-1 text-sm text-[var(--ink-4)]">{subtitle}</p>
          )}
        </div>
        {/* Per-property "+ Reservation" CTAs live inside each
            property card now, so the global header CTA is gone. In
            per-property mode the user is already on the property and
            can use the Calendar tab. */}
        {selectedProperty && (
          <Link
            href={`/dashboard?property=${selectedProperty.id}&view=calendar`}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--m-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--m-accent-2)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("dashboard.newReservation")}
          </Link>
        )}
      </div>

      {/* Zero-property onboarding — empty-state hijack. Replaces the
          earlier "Welcome modal + add-property hero" with an inline
          two-step wizard (property name → connect calendar) so the
          path forward is one focused surface. Auto-exits on first
          calendar save / sample-property creation / manual-reservation
          escape — onComplete refetches the parent's property list. */}
      {isZeroProperties && (
        <DashboardOnboarding
          onComplete={async () => {
            if (onRefresh) await onRefresh();
            else if (typeof window !== "undefined") window.location.reload();
          }}
        />
      )}

      {/* Today strip — check-ins + check-outs scheduled for today across
          all properties. Skipped on quiet days so the dashboard stays
          calm when nothing is happening. RT-25.6 tick 5. */}
      {false && !selectedProperty && properties.length > 0 && (todayCheckIns.length > 0 || todayCheckOuts.length > 0) && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              {t("dashboard.today")}
            </h2>
            <span className="text-xs text-[var(--ink-4)]">
              {new Date().toLocaleDateString(c.dateLocale, { weekday: "short", day: "2-digit", month: "short" })}
            </span>
            {hasCleanerConflictToday && (
              <a
                href="#cleaning-schedule"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
                style={{ backgroundColor: "rgba(217,119,6,0.18)" }}
                title={t("dashboard.cleanerConflictHint")}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {t("dashboard.cleanerConflictBadge")}
              </a>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {todayCheckIns.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
                  {t("dashboard.todayCheckIn")} · {todayCheckIns.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {todayCheckIns.map((res) => (
                    <button
                      key={`in-${res.id}`}
                      type="button"
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--line-2)] hover:bg-[var(--bg-3)]"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: platformColor(res.platform) }}
                      />
                      <span className="font-medium text-[var(--ink)]">{res.name}</span>
                      <span className="text-[var(--ink-4)]">·</span>
                      <span>{res.propertyName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {todayCheckOuts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
                  {t("dashboard.todayCheckOut")} · {todayCheckOuts.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {todayCheckOuts.map((res) => (
                    <button
                      key={`out-${res.id}`}
                      type="button"
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--line-2)] hover:bg-[var(--bg-3)]"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: platformColor(res.platform) }}
                      />
                      <span className="font-medium text-[var(--ink)]">{res.name}</span>
                      <span className="text-[var(--ink-4)]">·</span>
                      <span>{res.propertyName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alerts strip — only renders after BOTH events fetch and
          cleaner-assignments fetch complete so a partial-data state
          can't flash false positives (the dedup heuristic needs
          full event data to merge same-dates iCal twins; the
          no-cleaner-assigned check needs the assignments map).
          Running on partial data produced ghost "double bookings"
          and ghost no-cleaner alerts that disappeared once the
          fetches caught up — visible CLS. */}
      {false && !selectedProperty && !loadingCalendarData && assignmentsFetched && (dashboardAlerts.doubleBookings.length > 0 || cleanerConflictDates.length > 0 || dashboardAlerts.propertiesWithoutCalendar.length > 0) && (
        // Light-theme palette (amber-50 / amber-300 / amber-700) sits next
        // to the dark-theme palette (amber-500/5 + amber-300) via `dark:`
        // overrides. The previous all-dark amber-300 tokens were nearly
        // invisible against amber-500/5 in light mode.
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2.5 dark:border-amber-500/30 dark:bg-amber-500/5">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {c.needsAttention}
            </span>
          </div>
          {dashboardAlerts.doubleBookings.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--ink-2)]">
              <span className="font-medium text-rose-700 dark:text-rose-400">
                {c.doubleBooking}
              </span>
              {dashboardAlerts.doubleBookings.slice(0, 3).map((d, i) => (
                <span key={i} className="text-[var(--ink-2)]">
                  {d.propertyName} — {d.aName} & {d.bName} ({formatDate(toLocalDateStr(d.overlapStart))} → {formatDate(toLocalDateStr(d.overlapEnd))})
                  {i < Math.min(dashboardAlerts.doubleBookings.length, 3) - 1 ? "," : ""}
                </span>
              ))}
              {dashboardAlerts.doubleBookings.length > 3 && (
                <span className="text-[var(--ink-3)]">
                  {c.moreCount(dashboardAlerts.doubleBookings.length - 3)}
                </span>
              )}
            </div>
          )}
          {cleanerConflictDates.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--ink-2)]">
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {c.cleanerConflict}
              </span>
              <span>
                {cleanerConflictDates.slice(0, 3).map((d) => formatDate(d)).join(", ")}
                {cleanerConflictDates.length > 3 && c.moreCountSuffix(cleanerConflictDates.length - 3)}
              </span>
              <a
                href="?view=cleaning"
                className="text-[11px] text-amber-700 underline hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
              >
                {c.openCleaning}
              </a>
            </div>
          )}
          {dashboardAlerts.propertiesWithoutCalendar.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--ink-2)]">
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {c.noCalendars}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {dashboardAlerts.propertiesWithoutCalendar.map((p, i) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/dashboard?property=${p.id}&view=sync`}
                      className="font-medium text-amber-800 underline-offset-2 hover:text-amber-900 hover:underline dark:text-amber-300 dark:hover:text-amber-200"
                    >
                      {p.name}
                    </Link>
                    {i < dashboardAlerts.propertiesWithoutCalendar.length - 1 && (
                      <span className="text-[var(--ink-4)]">·</span>
                    )}
                  </span>
                ))}
                <Link
                  href={`/dashboard?property=${dashboardAlerts.propertiesWithoutCalendar[0].id}&view=sync`}
                  className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
                >
                  {c.connectCalendars}
                  <span aria-hidden>→</span>
                </Link>
              </span>
            </div>
          )}
        </div>
      )}

      {!selectedProperty && properties.length > 0 && (
        <MasterCalendar
          properties={masterCalendarProperties}
          loading={loadingCalendarData}
          onOpenProperty={onSelectProperty}
          onOpenReservation={(_propertyId, reservationId) => setInspectedReservationId(reservationId)}
          onOpenImportedStay={(propertyId, stay) => {
            setAirbnbGuestName(""); setAirbnbAmount(""); setMovementError("");
            setInspectedImportedStay({ propertyId, stay });
          }}
          onCreateReservation={openReservationFormForProperty}
        />
      )}

      {/* Property cards (dashboard mode only). Each card surfaces the
          three things a host actually scans the dashboard for: who is
          IN the property right now (with nights remaining), who is
          coming NEXT (with arrival date), and any sync-error flag. */}
      {false && !selectedProperty && properties.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map(p => {
            const occ = propertyOccupancy.get(p.id);
            const current = occ?.current ?? null;
            const next = occ?.next ?? null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const nightsLeft = current ? Math.round((current.end.getTime() - today.getTime()) / 86400000) : 0;
            const daysUntilNext = next ? Math.round((next.start.getTime() - today.getTime()) / 86400000) : 0;
            const futureRes = p.reservations.filter(r => new Date(r.checkOut) >= new Date());
            const links = allLinks[p.id];
            const failingLinks = Array.isArray(links)
              ? links.filter((l) => Boolean(l.lastError))
              : [];
            const hasSyncError = failingLinks.length > 0;
            return (
              /* Card converted from <button> to <div> so the inner
                 "+ Reservation" Link is valid HTML (no nested
                 interactive elements). The outer click handler
                 still routes to the property's calendar. */
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectProperty(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectProperty(p.id);
                  }
                }}
                className="group rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-5 text-left transition-all hover:border-[var(--line-2)] hover:bg-[var(--bg-3)] cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  {editingCardId === p.id ? (
                    <div
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        value={cardNameDraft}
                        onChange={(e) => setCardNameDraft(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleSaveCardName(p.id, p.name);
                          if (e.key === "Escape") setEditingCardId(null);
                        }}
                        autoFocus
                        disabled={savingCardId === p.id}
                        className="min-w-0 flex-1 rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-2 py-0.5 text-sm font-semibold text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSaveCardName(p.id, p.name); }}
                        disabled={savingCardId === p.id}
                        aria-label={t("common.save")}
                        title={t("common.save")}
                        className="shrink-0 rounded-md p-1 text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCardId(null); }}
                        disabled={savingCardId === p.id}
                        aria-label={t("common.cancel")}
                        title={t("common.cancel")}
                        className="shrink-0 rounded-md p-1 text-[var(--ink-4)] hover:bg-[var(--line-2)] hover:text-[var(--ink)] disabled:opacity-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-1">
                      <h3 className="text-sm font-semibold text-[var(--ink)] transition-colors truncate">{p.name}</h3>
                      {onUpdateProperty && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardNameDraft(p.name);
                            setEditingCardId(p.id);
                          }}
                          aria-label={t("common.edit")}
                          title={t("common.edit")}
                          className="shrink-0 rounded p-0.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--line-2)] hover:text-[var(--ink)]"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 7.125L16.875 4.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <Link
                    href={`/dashboard?property=${p.id}&view=calendar`}
                    onClick={(e) => e.stopPropagation()}
                    title={t("dashboard.newReservation")}
                    aria-label={t("dashboard.newReservation")}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[var(--m-accent)] px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--m-accent-2)]"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span className="hidden sm:inline">{c.reservationLabel}</span>
                  </Link>
                </div>
                <div className="space-y-2">
                  {/* Current guest line — ALWAYS rendered so the card
                      height stays stable regardless of whether the
                      property is currently occupied. While the events
                      fetch is in flight the line shows a muted
                      placeholder; once data arrives it swaps in
                      place without nudging anything below. */}
                  <div className="flex items-baseline gap-2 text-sm min-h-[20px]">
                    {loadingCalendarData ? (
                      <div className="h-3 w-32 rounded bg-[var(--line-2)]/60 animate-pulse" />
                    ) : current ? (
                      <>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: platformColor(current.platform) }}
                        />
                        <span className="font-semibold text-[var(--ink)] truncate">{current.name}</span>
                        <span className="text-[11px] text-[var(--ink-3)] whitespace-nowrap">
                          {c.untilNightsLeft(formatDate(toLocalDateStr(current.end)), nightsLeft)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--ink-3)]">
                        {c.availableLabel}
                      </span>
                    )}
                  </div>
                  {/* Next guest line — ALSO always rendered (with a
                      placeholder when no upcoming stay) so the card
                      doesn't grow / shrink as data lands. Same min-h
                      as the line above keeps the row group stable. */}
                  <div className="flex items-baseline gap-2 text-xs min-h-[16px]">
                    {loadingCalendarData ? (
                      <div className="h-2.5 w-24 rounded bg-[var(--line-2)]/40 animate-pulse" />
                    ) : next ? (
                      <>
                        <span className="text-[var(--ink-4)]">{c.nextLabel}</span>
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: platformColor(next.platform) }}
                        />
                        <span className="font-medium text-[var(--ink-2)] truncate">{next.name}</span>
                        <span className="text-[var(--ink-4)] whitespace-nowrap">
                          {c.inDays(formatDate(toLocalDateStr(next.start)), daysUntilNext)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--ink-4)]">
                        {c.noUpcoming}
                      </span>
                    )}
                  </div>
                  {/* Footer meta — booking count, min nights, sync chip. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-4)] pt-1">
                    <span>{futureRes.length} {c.bookingsCountShort}</span>
                    <span>·</span>
                    <span>{c.minNightsLabel(p.minNights)}</span>
                    {hasSyncError && (
                      <>
                        <span>·</span>
                        <span
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-amber-300"
                          style={{ backgroundColor: "rgba(217,119,6,0.18)" }}
                          title={failingLinks.map((l) => `${platformDisplayName(l.platform)}: ${l.lastError}`).join("\n")}
                        >
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          {c.syncShort}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Reservations List */}
      {false && ((displayReservations.length > 0 || (useSections && past.length > 0)) ? (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)]">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-xs font-medium text-[var(--ink-3)]">
              {selectedProperty
                ? t("dashboard.reservations")
                : t("dashboard.upcomingReservations")}
              {trimmedQuery && (
                <span className="ml-2 text-[var(--ink-4)]">
                  · {displayReservations.length} {c.foundLabel}
                </span>
              )}
            </h2>
          </div>
          {useSections ? (
            <div>
              {/* Currently staying — shows active stays sorted by
                  earliest checkout, so the host can see who's about
                  to leave first. Always-shown header (even if it's
                  the only section) so the bucket is recognisable. */}
              {active.length > 0 && (
                <>
                  <ReservationSectionHeader
                    label={c.currentlyStaying}
                  />
                  {active.map((res, i) => (
                    <ReservationRow
                      key={res.id}
                      res={res}
                      isLast={i === active.length - 1 && next7.length === 0 && later.length === 0 && (!showPast || past.length === 0)}
                      hideProperty={false}
                      formatDate={formatDate}
                      dayCount={dayCount}
                      locale={locale}
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      muted={false}
                    />
                  ))}
                </>
              )}
              {next7.length > 0 && (
                <>
                  {(active.length > 0 || later.length > 0 || past.length > 0) && (
                    <ReservationSectionHeader
                      label={t("calendar.next7Days")}
                      badge={hasCleanerConflictNext7 ? (
                        <a
                          href="?view=cleaning"
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/15"
                          style={{ backgroundColor: "rgba(217,119,6,0.18)" }}
                          title={t("dashboard.cleanerConflictHint")}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          {t("dashboard.cleanerConflictBadge")}
                        </a>
                      ) : undefined}
                    />
                  )}
                  {next7.map((res, i) => (
                    <ReservationRow
                      key={res.id}
                      res={res}
                      isLast={i === next7.length - 1 && later.length === 0 && (!showPast || past.length === 0)}
                      hideProperty={false}
                      formatDate={formatDate}
                      dayCount={dayCount}
                      locale={locale}
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      muted={false}
                    />
                  ))}
                </>
              )}
              {later.length > 0 && (
                <>
                  <ReservationSectionHeader label={t("calendar.later")} />
                  {later.map((res, i) => (
                    <ReservationRow
                      key={res.id}
                      res={res}
                      isLast={i === later.length - 1 && (!showPast || past.length === 0)}
                      hideProperty={false}
                      formatDate={formatDate}
                      dayCount={dayCount}
                      locale={locale}
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      muted={false}
                    />
                  ))}
                </>
              )}
              {past.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPast((v) => !v)}
                    className="flex w-full items-center justify-between border-b border-[var(--line)]/50 bg-[var(--bg-3)]/40 px-4 py-1.5 text-left transition-colors hover:bg-[var(--bg-3)]/70"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
                      {showPast
                        ? t("dashboard.hidePast")
                        : t("dashboard.showPast").replace("{n}", String(past.length))}
                    </span>
                    <svg
                      className={`h-3.5 w-3.5 text-[var(--ink-4)] transition-transform ${showPast ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {showPast && past.map((res, i) => (
                    <ReservationRow
                      key={res.id}
                      res={res}
                      isLast={i === past.length - 1}
                      hideProperty={false}
                      formatDate={formatDate}
                      dayCount={dayCount}
                      locale={locale}
                      onClick={() => handleRowClick(res.propertyId, res.id)}
                      muted={true}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div>
              {displayReservations.map((res, i) => (
                <ReservationRow
                  key={res.id}
                  res={res}
                  isLast={i === displayReservations.length - 1}
                  hideProperty={Boolean(selectedProperty)}
                  formatDate={formatDate}
                  dayCount={dayCount}
                  locale={locale}
                  onClick={() => handleRowClick(res.propertyId, res.id)}
                  muted={false}
                />
              ))}
            </div>
          )}
        </div>
      ) : !isZeroProperties ? (
        <div className="rounded-lg border border-dashed border-[var(--line)] py-16 text-center">
          <p className="text-sm text-[var(--ink-4)]">
            {selectedProperty
              ? t("dashboard.noReservations")
              : t("dashboard.noReservationsGlobal")}
          </p>
        </div>
      ) : null)}

      {/* Cleaning has its own dedicated tab — no inline schedule on
          the dashboard. We still mount a HIDDEN CleaningSchedule
          purely so the cleaner-conflict detection logic runs and
          feeds the Today / Next-7-days conflict badges + the alerts
          strip via onCleanerConflictDatesChange. The visible
          schedule lives at activeView === "cleaning" inside
          GlobalCleaningView. */}
      {!selectedProperty && properties.length > 0 && Object.keys(allSyncedEvents).length > 0 && (
        <div className="hidden" aria-hidden="true">
          <CleaningSchedule
            properties={properties}
            syncedEvents={allSyncedEvents}
            links={allLinks}
            overrides={allOverrides}
            mode="dashboard"
            onOverrideChanged={fetchAllCalendarData}
            cleanerAssignments={cleanerAssignments}
            onCleanerConflictDatesChange={setCleanerConflictDates}
          />
        </div>
      )}

      {inspectedContext && (
        <div onMouseDown={(event) => { if (event.target === event.currentTarget) setInspectedReservationId(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Detalle de reserva">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-[var(--ink)]">{inspectedContext.root.name}</h2><p className="text-xs text-[var(--ink-4)]">{inspectedContext.property.name}</p></div>
              <button type="button" onClick={() => setInspectedReservationId(null)} className="rounded-lg border border-[var(--line-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-3)] hover:text-[var(--ink)]">Cerrar</button>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-[var(--ink-4)]">Canal</dt><dd className="font-medium">{platformDisplayName(inspectedContext.selected.platform)}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Estado</dt><dd className="font-medium">Reserva confirmada</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Ingreso</dt><dd className="font-medium">{new Date(`${reservationDateKey(inspectedContext.selected.checkIn)}T12:00:00`).toLocaleDateString("es-BO")} · 14:00</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Salida</dt><dd className="font-medium">{new Date(`${reservationDateKey(inspectedContext.selected.checkOut)}T12:00:00`).toLocaleDateString("es-BO")} · 11:00</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Hospedaje</dt><dd className="font-medium">{inspectedContext.selected.totalPrice != null ? `${inspectedContext.selected.priceCurrency === "USD" ? "USD" : "Bs"} ${inspectedContext.selected.totalPrice}` : "Sin monto"}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Parqueo</dt><dd className="font-medium">{inspectedContext.selected.hasParking && inspectedContext.selected.parkingTotalPrice != null ? `${inspectedContext.selected.parkingCurrency === "USD" ? "USD" : "Bs"} ${inspectedContext.selected.parkingTotalPrice}` : "No"}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-[var(--ink-4)]">Garantía</dt><dd className="font-medium">{inspectedContext.selected.extensionOfId ? "Se mantiene la garantía de la reserva inicial; no se cobra en esta extensión" : `${inspectedContext.selected.guaranteeCurrency === "USD" ? "USD" : "Bs"} ${inspectedContext.selected.guaranteeAmount ?? 0}`}</dd></div>
              {inspectedContext.selected.note && <div className="col-span-2"><dt className="text-xs text-[var(--ink-4)]">Nota</dt><dd className="mt-1 whitespace-pre-wrap rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-2.5 font-medium">{inspectedContext.selected.note}</dd></div>}
            </dl>
            <div className={`mt-4 rounded-xl border p-3 ${inspectedContext.selectedFinancials.hasOutstandingBalance ? "border-amber-400/40 bg-amber-400/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold">Cobro de {inspectedContext.selected.extensionOfId ? "esta extensión" : "esta reserva"}</span><span className={`text-xs font-bold ${inspectedContext.selectedFinancials.hasOutstandingBalance ? "text-amber-400" : "text-emerald-500"}`}>{inspectedContext.selectedFinancials.manuallySettled ? "Saldado manualmente" : inspectedContext.selectedFinancials.hasOutstandingBalance ? "Pendiente" : inspectedContext.selectedFinancials.balance.BOB > 0.005 || inspectedContext.selectedFinancials.balance.USD > 0.005 ? "Excedente" : "Saldado"}</span></div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-[var(--ink-4)]">A cobrar</span>{(["BOB", "USD"] as const).map(c => inspectedContext.selectedFinancials.expected[c] > 0 && <span key={c} className="block font-semibold">{c === "BOB" ? "Bs" : "USD"} {inspectedContext.selectedFinancials.expected[c]}</span>)}</div><div><span className="block text-[var(--ink-4)]">Pagado</span>{(["BOB", "USD"] as const).map(c => inspectedContext.selectedFinancials.paid[c] > 0 && <span key={c} className="block font-semibold">{c === "BOB" ? "Bs" : "USD"} {inspectedContext.selectedFinancials.paid[c]}</span>)}</div><div><span className="block text-[var(--ink-4)]">Adeudado</span>{(["BOB", "USD"] as const).map(c => Math.abs(inspectedContext.selectedFinancials.balance[c]) > 0.005 && <span key={c} className={`block font-bold ${inspectedContext.selectedFinancials.balance[c] > 0 ? "text-emerald-500" : "text-amber-400"}`}>{inspectedContext.selectedFinancials.balance[c] > 0 ? "+" : "-"} {c === "BOB" ? "Bs" : "USD"} {Math.abs(inspectedContext.selectedFinancials.balance[c]).toLocaleString("es-BO", { maximumFractionDigits: 2 })}</span>)}{Math.abs(inspectedContext.selectedFinancials.balance.BOB) <= 0.005 && Math.abs(inspectedContext.selectedFinancials.balance.USD) <= 0.005 && <span className="font-semibold text-emerald-500">0</span>}</div></div>
              {inspectedContext.selected.platform !== "airbnb" && <button type="button" disabled={savingSettlement} onClick={toggleManualSettlement} className="mt-3 w-full rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50">{savingSettlement ? "Guardando…" : inspectedContext.selectedFinancials.manuallySettled ? "Quitar marca de saldado" : "Marcar este tramo como saldado"}</button>}
            </div>
            {(inspectedContext.selected.moneyMovements?.length || 0) > 0 && <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
              <div className="mb-2 text-xs font-semibold text-[var(--ink-2)]">Dinero recibido</div>
              <div className="space-y-2">{inspectedContext.selected.moneyMovements!.map((movement) => <div key={movement.id} className="flex items-start justify-between gap-3 text-xs"><div><span className={`font-medium ${movement.amountMinor < 0 ? "text-red-400" : "text-[var(--ink)]"}`}>{movement.currency === "USD" ? "USD" : "Bs"} {(movement.amountMinor / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}</span><span className="ml-2 rounded bg-[var(--bg-3)] px-1.5 py-0.5 font-medium text-[var(--ink-2)]">{MOVEMENT_TYPE_LABELS[movement.type] || movement.type}</span><span className="ml-2 text-[var(--ink-4)]">{movement.paymentMethod === "cash" ? "Efectivo" : movement.paymentMethod === "transfer" ? "Transferencia" : movement.paymentMethod.toUpperCase()}</span>{movement.note && <p className="mt-0.5 text-[var(--ink-3)]">{movement.note}</p>}</div><div className="flex shrink-0 items-center gap-2"><span className="capitalize text-[var(--ink-4)]">{movement.receivedBy || "Distribución Airbnb"}</span><button type="button" disabled={deletingMovementId != null} onClick={() => deleteMoneyMovement(movement.id)} className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--ink-4)] hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40" aria-label={`Eliminar ingreso de ${movement.currency === "USD" ? "USD" : "Bs"} ${Math.abs(movement.amountMinor / 100)}`} title="Eliminar este registro">×</button></div></div>)}</div>
            </div>}
            <div className="mt-4 rounded-xl border border-[var(--line)] p-3">
              <div className="text-xs font-semibold text-[var(--ink-2)]">Registrar dinero recibido</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select aria-label="Concepto del pago" disabled={movementMethod === "airbnb"} value={movementType} onChange={(e) => setMovementType(e.target.value as typeof movementType)} className="col-span-2 h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs disabled:opacity-70"><option value="lodging">Hospedaje</option><option value="parking">Parqueo</option><option value="guarantee">Garantía</option><option value="additional">Ingreso adicional</option></select>
                <select aria-label="Método de pago" value={movementMethod} onChange={(e) => selectMovementMethod(e.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs"><option value="qr">QR</option><option value="cash">Efectivo</option>{inspectedContext.selected.platform === "airbnb" && <option value="airbnb">Airbnb</option>}<option value="takenos">Takenos</option><option value="binance">Binance</option><option value="transfer">Transferencia</option><option value="sepa">SEPA</option></select>
                <div className="flex"><select aria-label="Moneda del ingreso" disabled={movementMethod !== "cash"} value={movementCurrency} onChange={(e) => setMovementCurrency(e.target.value as "BOB" | "USD")} className="h-9 rounded-l-lg border border-r-0 border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs disabled:opacity-70"><option value="BOB">Bs</option><option value="USD">USD</option></select><input aria-label="Monto recibido" type="number" min="0.01" step="0.01" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} className="h-9 min-w-0 flex-1 rounded-r-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs" placeholder="Monto" /></div>
                {movementMethod === "airbnb" ? <div className="flex h-9 items-center rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink-3)]">Distribución automática</div> : <select aria-label="Persona que recibió" value={movementReceiver} onChange={(e) => setMovementReceiver(e.target.value as "deysi" | "milton")} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs"><option value="deysi">Deysi</option><option value="milton">Milton</option></select>}
                <input aria-label="Nota del ingreso" value={movementNote} onChange={(e) => setMovementNote(e.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs" placeholder={movementType === "additional" ? "Motivo obligatorio" : "Nota opcional"} />
              </div>
              {movementError && <p className="mt-2 text-xs text-red-400">{movementError}</p>}
              <button type="button" disabled={savingMovement || !movementAmount || (movementType === "additional" && !movementNote.trim())} onClick={() => saveAdditionalIncome(inspectedContext.selected.id)} className="mt-2 w-full rounded-lg bg-[var(--brand-orange)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-45">{savingMovement ? "Registrando…" : "Registrar ingreso"}</button>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => handleRowClick(inspectedContext.property.id, inspectedContext.selected.id)} className="rounded-lg border border-[var(--line-2)] px-3 py-2 text-sm">Ver detalle</button>
              <button type="button" onClick={openEditForm} className="rounded-lg border border-[var(--line-2)] px-3 py-2 text-sm font-medium">Modificar</button>
              <button type="button" onClick={() => { setCancellationReason(""); setCancellationError(""); setShowCancelForm(true); }} className="rounded-lg border border-red-500/40 px-3 py-2 text-sm font-medium text-red-400">Cancelar reserva</button>
              <button type="button" onClick={openExtensionForm} className="rounded-lg bg-[var(--brand-orange)] px-3 py-2 text-sm font-semibold text-white">Extender estadía</button>
            </div>
            <button type="button" onClick={() => setInspectedReservationId(null)} className="mt-3 w-full rounded-lg border border-[var(--line-2)] px-3 py-2 text-sm font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-3)]">Cerrar</button>
          </div>
        </div>
      )}

      {inspectedImportedStay && (() => {
        const property = properties.find((item) => item.id === inspectedImportedStay.propertyId);
        const stay = inspectedImportedStay.stay;
        const isBlock = stay.platform.endsWith("-block");
        const nights = Math.max(0, Math.round((stay.end.getTime() - stay.start.getTime()) / 86_400_000));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Detalle de reserva importada">
            <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-lg font-semibold text-[var(--ink)]">{isBlock ? "No disponible" : stay.name}</h2><p className="text-xs text-[var(--ink-4)]">{property?.name}</p></div>
                <button type="button" onClick={() => setInspectedImportedStay(null)} aria-label="Cerrar" className="p-1.5 text-[var(--ink-4)]">✕</button>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-[var(--ink-4)]">Estado</dt><dd className="mt-1 font-medium">{isBlock ? "Bloqueado por el canal" : "Reserva confirmada"}</dd></div>
                <div><dt className="text-xs text-[var(--ink-4)]">Canal</dt><dd className="mt-1 font-medium">{platformDisplayName(stay.platform.replace(/-block$/, ""))}</dd></div>
                <div><dt className="text-xs text-[var(--ink-4)]">Ingreso</dt><dd className="mt-1 font-medium">{stay.start.toLocaleDateString("es-BO")} · 14:00</dd></div>
                <div><dt className="text-xs text-[var(--ink-4)]">Salida</dt><dd className="mt-1 font-medium">{stay.end.toLocaleDateString("es-BO")} · 11:00</dd></div>
                <div className="col-span-2"><dt className="text-xs text-[var(--ink-4)]">Duración</dt><dd className="mt-1 font-medium">{nights} {nights === 1 ? "noche" : "noches"}</dd></div>
              </dl>
              <p className="mt-5 rounded-lg bg-[var(--bg-2)] p-3 text-xs text-[var(--ink-3)]">La información importada por iCal no incluye datos personales, precios ni detalles del huésped.</p>
              {!isBlock && stay.platform === "airbnb" && <div className="mt-4 rounded-xl border border-[var(--brand-orange)]/30 bg-[var(--brand-orange-soft)] p-3">
                <div className="text-sm font-semibold text-[var(--ink)]">Completar datos de Airbnb</div>
                <p className="mt-1 text-xs text-[var(--ink-3)]">El monto representa el total ya recibido y se distribuirá automáticamente según el operador del departamento.</p>
                <div className="mt-3 space-y-2">
                  <input value={airbnbGuestName} onChange={(e) => setAirbnbGuestName(e.target.value)} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm" placeholder="Nombre del huésped" />
                  <div className="flex"><span className="flex h-10 items-center rounded-l-lg border border-r-0 border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs font-semibold">USD</span><input type="number" min="0.01" step="0.01" value={airbnbAmount} onChange={(e) => setAirbnbAmount(e.target.value)} className="h-10 min-w-0 flex-1 rounded-r-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm" placeholder="Monto total recibido" /></div>
                </div>
                {movementError && <p className="mt-2 text-xs text-red-500">{movementError}</p>}
                <button type="button" disabled={savingAirbnbDetails || !airbnbGuestName.trim() || !airbnbAmount || !stay.uid} onClick={() => saveImportedAirbnb(inspectedImportedStay.propertyId, stay)} className="mt-3 w-full rounded-lg bg-[var(--brand-orange)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">{savingAirbnbDetails ? "Guardando…" : "Guardar huésped y monto recibido"}</button>
                {!stay.uid && <p className="mt-2 text-xs text-red-500">Este evento no tiene identificador iCal y no puede vincularse automáticamente.</p>}
              </div>}
            </div>
          </div>
        );
      })()}

      {inspectedContext && showCancelForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-label="Cancelar reserva">
          <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--ink)]">Cancelar reserva</h2>
            <p className="mt-2 text-sm text-[var(--ink-3)]">
              Se liberarán las fechas de {inspectedContext.root.name}. La reserva dejará de mostrarse, pero quedará registrada como cancelada.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Motivo de cancelación (opcional)</span>
              <textarea value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={1000} rows={3} className="w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] p-3 text-sm text-[var(--ink)] outline-none focus:border-red-400" placeholder="Ej. El huésped canceló su viaje" />
            </label>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3">
              <div className="text-sm font-semibold text-[var(--ink)]">Reembolso al huésped</div>
              <p className="mt-1 text-xs text-[var(--ink-4)]">Opcional. Registre únicamente el dinero efectivamente devuelto. La diferencia permanece como monto retenido o sanción y seguirá conciliándose.</p>
              <div className="mt-3 grid grid-cols-[1fr_120px] gap-2">
                <div className="flex"><span className="flex h-9 items-center rounded-l-lg border border-r-0 border-[var(--line-2)] px-2 text-xs">Bs</span><input aria-label="Reembolso en bolivianos" type="number" min="0" step="0.01" value={refundBob} onChange={(e) => setRefundBob(e.target.value)} className="h-9 min-w-0 flex-1 rounded-r-lg border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs" placeholder="0" /></div>
                <select aria-label="Método del reembolso en bolivianos" value={refundBobMethod} onChange={(e) => setRefundBobMethod(e.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs"><option value="qr">QR</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select>
                <div className="flex"><span className="flex h-9 items-center rounded-l-lg border border-r-0 border-[var(--line-2)] px-2 text-xs">USD</span><input aria-label="Reembolso en dólares" type="number" min="0" step="0.01" value={refundUsd} onChange={(e) => setRefundUsd(e.target.value)} className="h-9 min-w-0 flex-1 rounded-r-lg border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs" placeholder="0" /></div>
                <select aria-label="Método del reembolso en dólares" value={refundUsdMethod} onChange={(e) => setRefundUsdMethod(e.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs"><option value="cash">Efectivo</option><option value="takenos">Takenos</option><option value="binance">Binance</option><option value="sepa">SEPA</option></select>
                <label className="col-span-2 flex items-center justify-between gap-3 text-xs text-[var(--ink-3)]"><span>Persona que realiza el reembolso</span><select value={refundPaidBy} onChange={(e) => setRefundPaidBy(e.target.value as "deysi" | "milton")} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3"><option value="deysi">Deysi</option><option value="milton">Milton</option></select></label>
              </div>
            </div>
            {cancellationError && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-400">{cancellationError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={cancellingReservation} onClick={() => setShowCancelForm(false)} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-sm">Volver</button>
              <button type="button" disabled={cancellingReservation} onClick={confirmCancellation} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{cancellingReservation ? "Cancelando…" : "Confirmar cancelación"}</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={formEditingId ? "Modificar reserva" : "Nueva reserva"}>
          <form onSubmit={handleSubmit} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--ink)]">{formEditingId ? "Modificar reserva" : formExtensionOfId ? "Extender estadía" : "Nueva reserva confirmada"}</h2>
                <p className="mt-1 text-xs text-[var(--ink-4)]">{formEditingId ? "Actualice únicamente los datos que necesite cambiar." : formExtensionOfId ? "Puede usar otro canal y otra tarifa; la garantía se mantiene." : "La unidad seleccionada será la asignación física real."}</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-[var(--ink-4)] hover:bg-[var(--bg-3)] hover:text-[var(--ink)]" aria-label="Cerrar">✕</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Departamento físico</span>
                <select disabled={Boolean(formExtensionOfId)} value={formPropertyId} onChange={(e) => setFormPropertyId(Number(e.target.value))} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)] disabled:opacity-70">
                  {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Nombre del huésped o reserva</span>
                <input autoFocus required value={formName} onChange={(e) => setFormName(e.target.value)} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]" placeholder="Ej. María Pérez" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Canal</span>
                <select value={formPlatform} onChange={(e) => { const platform = e.target.value; setFormPlatform(platform); if (platform === "airbnb") setFormPriceCurrency("USD"); }} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)]">
                  {formPlatformOptions.map((platform) => (
                    <option key={platform} value={platform}>
                      {locale === "es" && platform === "direct" ? "Directo" : platformDisplayName(platform)}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Estadía</span>
                {formExtensionOfId ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm">
                    <span className="shrink-0 text-[var(--ink-3)]">{new Date(`${formCheckIn}T12:00:00`).toLocaleDateString("es-BO")}</span>
                    <span>→</span>
                    <input aria-label="Nueva fecha de salida" type="date" min={addCalendarDays(formCheckIn, 1)} value={formCheckOut} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(e) => setFormCheckOut(e.target.value)} className="min-w-0 flex-1 cursor-pointer bg-transparent outline-none" />
                  </div>
                ) : <DateSlider checkIn={formCheckIn} checkOut={formCheckOut} onChangeCheckIn={setFormCheckIn} onChangeCheckOut={setFormCheckOut} bookedDates={bookedDates} compact />}
              </div>
              <label>
                <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[var(--ink-3)]">Precio por noche <select aria-label="Moneda del hospedaje" value={formPriceCurrency} onChange={(e) => setFormPriceCurrency(e.target.value as "BOB" | "USD")} className="rounded border border-[var(--line-2)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px]"><option value="BOB">Bs</option><option value="USD">USD</option></select></span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--ink-4)]">{formPriceCurrency === "USD" ? "$" : "Bs"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={formNightlyPrice}
                    onChange={(e) => { setPriceSource("nightly"); setFormNightlyPrice(e.target.value); }}
                    className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]"
                    placeholder="0"
                  />
                </div>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">
                  Precio total {formNightCount > 0 && <span className="font-normal text-[var(--ink-4)]">· {formNightCount} {formNightCount === 1 ? "noche" : "noches"}</span>}
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--ink-4)]">{formPriceCurrency === "USD" ? "$" : "Bs"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={formTotalPrice}
                    onChange={(e) => { setPriceSource("total"); setFormTotalPrice(e.target.value); }}
                    className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]"
                    placeholder="0"
                  />
                </div>
              </label>
              <label>
                <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[var(--ink-3)]">Garantía {!formExtensionOfId && <select aria-label="Moneda de la garantía" value={formGuaranteeCurrency} onChange={(e) => setFormGuaranteeCurrency(e.target.value as "BOB" | "USD")} className="rounded border border-[var(--line-2)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px]"><option value="BOB">Bs</option><option value="USD">USD</option></select>}</span>
                {formExtensionOfId ? (
                  <div className="flex h-10 items-center rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] px-3 text-xs text-[var(--ink-3)]">Se mantiene; no se cobra nuevamente</div>
                ) : <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--ink-4)]">{formGuaranteeCurrency === "USD" ? "$" : "Bs"}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={formGuarantee}
                    onChange={(e) => setFormGuarantee(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]"
                    placeholder="0"
                  />
                </div>}
              </label>
              <div className="sm:col-span-2 mt-1 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[var(--line-2)]" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-4)]">Parqueo</span>
                <span className="h-px flex-1 bg-[var(--line-2)]" />
              </div>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">¿Incluye parqueo?</span>
                <select value={formHasParking ? "yes" : "no"} onChange={(e) => {
                  const enabled = e.target.value === "yes";
                  setFormHasParking(enabled);
                  if (!enabled) {
                    setFormParkingNightlyPrice("");
                    setFormParkingTotalPrice("");
                  }
                }} className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-sm text-[var(--ink)]">
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </select>
              </label>
              {formHasParking && (
                <>
                  <label>
                    <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[var(--ink-3)]">Parqueo por noche <select aria-label="Moneda del parqueo" value={formParkingCurrency} onChange={(e) => setFormParkingCurrency(e.target.value as "BOB" | "USD")} className="rounded border border-[var(--line-2)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px]"><option value="BOB">Bs</option><option value="USD">USD</option></select></span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--ink-4)]">{formParkingCurrency === "USD" ? "$" : "Bs"}</span>
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={formParkingNightlyPrice}
                        onChange={(e) => { setParkingPriceSource("nightly"); setFormParkingNightlyPrice(e.target.value); }}
                        className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]" placeholder="30" />
                    </div>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">
                      Parqueo total {formNightCount > 0 && <span className="font-normal text-[var(--ink-4)]">· {formNightCount} {formNightCount === 1 ? "noche" : "noches"}</span>}
                    </span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[var(--ink-4)]">{formParkingCurrency === "USD" ? "$" : "Bs"}</span>
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={formParkingTotalPrice}
                        onChange={(e) => { setParkingPriceSource("total"); setFormParkingTotalPrice(e.target.value); }}
                        className="h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]" placeholder="0" />
                    </div>
                  </label>
                </>
              )}
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-[var(--ink-3)]">Nota (opcional)</span>
                <textarea
                  value={formNote}
                  onChange={(event) => setFormNote(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand-orange)]"
                  placeholder="Ej. Quiere entrar temprano o pagará en efectivo"
                />
              </label>
              <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-[var(--brand-orange)]/25 bg-[var(--brand-orange-soft)] px-4 py-3">
                <div>
                  <span className="block text-xs font-semibold text-[var(--ink)]">Monto total a cobrar</span>
                  <span className="mt-0.5 block text-[10px] text-[var(--ink-4)]">Estadía + garantía + parqueo</span>
                </div>
                <span className="text-right text-sm font-bold tabular-nums text-[var(--brand-orange)]">{formTotals.BOB > 0 && <span className="block">Bs {formatMoneyInput(formTotals.BOB)}</span>}{formTotals.USD > 0 && <span className="block">USD {formatMoneyInput(formTotals.USD)}</span>}{formTotals.BOB === 0 && formTotals.USD === 0 && <span>Bs 0</span>}</span>
              </div>
            </div>

            {formConflicts.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                Estas fechas se superponen con {formConflicts.map((conflict) => conflict.name).join(", ")}. Cambie la unidad o las fechas.
              </div>
            )}

            {reservationSaveError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
                {reservationSaveError}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={savingReservation} onClick={() => setShowForm(false)} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--bg-3)] disabled:opacity-45">Cancelar</button>
              <button type="submit" disabled={savingReservation || !formName.trim() || !formCheckIn || !formCheckOut || formCheckIn >= formCheckOut || formConflicts.length > 0} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--m-accent-2)] disabled:cursor-not-allowed disabled:opacity-45">{savingReservation ? "Guardando…" : formEditingId ? "Guardar cambios" : "Guardar reserva"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
    </div>
  );
}

function ReservationSectionHeader({ label, badge }: { label: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line)]/50 bg-[var(--bg-3)]/40 px-4 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">
        {label}
      </span>
      {badge}
    </div>
  );
}

interface ReservationRowProps {
  res: {
    id: number;
    name: string;
    platform: string;
    checkIn: string;
    checkOut: string;
    propertyName: string;
    propertyId: number;
    _count?: { guests: number };
  };
  isLast: boolean;
  hideProperty: boolean;
  formatDate: (d: string) => string;
  dayCount: (a: string, b: string) => number;
  locale: string;
  onClick: () => void;
  muted: boolean;
}

function ReservationRow({ res, isLast, hideProperty, formatDate, dayCount, locale, onClick, muted }: ReservationRowProps) {
  const c = COPY[locale as Locale];
  return (
    <div
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-[var(--bg-3)] sm:gap-4 sm:px-4 ${
        !isLast ? "border-b border-[var(--line)]/50" : ""
      } ${muted ? "opacity-60" : ""}`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: platformColor(res.platform) }}
      />

      {/* Two-line stack on mobile (name above, dates below) so the
          row collapses to ~140px content width — the flat horizontal
          layout used to push name/dates/platform/day-count/guest-count
          all on one line, and at 375px the guest name was truncating
          to 2-3 letters behind the platform pill. The sm+ row keeps
          the original side-by-side layout. */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-[var(--ink)]">{res.name}</span>
          {!hideProperty && (
            <span className="hidden truncate text-sm text-[var(--ink-3)] sm:block">
              {res.propertyName}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--ink-4)] sm:hidden">
          <span className="truncate">
            {formatDate(res.checkIn)} — {formatDate(res.checkOut)}
          </span>
          <span aria-hidden>·</span>
          <span>{dayCount(res.checkIn, res.checkOut)}{c.daysShort}</span>
        </div>
      </div>

      {/* Brand pill — solid platform color + white text, matches the
          date-actions popover and Reports's Top-source pill so the
          chromatic language stays uniform across surfaces. Hidden on
          mobile because the color dot at the row start already
          identifies the source. */}
      <span
        className="hidden shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white sm:inline"
        style={{ backgroundColor: platformColor(res.platform) }}
      >
        {platformDisplayName(res.platform)}
      </span>

      <span className="hidden shrink-0 text-sm text-[var(--ink-3)] sm:inline">
        {formatDate(res.checkIn)} — {formatDate(res.checkOut)}
      </span>

      <span className="hidden shrink-0 w-10 text-right text-xs text-[var(--ink-4)] sm:inline">
        {dayCount(res.checkIn, res.checkOut)}{c.daysShort}
      </span>

      <span className="hidden shrink-0 w-10 text-right text-xs text-[var(--ink-4)] sm:inline">
        {res._count?.guests || 0}
        <span className="ml-0.5 text-[var(--ink-4)]">{c.guestShort}</span>
      </span>

      <svg className="h-4 w-4 shrink-0 text-[var(--ink-4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </div>
  );
}
