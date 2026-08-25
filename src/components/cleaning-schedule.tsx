"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";
import type { Property, CalendarLink, DateOverride } from "@/lib/types";
import { bookingWindowCutoff } from "@/lib/types";
import { toReservationDateInput } from "@/lib/reservation-dates";

interface CopyShape {
  dateLocale: string;
  arriveByLabel: (time: string) => string;
  fullDayLabel: string;
  manualLabel: string;
  potentialPrefix: string;
  scheduleHeader: string;
  conflictNoBackup: string;
  conflictBackupBusy: (name: string) => string;
  conflictBackupSet: (name: string) => string;
  daysCount: (n: number) => string;
  cleaningCta: string;
  todayGroup: string;
  tomorrowGroup: string;
  datedGroup: (date: string) => string;
  guestChange: string;
  sameDay: string;
  enters: string;
  leaves: string;
  priority: string;
  potential: string;
  viewReservation: (name: string) => string;
  copyToday: string;
  copyTomorrow: string;
  showAll: (count: number) => string;
  showOnlyNear: string;
  noCleanings: string;
}

const COPY: Record<Locale, CopyShape> = {
  en: {
    dateLocale: "en-GB",
    arriveByLabel: (time) => `quick cleaning, arrive by ${time}`,
    fullDayLabel: "full day available",
    manualLabel: "cleaning",
    potentialPrefix: "potential — ",
    scheduleHeader: "Cleaning Schedule",
    conflictNoBackup: " (conflict — no backup configured)",
    conflictBackupBusy: (name) => ` (conflict — backup ${name} also busy)`,
    conflictBackupSet: (name) => ` (conflict — backup: ${name})`,
    daysCount: (n) => (n === 1 ? "day" : "days"),
    cleaningCta: "Cleaning",
    todayGroup: "Cleanings today",
    tomorrowGroup: "Cleanings tomorrow",
    datedGroup: (date) => `Cleanings on ${date}`,
    guestChange: "Guest change",
    sameDay: "(same day)",
    enters: "Arrives",
    leaves: "Leaves",
    priority: "Priority",
    potential: "Potential",
    viewReservation: (name) => `View ${name}'s reservation`,
    copyToday: "Copy today's cleanings",
    copyTomorrow: "Copy tomorrow's cleanings",
    showAll: (count) => `View all future cleanings (${count})`,
    showOnlyNear: "Show only today and tomorrow",
    noCleanings: "No cleanings scheduled",
  },
  ru: {
    dateLocale: "ru-RU",
    arriveByLabel: (time) => `быстрая уборка, прибыть к ${time}`,
    fullDayLabel: "полный день",
    manualLabel: "уборка",
    potentialPrefix: "возможная — ",
    scheduleHeader: "График уборок",
    conflictNoBackup: " (конфликт — резерв не настроен)",
    conflictBackupBusy: (name) => ` (конфликт — резерв ${name} тоже занят)`,
    conflictBackupSet: (name) => ` (конфликт — резерв: ${name})`,
    daysCount: (n) => (n === 1 ? "день" : "дней"),
    cleaningCta: "Уборка",
    todayGroup: "Уборки сегодня",
    tomorrowGroup: "Уборки завтра",
    datedGroup: (date) => `Уборки ${date}`,
    guestChange: "Смена гостя",
    sameDay: "(в тот же день)",
    enters: "Заезд",
    leaves: "Выезд",
    priority: "Приоритет",
    potential: "Возможно",
    viewReservation: (name) => `Открыть бронь: ${name}`,
    copyToday: "Копировать уборки на сегодня",
    copyTomorrow: "Копировать уборки на завтра",
    showAll: (count) => `Показать все будущие уборки (${count})`,
    showOnlyNear: "Только сегодня и завтра",
    noCleanings: "Уборок нет",
  },
  de: {
    dateLocale: "de-DE",
    arriveByLabel: (time) => `Schnellreinigung, Ankunft bis ${time}`,
    fullDayLabel: "ganzer Tag verfügbar",
    manualLabel: "Reinigung",
    potentialPrefix: "möglich — ",
    scheduleHeader: "Reinigungsplan",
    conflictNoBackup: " (Konflikt — kein Backup konfiguriert)",
    conflictBackupBusy: (name) => ` (Konflikt — Backup ${name} ebenfalls belegt)`,
    conflictBackupSet: (name) => ` (Konflikt — Backup: ${name})`,
    daysCount: (n) => (n === 1 ? "Tag" : "Tage"),
    cleaningCta: "Reinigung",
    todayGroup: "Reinigungen heute",
    tomorrowGroup: "Reinigungen morgen",
    datedGroup: (date) => `Reinigungen am ${date}`,
    guestChange: "Gästewechsel",
    sameDay: "(am selben Tag)",
    enters: "Anreise",
    leaves: "Abreise",
    priority: "Priorität",
    potential: "Möglich",
    viewReservation: (name) => `Buchung von ${name} öffnen`,
    copyToday: "Heutige Reinigungen kopieren",
    copyTomorrow: "Morgige Reinigungen kopieren",
    showAll: (count) => `Alle zukünftigen Reinigungen (${count})`,
    showOnlyNear: "Nur heute und morgen",
    noCleanings: "Keine Reinigungen geplant",
  },
  fr: {
    dateLocale: "fr-FR",
    arriveByLabel: (time) => `ménage rapide, arrivée avant ${time}`,
    fullDayLabel: "journée entière disponible",
    manualLabel: "ménage",
    potentialPrefix: "possible — ",
    scheduleHeader: "Planning des ménages",
    conflictNoBackup: " (conflit — aucun remplaçant configuré)",
    conflictBackupBusy: (name) => ` (conflit — le remplaçant ${name} est aussi pris)`,
    conflictBackupSet: (name) => ` (conflit — remplaçant : ${name})`,
    daysCount: (n) => (n === 1 ? "jour" : "jours"),
    cleaningCta: "Ménage",
    todayGroup: "Ménages aujourd’hui",
    tomorrowGroup: "Ménages demain",
    datedGroup: (date) => `Ménages le ${date}`,
    guestChange: "Changement de voyageur",
    sameDay: "(le même jour)",
    enters: "Arrivée",
    leaves: "Départ",
    priority: "Priorité",
    potential: "Potentiel",
    viewReservation: (name) => `Voir la réservation de ${name}`,
    copyToday: "Copier les ménages d’aujourd’hui",
    copyTomorrow: "Copier les ménages de demain",
    showAll: (count) => `Voir tous les ménages à venir (${count})`,
    showOnlyNear: "Afficher seulement aujourd’hui et demain",
    noCleanings: "Aucun ménage prévu",
  },
  es: {
    dateLocale: "es-ES",
    arriveByLabel: (time) => `limpieza rápida, llegar antes de las ${time}`,
    fullDayLabel: "día completo disponible",
    manualLabel: "limpieza",
    potentialPrefix: "posible — ",
    scheduleHeader: "Calendario de limpiezas",
    conflictNoBackup: " (conflicto — sin suplente configurado)",
    conflictBackupBusy: (name) => ` (conflicto — el suplente ${name} también ocupado)`,
    conflictBackupSet: (name) => ` (conflicto — suplente: ${name})`,
    daysCount: (n) => (n === 1 ? "día" : "días"),
    cleaningCta: "Limpieza",
    todayGroup: "Limpiezas hoy",
    tomorrowGroup: "Limpiezas mañana",
    datedGroup: (date) => `Limpiezas el ${date}`,
    guestChange: "Cambio de huésped",
    sameDay: "(el mismo día)",
    enters: "Entra",
    leaves: "Sale",
    priority: "Prioridad",
    potential: "Potencial",
    viewReservation: (name) => `Ver reserva de ${name}`,
    copyToday: "Copiar limpiezas de hoy",
    copyTomorrow: "Copiar limpiezas de mañana",
    showAll: (count) => `Ver todas las limpiezas futuras (${count})`,
    showOnlyNear: "Mostrar solo hoy y mañana",
    noCleanings: "No hay limpiezas programadas",
  },
};

/** RT-25.10 tick 3 — single cleaner assignment slot for a property.
 *  Sorted priority-asc within a property's list, so element [0] is the
 *  default and [1] is the first backup. `identityKey` is the stable
 *  key used to group conflicts across properties (a profile assigned
 *  to two properties shares one key). */
export interface CleanerAssignmentInfo {
  identityKey: string;
  name: string;
  priority: number;
}

/** Imperative API exposed via ref. Lets parents (e.g. PropertyCleaningView)
 *  drive Copy / Print from a sidebar that lives outside this component
 *  while the internal state and computations stay co-located here. */
export interface CleaningScheduleHandle {
  copy: () => void;
  print: () => void;
}

interface CalendarEvent {
  id: number;
  uid?: string;
  platform: string;
  summary: string;
  startDate: string;
  endDate: string;
}

type CleaningKind = "after" | "before" | "turnover" | "gap-potential" | "manual";
type BufferMode = "full" | "quick";

interface CleaningDay {
  date: string;
  type: "cleaning" | "potential";
  property: string;
  propertyId: number;
  kind: CleaningKind;
  bufferMode: BufferMode; // "full" = bufferBefore/After ≥ 1, "quick" = same-day turnover
  prevGuest?: string;
  nextGuest?: string;
  prevReservationId?: number;
  nextReservationId?: number;
  prevPlatform?: string;
  nextPlatform?: string;
  manualNote?: string;
  movableTo?: string;
  hoursAvailable?: number; // only when meaningful (< 24h, true same-day turnover)
  isManual?: boolean; // true if created via a "closed" date override
  // Context dates that drive the date-specific reason text. Keeping them
  // on the row means formatReason can be a pure function.
  prevEndDate?: string;     // checkout date of prev booking
  nextStartDate?: string;   // checkin date of next booking
  gapStartDate?: string;    // first day of bookable gap (gap-potential only)
  gapEndDate?: string;      // last day of bookable gap (gap-potential only)
  // RT-25.10 tick 2 — name of the priority-0 cleaner assigned to the
  // property at the time the schedule is built. Surfaced as a chip in
  // the row markup and appended to the copy/print line. Undefined when
  // no cleaner is assigned (or when the caller does not pass a map).
  cleanerName?: string;
  // RT-25.10 tick 3 — stable identity key of the priority-0 cleaner.
  // Used to detect cleaner conflicts (same key on the same date across
  // multiple properties). Undefined when no cleaner assigned.
  cleanerKey?: string;
}

interface CleaningScheduleProps {
  properties: Property[];
  syncedEvents: Record<number, CalendarEvent[]>;
  links: Record<number, CalendarLink[]>;
  overrides?: Record<number, DateOverride[]>;
  mode: "property" | "dashboard";
  selectedPropertyId?: number;
  // Kept on the prop signature so existing call sites compile, but the
  // page is now informational — no add/remove/done/skip actions live here.
  onOverrideChanged?: () => void;
  /** Hide the inline header controls (toggle / Copy / Print). Used when
   *  the parent renders its own controls in a sidebar. */
  hideControls?: boolean;
  /** Controlled value for the include-potential toggle. When provided,
   *  the internal state is bypassed. Pair with onIncludePotentialChange. */
  includePotential?: boolean;
  onIncludePotentialChange?: (value: boolean) => void;
  /** RT-25.10 tick 3 — map of propertyId → ordered cleaner assignments
   *  (priority asc; element [0] is the default cleaner, [1] is the first
   *  backup). Used to (a) surface the priority-0 cleaner name on each row,
   *  same as the old cleanerNames prop, and (b) detect cleaner conflicts
   *  when one cleaner is the default for multiple properties on the same
   *  cleaning date. Undefined entry → no cleaner data for that property. */
  cleanerAssignments?: Record<number, CleanerAssignmentInfo[] | undefined>;
  /** RT-25.10 tick 3 — fired with the sorted set of dates that contain a
   *  cleaner conflict (one cleaner is the priority-0 across 2+ properties
   *  whose cleanings fall on the same day). The dashboard uses this to
   *  render a "Cleaner conflict" badge on the Today strip and Next 7
   *  days header. */
  onCleanerConflictDatesChange?: (dates: string[]) => void;
  /** When true, the table area renders skeleton rows instead of the
   *  real list. Lets the parent (PropertyCleaningView /
   *  GlobalCleaningView) show a stable-height table while the
   *  events / links / overrides fetches are still in flight, so
   *  the page doesn't grow as data lands. */
  loading?: boolean;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

function toDateStr(d: Date): string {
  return d.toISOString().substring(0, 10);
}

export function toOperationsDateStr(d: Date): string {
  // Cleaning is coordinated in Bolivia. Using toISOString() here made the
  // schedule roll over at 20:00 local time because UTC was already on the
  // following date, moving tomorrow's work into the "today" group.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function linkedSourceKey(platform: string, uid: string): string {
  return `${platform.trim().toLowerCase()}\u0000${uid.trim()}`;
}

function rangesConnect(startA: string, endA: string, startB: string, endB: string): boolean {
  // Half-open stay ranges connect when they overlap OR abut. Equality is
  // the important source-checkout → Direct-checkin case.
  return startA <= endB && endA >= startB;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && endA > startB;
}

function isGenericBookingName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("reserved") ||
    normalized.includes("closed") ||
    normalized.includes("not available") ||
    normalized.includes("blocked")
  );
}

export function computeCleaningDays(
  property: Property,
  events: CalendarEvent[],
  links: CalendarLink[],
  dateOverrides: DateOverride[] = []
): CleaningDay[] {
  const result: CleaningDay[] = [];
  const allBooked = new Set<string>();
  // Channel buffers describe booking availability, not when housekeeping
  // happens. Operationally every occupied stay is cleaned on its checkout
  // date (and becomes a turnover when another guest arrives that same day).
  // Applying iCal bufferBefore/bufferAfter here shifted real departures to a
  // different day and could hide them when that buffer date was occupied.
  const maxBefore = 0;
  const maxAfter = 0;
  const minStay = property.minNights || 3;

  // Booking window cutoff — ignore events starting beyond this date
  const cutoff = bookingWindowCutoff(property.bookingWindow || 365);

  interface Booking {
    start: string;
    end: string;
    name: string;
    platform: string;
    /** Identity of this synced source event. */
    sourceKey?: string;
    /** Exact synced source referenced by a local claim/extension row. */
    linkedSourceKey?: string;
    linkedRole?: "claim" | "extension";
    reservationId?: number;
    extensionOfId?: number;
  }
  const rawBookings: Booking[] = [];
  const sourceByKey = new Map<string, Booking>();

  for (const ev of events) {
    if (ev.startDate >= cutoff) continue;
    let d = ev.startDate;
    while (d <= ev.endDate) { allBooked.add(d); d = addDaysStr(d, 1); }
    const isAirbnbBlock = ev.platform === "airbnb" && (
      ev.summary.includes("Not available") || ev.summary.includes("Blocked")
    );
    // A channel availability block has no departing guest and therefore no
    // cleaning. Keep its dates in allBooked for gap calculations, but do not
    // let it merge with a physical reservation registered over the block.
    if (isAirbnbBlock) continue;
    const name = ev.summary;
    const sourceKey = ev.uid ? linkedSourceKey(ev.platform, ev.uid) : undefined;
    const booking: Booking = {
      start: ev.startDate,
      end: ev.endDate,
      name,
      platform: ev.platform,
      sourceKey,
    };
    rawBookings.push(booking);
    if (sourceKey) sourceByKey.set(sourceKey, booking);
  }

  for (const res of property.reservations) {
    const start = toReservationDateInput(res.checkIn);
    const end = toReservationDateInput(res.checkOut);
    let d = start;
    while (d <= end) { allBooked.add(d); d = addDaysStr(d, 1); }
    const platform = (res.platform || "airbnb").trim().toLowerCase();
    const linkedUid = res.linkedEventUid?.trim();
    const sourcePlatform = (
      res.linkedEventPlatform || (platform !== "direct" ? platform : "")
    ).trim().toLowerCase();
    let exactLinkedKey = linkedUid && sourcePlatform
      ? linkedSourceKey(sourcePlatform, linkedUid)
      : undefined;
    let linkedRole = res.linkedEventRole || undefined;

    if (exactLinkedKey) {
      const source = sourceByKey.get(exactLinkedKey);
      // Legacy rows have no durable role. Infer only against the exact
      // platform+UID source; UID alone may collide across feeds.
      if (!linkedRole && source) {
        if (rangesOverlap(start, end, source.start, source.end)) linkedRole = "claim";
        else if (end === source.start || start === source.end) linkedRole = "extension";
      }
      if (!source || !linkedRole) exactLinkedKey = undefined;
    } else if (!linkedUid) {
      // Narrow fallback for rows created before explicit linking existed:
      // accept one and only one overlapping source on the same platform.
      const candidates = Array.from(sourceByKey.entries()).filter(([, source]) =>
        source.platform.trim().toLowerCase() === platform &&
        rangesOverlap(start, end, source.start, source.end),
      );
      if (candidates.length === 1) {
        exactLinkedKey = candidates[0][0];
        linkedRole = "claim";
      }
    }

    rawBookings.push({
      start,
      end,
      name: res.name,
      platform,
      linkedSourceKey: exactLinkedKey,
      linkedRole,
      reservationId: res.id,
      extensionOfId: res.extensionOfId || undefined,
    });
  }

  // Collapse each exact linked family into connected components for
  // cleaning purposes only. The Reservation and channel records remain
  // separate everywhere else; this union simply removes the fake turnover
  // at the internal source/Direct boundary.
  const connectedBookings: Booking[] = [];
  const consumed = new Set<Booking>();

  // A manually negotiated extension is a separate financial/channel row,
  // but operationally it is the same guest. Merge each root + its contiguous
  // extensions so cleaning is scheduled only at the family's final checkout.
  const reservationById = new Map(
    rawBookings.filter((booking) => booking.reservationId).map((booking) => [booking.reservationId!, booking]),
  );
  for (const root of reservationById.values()) {
    if (root.extensionOfId) continue;
    const extensions = rawBookings
      .filter((booking) => booking.extensionOfId === root.reservationId)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (extensions.length === 0) continue;
    let start = root.start;
    let end = root.end;
    const members = [root];
    for (const extension of extensions) {
      if (!rangesConnect(start, end, extension.start, extension.end)) continue;
      start = start < extension.start ? start : extension.start;
      end = end > extension.end ? end : extension.end;
      members.push(extension);
    }
    if (members.length === 1) continue;
    for (const member of members) consumed.add(member);
    if (root.linkedSourceKey) {
      const source = sourceByKey.get(root.linkedSourceKey);
      if (source) {
        // The local confirmed reservation family is the physical stay and is
        // authoritative for housekeeping. A claimed Airbnb block can be
        // wider than the entered reservation during migration; consume it to
        // avoid a duplicate cleaning, but never let its bounds postpone the
        // family's real checkout.
        consumed.add(source);
      }
    }
    connectedBookings.push({
      start,
      end,
      name: root.name,
      platform: root.platform,
      reservationId: root.reservationId,
    });
  }
  for (const [sourceKey, source] of sourceByKey) {
    const pending = rawBookings.filter(
      (booking) =>
        !consumed.has(booking) &&
        booking.linkedSourceKey === sourceKey &&
        (booking.linkedRole === "claim" || booking.linkedRole === "extension"),
    );
    if (pending.length === 0) continue;

    let start = source.start;
    let end = source.end;
    let name = source.name;
    let connectedCount = 0;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const member = pending[i];
        if (!rangesConnect(start, end, member.start, member.end)) continue;
        if (member.start < start) start = member.start;
        if (member.end > end) end = member.end;
        if (!isGenericBookingName(member.name)) name = member.name;
        consumed.add(member);
        pending.splice(i, 1);
        connectedCount += 1;
        changed = true;
      }
    }

    if (connectedCount > 0) {
      consumed.add(source);
      const namedMember = rawBookings.find(
        (booking) => consumed.has(booking) && booking.linkedSourceKey === sourceKey && booking.reservationId,
      );
      connectedBookings.push({
        start,
        end,
        name,
        platform: source.platform,
        reservationId: namedMember?.reservationId,
      });
    }
  }

  const allBookings = [
    ...rawBookings.filter((booking) => !consumed.has(booking)),
    ...connectedBookings,
  ];
  allBookings.sort((a, b) => a.start.localeCompare(b.start));
  const deduped: Booking[] = [];
  for (const b of allBookings) {
    const last = deduped[deduped.length - 1];
    if (last && b.start < last.end) {
      if (b.end > last.end) last.end = b.end;
      if (b.name !== "Reserved" && b.name !== "CLOSED - Not available") {
        last.name = b.name;
        if (b.reservationId) last.reservationId = b.reservationId;
      }
    } else {
      deduped.push({ ...b });
    }
  }

  const skipBeforeFor = new Set<number>();
  for (let i = 0; i < deduped.length - 1; i++) {
    const gapStart = addDaysStr(deduped[i].end, 1);
    const gapDays = Math.max(0, Math.ceil(
      (new Date(deduped[i + 1].start + "T12:00:00Z").getTime() - new Date(gapStart + "T12:00:00Z").getTime()) / (1000 * 60 * 60 * 24)
    ));
    if (gapDays < maxAfter + minStay + maxBefore) {
      skipBeforeFor.add(i + 1);
    }
  }

  for (let bi = 0; bi < deduped.length; bi++) {
    const b = deduped[bi];
    const prev = bi > 0 ? deduped[bi - 1] : null;
    const next = bi < deduped.length - 1 ? deduped[bi + 1] : null;
    const displayName = b.name.includes("CLOSED") || b.name.includes("Reserved")
      ? (b.platform === "airbnb" ? "Airbnb" : "Booking") + " guest"
      : b.name;

    // A confirmed guest arriving on the checkout date always creates an
    // operational turnover, even when the channel link still carries a
    // before/after buffer. Previously the full-buffer branch tried to place
    // the cleaning on the following day; because that date was occupied by
    // the incoming stay, the cleaning disappeared from the schedule entirely.
    // Existing adjacent bookings must remain actionable as a same-day change.
    if ((maxBefore > 0 || maxAfter > 0) && next?.start === b.end) {
      const nextDisplayName = next.name.includes("CLOSED") || next.name.includes("Reserved")
        ? (next.platform === "airbnb" ? "Airbnb" : "Booking") + " guest"
        : next.name;
      const parseTime = (time: string) => {
        const [hours, minutes] = (time || "12:00").split(":").map(Number);
        return (hours || 0) * 60 + (minutes || 0);
      };
      const checkOutMin = parseTime(property.checkOutTime || "12:00");
      const checkInMin = parseTime(property.checkInTime || "14:00");
      const diffMinutes = checkInMin - checkOutMin;
      const availableMinutes = diffMinutes > 0 ? diffMinutes : 24 * 60 + diffMinutes;

      result.push({
        date: b.end,
        type: "cleaning",
        property: property.name,
        propertyId: property.id,
        kind: "turnover",
        bufferMode: "quick",
        prevGuest: displayName,
        prevReservationId: b.reservationId,
        prevPlatform: b.platform,
        prevEndDate: b.end,
        nextGuest: nextDisplayName,
        nextReservationId: next.reservationId,
        nextPlatform: next.platform,
        nextStartDate: next.start,
        hoursAvailable: availableMinutes > 0 && availableMinutes < 24 * 60
          ? availableMinutes / 60
          : undefined,
      });
    }

    if (!skipBeforeFor.has(bi)) {
      if (bi === 0 || !prev) {
        for (let i = 1; i <= maxBefore; i++) {
          const d = addDaysStr(b.start, -i);
          if (!allBooked.has(d)) {
            result.push({
              date: d,
              type: "cleaning",
              property: property.name,
              propertyId: property.id,
              kind: "before",
              bufferMode: "full",
              nextGuest: displayName,
              nextReservationId: b.reservationId,
              nextPlatform: b.platform,
              nextStartDate: b.start,
            });
          }
        }
      } else {
        const gapStart = addDaysStr(prev.end, 1);
        let gapHasBooking = false;
        let d = addDaysStr(gapStart, maxAfter);
        while (d < addDaysStr(b.start, -maxBefore)) {
          if (allBooked.has(d)) { gapHasBooking = true; break; }
          d = addDaysStr(d, 1);
        }
        // Bookable gap window for the "if a gap guest landed here" note —
        // exclude buffer days on either side.
        const gapBookableStart = addDaysStr(prev.end, maxAfter + 1);
        const gapBookableEnd = addDaysStr(b.start, -(maxBefore + 1));
        for (let i = 1; i <= maxBefore; i++) {
          const dd = addDaysStr(b.start, -i);
          if (!allBooked.has(dd)) {
            result.push({
              date: dd,
              type: gapHasBooking ? "cleaning" : "potential",
              property: property.name,
              propertyId: property.id,
              kind: gapHasBooking ? "before" : "gap-potential",
              bufferMode: "full",
              nextGuest: displayName,
              nextReservationId: b.reservationId,
              nextPlatform: b.platform,
              nextStartDate: b.start,
              gapStartDate: gapHasBooking ? undefined : gapBookableStart,
              gapEndDate: gapHasBooking ? undefined : gapBookableEnd,
            });
          }
        }
      }
    }

    for (let i = 1; i <= maxAfter; i++) {
      const d = addDaysStr(b.end, i);
      if (!allBooked.has(d)) {
        result.push({
          date: d,
          type: "cleaning",
          property: property.name,
          propertyId: property.id,
          kind: "after",
          bufferMode: "full",
          prevGuest: displayName,
          prevReservationId: b.reservationId,
          prevPlatform: b.platform,
          prevEndDate: b.end,
        });
      }
    }
  }

  // Buffer=0 means cleaning happens on the checkout day itself.
  if (maxBefore === 0 && maxAfter === 0) {
    const parseTime = (t: string) => {
      const [h, m] = (t || "12:00").split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const checkOutMin = parseTime(property.checkOutTime || "12:00");
    const checkInMin = parseTime(property.checkInTime || "14:00");

    for (let bi = 0; bi < deduped.length; bi++) {
      const b = deduped[bi];
      const next = deduped[bi + 1];
      const displayName = b.name.includes("CLOSED") || b.name.includes("Reserved")
        ? (b.platform === "airbnb" ? "Airbnb" : "Booking") + " guest"
        : b.name;

      let hoursAvailable: number | undefined = undefined;
      let kind: CleaningKind = "after";
      let nextGuest: string | undefined = undefined;
      let nextStartDate: string | undefined = undefined;

      if (next) {
        nextGuest = next.name.includes("CLOSED") || next.name.includes("Reserved")
          ? (next.platform === "airbnb" ? "Airbnb" : "Booking") + " guest"
          : next.name;
        nextStartDate = next.start;

        // True turnover only when the next guest checks in on the same
        // calendar day the previous one checked out — otherwise it's an
        // "after" cleaning that just happens to know about a future
        // arrival (no need to call it a turnover or surface a "97 days"
        // chip that confuses readers).
        if (next.start === b.end) {
          kind = "turnover";
          const diffMinutes = checkInMin - checkOutMin;
          const hours = diffMinutes > 0 ? diffMinutes / 60 : 24 + diffMinutes / 60;
          if (hours > 0 && hours < 24) hoursAvailable = hours;
        }
      }

      result.push({
        date: b.end,
        type: "cleaning",
        property: property.name,
        propertyId: property.id,
        kind,
        bufferMode: "quick",
        prevGuest: displayName,
        prevReservationId: b.reservationId,
        prevPlatform: b.platform,
        prevEndDate: b.end,
        nextGuest,
        nextReservationId: next?.reservationId,
        nextPlatform: next?.platform,
        nextStartDate,
        hoursAvailable,
      });

      if (next) {
        const gapStart = addDaysStr(b.end, 1);
        const gapDays = Math.max(0, Math.ceil(
          (new Date(next.start + "T12:00:00Z").getTime() - new Date(gapStart + "T12:00:00Z").getTime()) / (1000 * 60 * 60 * 24)
        ));
        if (gapDays >= minStay) {
          const alreadyHasCleaning = result.some(r => r.date === next.start && r.type === "cleaning");
          if (!alreadyHasCleaning) {
            const nextDisplayName = next.name.includes("CLOSED") || next.name.includes("Reserved")
              ? (next.platform === "airbnb" ? "Airbnb" : "Booking") + " guest"
              : next.name;
            const diffMinutes = checkInMin - checkOutMin;
            const hours = diffMinutes > 0 ? diffMinutes / 60 : 24 + diffMinutes / 60;
            result.push({
              date: next.start,
              type: "potential",
              property: property.name,
              propertyId: property.id,
              kind: "gap-potential",
              bufferMode: "quick",
              nextGuest: nextDisplayName,
              nextReservationId: next.reservationId,
              nextPlatform: next.platform,
              nextStartDate: next.start,
              gapStartDate: gapStart,
              gapEndDate: addDaysStr(next.start, -1),
              hoursAvailable: hours > 0 && hours < 24 ? hours : undefined,
            });
          }
        }
      }
    }
  }

  // Apply date overrides
  const openDates = new Set(dateOverrides.filter(o => o.type === "open").map(o => o.date));
  const closedDates = dateOverrides.filter(o => o.type === "closed");

  const filtered = result.filter(d => !openDates.has(d.date));

  for (const o of closedDates) {
    if (!filtered.some(d => d.date === o.date)) {
      filtered.push({
        date: o.date,
        type: "cleaning",
        property: property.name,
        propertyId: property.id,
        kind: "manual",
        bufferMode: maxBefore === 0 && maxAfter === 0 ? "quick" : "full",
        manualNote: o.note,
        isManual: true,
      });
    }
  }

  return filtered;
}

export const CleaningSchedule = forwardRef<CleaningScheduleHandle, CleaningScheduleProps>(function CleaningScheduleImpl({
  properties,
  syncedEvents,
  links,
  overrides,
  mode,
  selectedPropertyId,
  hideControls = false,
  includePotential: controlledIncludePotential,
  cleanerAssignments,
  onCleanerConflictDatesChange,
  loading = false,
}, ref) {
  const { t, locale } = useI18n();
  const c = COPY[locale];
  // Which copy button last fired — "all" for the full Copy button, or a
  // cleaner's identityKey for a per-cleaner button. Drives the transient
  // "Copied!" label so only the pressed button flips.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showAllFuture, setShowAllFuture] = useState(false);
  const includePotential = controlledIncludePotential ?? false;

  const cleaningDays = useMemo(() => {
    const targetProperties = mode === "property" && selectedPropertyId
      ? properties.filter(p => p.id === selectedPropertyId)
      : properties;

    const allDays: CleaningDay[] = [];
    for (const prop of targetProperties) {
      // RT-25.3 — properties with the cleaning toggle off contribute no rows.
      if (prop.cleaningEnabled === false) continue;
      const propEvents = syncedEvents[prop.id] || [];
      const propLinks = links[prop.id] || [];
      const propOverrides = overrides?.[prop.id] || [];
      const propAssignments = cleanerAssignments?.[prop.id];
      const propDefault = propAssignments && propAssignments.length > 0 ? propAssignments[0] : undefined;
      const days = computeCleaningDays(prop, propEvents, propLinks, propOverrides);
      if (propDefault) {
        // Stamp the priority-0 cleaner onto each row for this property.
        // Pure attach step — keeps computeCleaningDays free of cleaner I/O.
        for (const d of days) {
          d.cleanerName = propDefault.name;
          d.cleanerKey = propDefault.identityKey;
        }
      }
      allDays.push(...days);
    }

    allDays.sort((a, b) => a.date.localeCompare(b.date));
    return allDays;
  }, [properties, syncedEvents, links, overrides, mode, selectedPropertyId, cleanerAssignments]);

  // RT-25.10 tick 3 — cleaner conflicts. Group cleaning rows by
  // (date, priority-0 cleaner identity). When the same cleaner is the
  // default for multiple properties on the same cleaning date, that's
  // a conflict regardless of whether the properties' cleaning days
  // already overlap (they always do here, by construction). For each
  // conflicting property, look at its priority-1 backup and check
  // whether that backup is busy (= is anyone else's priority-0 on the
  // SAME date among the day's cleaning rows). The host decides what
  // to do; we just flag and suggest.
  const cleanerConflicts = useMemo(() => {
    if (!cleanerAssignments) return [] as Array<{
      date: string;
      cleanerName: string;
      cleanerKey: string;
      propertyIds: number[];
      properties: Array<{
        id: number;
        name: string;
        backup: { name: string; busy: boolean } | null;
      }>;
    }>;

    // For each date, the set of identityKeys that are priority-0 for at
    // least one property whose cleaning lands on that date. Used to
    // check whether a proposed backup is busy on the conflict date.
    const busyByDate = new Map<string, Set<string>>();
    for (const day of cleaningDays) {
      if (day.type !== "cleaning") continue;
      if (!day.cleanerKey) continue;
      const set = busyByDate.get(day.date) ?? new Set<string>();
      set.add(day.cleanerKey);
      busyByDate.set(day.date, set);
    }

    type Bucket = { name: string; properties: Map<number, string> };
    // date -> identityKey -> bucket
    const grouped = new Map<string, Map<string, Bucket>>();
    for (const day of cleaningDays) {
      if (day.type !== "cleaning") continue;
      if (!day.cleanerKey || !day.cleanerName) continue;
      const byKey = grouped.get(day.date) ?? new Map<string, Bucket>();
      const bucket = byKey.get(day.cleanerKey) ?? { name: day.cleanerName, properties: new Map<number, string>() };
      bucket.properties.set(day.propertyId, day.property);
      byKey.set(day.cleanerKey, bucket);
      grouped.set(day.date, byKey);
    }

    const out: Array<{
      date: string;
      cleanerName: string;
      cleanerKey: string;
      propertyIds: number[];
      properties: Array<{
        id: number;
        name: string;
        backup: { name: string; busy: boolean } | null;
      }>;
    }> = [];
    for (const [date, byKey] of grouped) {
      for (const [cleanerKey, bucket] of byKey) {
        if (bucket.properties.size < 2) continue;
        const busySet = busyByDate.get(date) ?? new Set<string>();
        const propertyIds: number[] = [];
        const propertiesOut: Array<{ id: number; name: string; backup: { name: string; busy: boolean } | null }> = [];
        for (const [propertyId, propertyName] of bucket.properties) {
          propertyIds.push(propertyId);
          const list = cleanerAssignments[propertyId] ?? [];
          // Priority-1 = first non-default cleaner. If the default
          // happens to not be the priority-0 in `list` (data drift),
          // fall back to the second list entry.
          const backupEntry = list.find((a) => a.identityKey !== cleanerKey && a.priority > (list[0]?.priority ?? 0))
            ?? (list.length > 1 ? list[1] : undefined);
          let backup: { name: string; busy: boolean } | null = null;
          if (backupEntry && backupEntry.identityKey !== cleanerKey) {
            backup = { name: backupEntry.name, busy: busySet.has(backupEntry.identityKey) };
          }
          propertiesOut.push({ id: propertyId, name: propertyName, backup });
        }
        out.push({ date, cleanerName: bucket.name, cleanerKey, propertyIds, properties: propertiesOut });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || a.cleanerName.localeCompare(b.cleanerName));
    return out;
  }, [cleaningDays, cleanerAssignments]);

  const todayStr = toOperationsDateStr(new Date());
  const futureDays = cleaningDays.filter(d => d.date >= todayStr);
  const futureCleanerConflicts = useMemo(
    () => cleanerConflicts.filter((c) => c.date >= todayStr),
    [cleanerConflicts, todayStr]
  );

  // (date, cleanerKey) → backup hint, indexed for fast row-level lookup
  // when rendering the table and building copy/print lines.
  const conflictByDateAndKey = useMemo(() => {
    const map = new Map<string, Map<string, { backupByPropertyId: Map<number, { name: string; busy: boolean } | null> }>>();
    for (const c of futureCleanerConflicts) {
      const byKey = map.get(c.date) ?? new Map<string, { backupByPropertyId: Map<number, { name: string; busy: boolean } | null> }>();
      const backupMap = new Map<number, { name: string; busy: boolean } | null>();
      for (const p of c.properties) backupMap.set(p.id, p.backup);
      byKey.set(c.cleanerKey, { backupByPropertyId: backupMap });
      map.set(c.date, byKey);
    }
    return map;
  }, [futureCleanerConflicts]);

  // Surface conflict dates to the parent (dashboard) so it can decorate
  // the Today strip + Next-7-days header. Effect uses a ref-tracked
  // signature so we don't fire on every render when the dates haven't
  // actually changed.
  const lastConflictDatesRef = useRef<string>("");
  useEffect(() => {
    if (!onCleanerConflictDatesChange) return;
    const dates = Array.from(new Set(futureCleanerConflicts.map((c) => c.date))).sort();
    const signature = dates.join(",");
    if (signature === lastConflictDatesRef.current) return;
    lastConflictDatesRef.current = signature;
    onCleanerConflictDatesChange(dates);
  }, [futureCleanerConflicts, onCleanerConflictDatesChange]);

  // Days that the user-facing list / copy / print actually show — gated
  // by the "Include potential" toggle.
  const visibleDays = useMemo(
    () => (includePotential ? futureDays : futureDays.filter(d => d.type !== "potential")),
    [futureDays, includePotential]
  );
  const tomorrowStr = addDaysStr(todayStr, 1);
  const displayedDays = useMemo(
    () => showAllFuture
      ? visibleDays
      : visibleDays.filter((day) => day.date === todayStr || day.date === tomorrowStr),
    [showAllFuture, visibleDays, todayStr, tomorrowStr],
  );
  const [inspectedReservationId, setInspectedReservationId] = useState<number | null>(null);
  const inspectedReservation = useMemo(() => {
    if (!inspectedReservationId) return null;
    for (const property of properties) {
      const reservation = property.reservations.find((item) => item.id === inspectedReservationId);
      if (reservation) return { property, reservation };
    }
    return null;
  }, [inspectedReservationId, properties]);

  const groupedVisibleDays = useMemo(() => {
    const groups = new Map<string, CleaningDay[]>();
    for (const day of displayedDays) {
      const rows = groups.get(day.date) ?? [];
      rows.push(day);
      groups.set(day.date, rows);
    }
    return Array.from(groups.entries());
  }, [displayedDays]);

  const formatDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    const currentYear = new Date().getFullYear();
    const dateYear = date.getFullYear();
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short" };
    if (dateYear !== currentYear) opts.year = "numeric";
    return date.toLocaleDateString(c.dateLocale, opts);
  };

  const formatGroupTitle = (date: string) => {
    if (date === todayStr) return c.todayGroup;
    if (date === tomorrowStr) return c.tomorrowGroup;
    return c.datedGroup(formatShortDate(date));
  };

  // Compact "May 14" / "14 May" for inline date references inside notes.
  const formatShortDate = (d: string) => {
    const date = new Date(d + "T12:00:00");
    const currentYear = new Date().getFullYear();
    const dateYear = date.getFullYear();
    const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
    if (dateYear !== currentYear) opts.year = "numeric";
    return date.toLocaleDateString(c.dateLocale, opts);
  };

  const formatHours = (h: number): string => {
    if (h < 24) {
      const rounded = h < 10 ? h.toFixed(1) : Math.round(h).toString();
      return t("cleaning.hoursShort", { h: rounded });
    }
    const days = Math.round(h / 24);
    return t("cleaning.daysShort", { d: days });
  };

  // Build the line-per-day plain-text schedule that copy AND print share.
  // For single-property mode the property name lands in the header so a
  // pasted Telegram / email message identifies the place at a glance.
  // For dashboard mode the [Property] tag on each row already carries
  // that information.
  // Cleaner-facing export. Stays plain-text + emoji-free because it is
  // meant for forwarding to the cleaner via Telegram / WhatsApp / SMS,
  // where a clean header + a one-line-per-day schedule reads better
  // than chip-style annotations. Notes / reason text are deliberately
  // dropped — the cleaner only needs WHEN, WHERE, and how (quick vs
  // full day, with a precise arrival time on quick turnovers).
  // Pass a cleanerKey to scope the export to one cleaner's rows and drop
  // the cleaner-name suffix (redundant once the list is for that one
  // person) — used by the per-cleaner copy buttons. No key = the full
  // schedule with names, as the plain Copy button produces.
  const buildScheduleLines = (cleanerKey?: string, dateFilter?: string): string[] => {
    const targetProperties = mode === "property" && selectedPropertyId
      ? properties.filter(p => p.id === selectedPropertyId)
      : properties;
    const singlePropertyName = mode === "property" && targetProperties.length === 1
      ? targetProperties[0].name
      : null;
    const headerSuffix = singlePropertyName ? ` — ${singlePropertyName}` : "";
    const propertyById = new Map(properties.map((p) => [p.id, p]));

    const arriveByLabel = c.arriveByLabel;
    const fullDayLabel = c.fullDayLabel;
    const manualLabel = c.manualLabel;
    const potentialPrefix = c.potentialPrefix;

    const lines: string[] = [];
    const numericDate = dateFilter ? `${dateFilter.slice(8, 10)}/${dateFilter.slice(5, 7)}` : "";
    lines.push(dateFilter ? `Calendario de limpiezas ${numericDate}` : c.scheduleHeader + headerSuffix);
    lines.push("");
    for (const day of visibleDays) {
      if (cleanerKey && day.cleanerKey !== cleanerKey) continue;
      if (dateFilter && day.date !== dateFilter) continue;
      if (dateFilter) {
        const guestWithChannel = (name?: string, platform?: string) => {
          const guest = guestName(name);
          return platform ? `${guest} (${platformLabel(platform)})` : guest;
        };
        let movement: string;
        if (day.kind === "manual") movement = day.manualNote?.trim() || "Limpieza manual";
        else if (day.kind === "turnover") movement = `Cambio de huésped: ${guestWithChannel(day.prevGuest, day.prevPlatform)} → ${guestWithChannel(day.nextGuest, day.nextPlatform)}`;
        else if (day.kind === "before" || day.kind === "gap-potential") movement = `Ingreso de ${guestWithChannel(day.nextGuest, day.nextPlatform)}`;
        else movement = `Salida normal: ${guestWithChannel(day.prevGuest, day.prevPlatform)} · sin huésped posterior`;
        lines.push(`${day.property} — ${movement}`);
        continue;
      }
      const dateStr = formatDate(day.date);
      const propLabel = mode === "dashboard" ? ` — ${day.property}` : "";
      const prop = propertyById.get(day.propertyId);
      // Quick turnover = same-day cleaning between guests; the cleaner
      // can only start once the previous guest has checked out, so the
      // arrival time IS the property's checkOutTime.
      let detail: string;
      if (day.kind === "manual") {
        detail = manualLabel;
      } else if (day.bufferMode === "quick") {
        detail = arriveByLabel(prop?.checkOutTime || "12:00");
      } else {
        detail = fullDayLabel;
      }
      const prefix = day.type === "potential" ? potentialPrefix : "";
      // Just the name, no "cleaner:" / "уборщик:" prefix — the
      // recipient already knows the row is theirs because it sits
      // in the cleaning schedule, and the prefix reads as cold
      // when forwarded over messengers.
      const cleanerLabel = (!cleanerKey && day.cleanerName) ? ` — ${day.cleanerName}` : "";
      // RT-25.10 tick 3 — cleaner-conflict suffix. Mirrors the in-app
      // warning so a pasted/printed schedule still surfaces the clash.
      const conflictForCleaner = day.cleanerKey ? conflictByDateAndKey.get(day.date)?.get(day.cleanerKey) : undefined;
      const isConflict = Boolean(conflictForCleaner);
      const conflictSuffix = (() => {
        if (!conflictForCleaner) return "";
        const backup = conflictForCleaner.backupByPropertyId.get(day.propertyId) ?? null;
        if (!backup) return c.conflictNoBackup;
        if (backup.busy) return c.conflictBackupBusy(backup.name);
        return c.conflictBackupSet(backup.name);
      })();
      const conflictPrefix = isConflict ? "⚠ " : "";
      lines.push(`${conflictPrefix}${dateStr}${propLabel} — ${prefix}${detail}${cleanerLabel}${conflictSuffix}`);
    }
    return lines;
  };

  const handleCopySchedule = () => {
    navigator.clipboard.writeText(buildScheduleLines().join("\n"));
    setCopiedKey("all");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Copy one cleaner's rows only, with their name stripped — a list
  // ready to forward straight to that cleaner.
  const handleCopyForCleaner = (cleanerKey: string) => {
    navigator.clipboard.writeText(buildScheduleLines(cleanerKey).join("\n"));
    setCopiedKey(cleanerKey);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handlePrintSchedule = () => {
    const lines = buildScheduleLines();
    // Render in a separate window so the rest of the dashboard chrome
    // doesn't pollute the printout. Same plain-text format the copy
    // produces; just wrapped in a <pre> so the printer respects line
    // breaks.
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const escapeHtml = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
      );
    const titleText = t("cleaning.title");
    w.document.write(`<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titleText)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 12px; color: #111; margin: 24px; }
  pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: 12px; line-height: 1.55; margin: 0; }
  @media print { body { margin: 12mm; } }
</style>
</head>
<body>
<pre>${escapeHtml(lines.join("\n"))}</pre>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 100); };</script>
</body>
</html>`);
    w.document.close();
  };

  // Expose copy / print so a sidebar in PropertyCleaningView can drive
  // them while the underlying state and computations stay local.
  useImperativeHandle(ref, () => ({
    copy: handleCopySchedule,
    print: handlePrintSchedule,
  }));

  // Distinct cleaners across the currently-visible rows — one copy
  // button each. [identityKey, name] pairs, first-seen order.
  const scheduleCleaners: Array<[string, string]> = (() => {
    const seen = new Map<string, string>();
    for (const d of visibleDays) {
      if (d.cleanerKey && d.cleanerName && !seen.has(d.cleanerKey)) {
        seen.set(d.cleanerKey, d.cleanerName);
      }
    }
    return [...seen.entries()];
  })();

  const guestName = (name?: string) => {
    const cleaned = (name || "—").replace(/\s+block$/i, "");
    const genericAirbnbGuest: Record<Locale, string> = { en: "Airbnb guest", es: "Huésped de Airbnb", ru: "Гость Airbnb", de: "Airbnb-Gast", fr: "Voyageur Airbnb" };
    return /^airbnb guest$/i.test(cleaned) ? genericAirbnbGuest[locale] : cleaned;
  };
  const renderGuest = (name?: string, reservationId?: number, platform?: string) => {
    const label = guestName(name);
    const channelClass = ({
      airbnb: "bg-[#ff385c]/15 text-[#ff5a78] hover:bg-[#ff385c]/25",
      booking: "bg-[#1769aa]/15 text-[#52a9ee] hover:bg-[#1769aa]/25",
      direct: "bg-[#159a73]/15 text-[#2bc79b] hover:bg-[#159a73]/25",
      vrbo: "bg-[#5b4bc4]/20 text-[#9a8cff] hover:bg-[#5b4bc4]/30",
    } as Record<string, string>)[(platform || "").toLowerCase()] || "bg-[var(--m-accent)]/10 text-[var(--m-accent)] hover:bg-[var(--m-accent)]/20";
    if (!reservationId) return <span className={`rounded-md px-1.5 py-0.5 font-semibold ${channelClass}`}>{label}</span>;
    return (
      <button
        type="button"
        onClick={() => setInspectedReservationId(reservationId)}
        className={`rounded-md px-1.5 py-0.5 font-semibold underline decoration-dotted underline-offset-2 transition-colors ${channelClass}`}
        aria-label={c.viewReservation(label)}
      >
        {label}
      </button>
    );
  };

  const handleCopyDate = (date: string, key: "today" | "tomorrow") => {
    navigator.clipboard.writeText(buildScheduleLines(undefined, date).join("\n"));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const renderMovement = (day: CleaningDay) => {
    if (day.isManual) return <span>{day.manualNote?.trim() || t("cleaning.manualCleaning")}</span>;
    if (day.kind === "turnover") {
      return (
        <span className="flex flex-wrap items-center gap-1">
          <span>{c.guestChange}</span>
          {renderGuest(day.prevGuest, day.prevReservationId, day.prevPlatform)}
          <span aria-hidden="true">→</span>
          {renderGuest(day.nextGuest, day.nextReservationId, day.nextPlatform)}
          <span className="text-[var(--ink-4)]">{c.sameDay}</span>
        </span>
      );
    }
    if (day.kind === "before" || day.kind === "gap-potential") {
      return <span className="flex flex-wrap items-center gap-1"><span>{c.enters}</span>{renderGuest(day.nextGuest, day.nextReservationId, day.nextPlatform)}</span>;
    }
    return <span className="flex flex-wrap items-center gap-1"><span>{c.leaves}</span>{renderGuest(day.prevGuest, day.prevReservationId, day.prevPlatform)}</span>;
  };

  const platformLabel = (platform: string) => ({
    direct: "Directo",
    airbnb: "Airbnb",
    booking: "Booking",
    vrbo: "Vrbo",
  }[platform.toLowerCase()] || platform);

  return (
    <div className="space-y-4">
      {/* Cleaner conflicts (RT-25.10 tick 3) — same cleaner is the
          priority-0 across two or more properties on the same cleaning
          date. Hint at backups but do not auto-reassign. Also gated
          on !loading so a phantom conflict on partial data doesn't
          flash before the rest of the events / assignments fetch in. */}
      {!loading && futureCleanerConflicts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm font-semibold text-amber-300">
              {t("cleaning.cleanerConflict")} ({futureCleanerConflicts.length} {c.daysCount(futureCleanerConflicts.length)})
            </span>
          </div>
          <p className="text-xs text-amber-300/80">
            {t("cleaning.cleanerConflictDesc")}
          </p>
          {futureCleanerConflicts.map((c) => (
            <div key={`${c.date}-${c.cleanerKey}`} className="text-xs space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-[var(--ink)]">{formatDate(c.date)}</span>
                <span className="text-[var(--ink-3)]">
                  {t("cleaning.cleanerConflictLine", {
                    name: c.cleanerName,
                    count: String(c.properties.length),
                    properties: c.properties.map((p) => p.name).join(" + "),
                  })}
                </span>
              </div>
              {c.properties.map((p) => (
                <div key={`hint-${c.date}-${c.cleanerKey}-${p.id}`} className="pl-4 text-[11px] text-[var(--ink-3)]">
                  {(() => {
                    if (!p.backup) return t("cleaning.backupNone", { property: p.name });
                    if (p.backup.busy) return t("cleaning.backupBusy", { property: p.name, name: p.backup.name });
                    return t("cleaning.backupSet", { property: p.name, name: p.backup.name });
                  })()}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Schedule table */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
          <h2 className="text-sm font-medium text-[var(--ink-3)]">{t("cleaning.title")}</h2>
          {/* Inline header controls — Copy + Print only. The
              include-potential toggle lives in the parent's sidebar
              (PropertyCleaningView / GlobalCleaningView) where view
              options are grouped together; rendering it here as well
              would duplicate the same boolean. `hideControls` still
              hides everything (kept for the dashboard's hidden
              CleaningSchedule mount that just needs the conflict
              feed). */}
          {!hideControls && (
            <div className="flex flex-wrap items-center gap-2">
              {/* "+ Schedule cleaning" — only meaningful in per-
                  property mode. Routes to that property's calendar
                  where the date popover handles the "Schedule
                  cleaning" action; same pattern as the dashboard's
                  per-property "+ Reservation" CTA. Hidden in
                  dashboard / multi-property mode where there's no
                  unambiguous calendar to land on. */}
              {(
                <>
                  <button
                    onClick={() => handleCopyDate(todayStr, "today")}
                    disabled={!visibleDays.some((day) => day.date === todayStr)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--line-2)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--line-2)]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    {copiedKey === "today" ? t("common.copied") : c.copyToday}
                  </button>
                  <button
                    onClick={() => handleCopyDate(tomorrowStr, "tomorrow")}
                    disabled={!visibleDays.some((day) => day.date === tomorrowStr)}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--line-2)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--line-2)]"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                    </svg>
                    {copiedKey === "tomorrow" ? t("common.copied") : c.copyTomorrow}
                  </button>
                  {false && scheduleCleaners.map(([key, name]) => (
                    <button
                      key={key}
                      onClick={() => handleCopyForCleaner(key)}
                      title={t("cleaning.copySchedule")}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--line-2)] px-2.5 py-1.5 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--line-2)]"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                      </svg>
                      <span className="max-w-[9rem] truncate">
                        {copiedKey === key ? t("common.copied") : `🧹 ${name}`}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {loading ? (
          /* Skeleton rows during the events / links / overrides fetch
              — five placeholder rows match the ~typical height of a
              real schedule (5 cleanings in the upcoming window) so
              the table doesn't grow under the user as data lands. */
          <div className="divide-y divide-[var(--line)]/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="h-3 w-24 rounded bg-[var(--line-2)]/60 animate-pulse" />
                <div className="h-3 w-16 rounded bg-[var(--line-2)]/40 animate-pulse" />
                <div className="h-3 flex-1 max-w-[280px] rounded bg-[var(--line-2)]/30 animate-pulse" />
              </div>
            ))}
          </div>
        ) : visibleDays.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              title={t("empty.cleaning.title")}
              description={t("empty.cleaning.desc")}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {groupedVisibleDays.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--line-2)] bg-[var(--bg-2)] px-4 py-8 text-center text-sm text-[var(--ink-3)]">
                {c.noCleanings}
              </div>
            )}
            {groupedVisibleDays.map(([date, days]) => (
              <section key={date} aria-labelledby={`cleaning-${date}`} className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-2)] shadow-sm">
                <div className="flex items-center justify-between border-b-2 border-[var(--m-accent)]/35 bg-[var(--bg-3)] px-4 py-3">
                  <h3 id={`cleaning-${date}`} className="text-base font-bold text-[var(--ink)]">
                    {formatGroupTitle(date)}
                  </h3>
                  <span className="rounded-full bg-[var(--m-accent)]/12 px-2.5 py-1 text-xs font-bold text-[var(--m-accent)]">
                    {days.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--line)]/50">
                  {days.map((day, index) => {
                    const isCleanerConflict = Boolean(
                      day.cleanerKey && conflictByDateAndKey.get(day.date)?.has(day.cleanerKey)
                    );
                    return (
                      <div
                        key={`${day.date}-${day.propertyId}-${index}`}
                        className={`grid gap-2 px-4 py-3 sm:grid-cols-[minmax(150px,0.8fr)_minmax(280px,2fr)_auto] sm:items-center ${
                          day.hoursAvailable !== undefined
                            ? "border-l-4 border-l-amber-400 bg-amber-400/[0.06]"
                            : isCleanerConflict
                              ? "bg-amber-500/[0.04]"
                              : "hover:bg-[var(--bg-3)]/70"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-[var(--ink)]">{day.property}</div>
                          {day.cleanerName && (
                            <div className="mt-0.5 text-[11px] text-[var(--ink-4)]">🧹 {day.cleanerName}</div>
                          )}
                        </div>
                        <div className="min-w-0 text-xs text-[var(--ink-2)]">
                          {renderMovement(day)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                          {day.type === "potential" && (
                            <span className="rounded-full bg-[var(--ink)]/8 px-2 py-1 text-[10px] font-semibold text-[var(--ink-3)]">
                              {c.potential}
                            </span>
                          )}
                          {day.hoursAvailable !== undefined && (
                            <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-bold text-amber-500">
                              {c.priority} · {formatHours(day.hoursAvailable)}
                            </span>
                          )}
                          {isCleanerConflict && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-500">
                              ⚠ {t("cleaning.cleanerConflictShort")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {!loading && visibleDays.some((day) => day.date > tomorrowStr) && (
          <div className="mt-4 flex justify-center">
            <button type="button" onClick={() => setShowAllFuture((value) => !value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg-3)]">
              {showAllFuture ? c.showOnlyNear : c.showAll(visibleDays.length)}
            </button>
          </div>
        )}
      </div>

      {inspectedReservation && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInspectedReservationId(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="cleaning-reservation-title" className="w-full max-w-lg rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cleaning-reservation-title" className="text-lg font-semibold text-[var(--ink)]">{inspectedReservation.reservation.name}</h2>
                <p className="mt-0.5 text-xs text-[var(--ink-4)]">{inspectedReservation.property.name}</p>
              </div>
              <button type="button" onClick={() => setInspectedReservationId(null)} className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-[var(--bg-3)]" aria-label="Cerrar">✕</button>
            </div>
            <div className={`mt-4 rounded-xl border p-3 ${inspectedReservation.reservation.guaranteeAmount ? "border-amber-400/40 bg-amber-400/10" : "border-[var(--line)] bg-[var(--bg-2)]"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-4)]">Garantía a retornar</div>
              <div className={`mt-1 text-lg font-bold ${inspectedReservation.reservation.guaranteeAmount ? "text-amber-400" : "text-[var(--ink-3)]"}`}>
                {inspectedReservation.reservation.guaranteeAmount
                  ? `${inspectedReservation.reservation.guaranteeCurrency === "USD" ? "USD" : "Bs"} ${inspectedReservation.reservation.guaranteeAmount}`
                  : "Sin garantía registrada"}
              </div>
              {inspectedReservation.reservation.guaranteeAmount ? <p className="mt-1 text-xs text-[var(--ink-3)]">Verificar el departamento antes de realizar la devolución.</p> : null}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-xs text-[var(--ink-4)]">Canal</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{platformLabel(inspectedReservation.reservation.platform)}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Estadía</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{formatShortDate(toReservationDateInput(inspectedReservation.reservation.checkIn))} → {formatShortDate(toReservationDateInput(inspectedReservation.reservation.checkOut))}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Horario de salida</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{inspectedReservation.property.checkOutTime || "11:00"}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Estado de cobro</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{inspectedReservation.reservation.settledManuallyAt ? "Saldado manualmente" : "Ver detalle financiero"}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Total hospedaje</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{inspectedReservation.reservation.totalPrice != null ? `${inspectedReservation.reservation.priceCurrency === "USD" ? "USD" : "Bs"} ${inspectedReservation.reservation.totalPrice}` : "Sin monto"}</dd></div>
              <div><dt className="text-xs text-[var(--ink-4)]">Parqueo</dt><dd className="mt-1 font-semibold text-[var(--ink)]">{inspectedReservation.reservation.hasParking ? `Sí${inspectedReservation.reservation.parkingTotalPrice ? ` · ${inspectedReservation.reservation.parkingCurrency === "USD" ? "USD" : "Bs"} ${inspectedReservation.reservation.parkingTotalPrice}` : ""}` : "No"}</dd></div>
              {inspectedReservation.reservation.note && (
                <div className="col-span-2"><dt className="text-xs text-[var(--ink-4)]">Nota</dt><dd className="mt-1 whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-3 font-medium text-[var(--ink)]">{inspectedReservation.reservation.note}</dd></div>
              )}
            </dl>
            <div className="mt-5 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
              <button type="button" onClick={() => setInspectedReservationId(null)} className="rounded-lg border border-[var(--line-2)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--bg-3)]">Cerrar</button>
              <a href={`/dashboard?property=${inspectedReservation.property.id}&reservation=${inspectedReservation.reservation.id}`} className="rounded-lg bg-[var(--brand-orange)] px-3 py-2 text-sm font-semibold text-white">Ver detalle de la reserva</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
