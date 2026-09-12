import { MessagingValidationError } from "@/lib/messaging";
import {
  parseReservationDate,
  reservationNights,
  toReservationDateInput,
} from "@/lib/reservation-dates";
import { isAvailabilityBlockSummary } from "@/lib/calendar-event-kind";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_STAY_NIGHTS = 365;
export const CALENDAR_FRESHNESS_MINUTES = 120;

export type AvailabilityQuery = {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number | null;
  propertyId: number | null;
};

export type AvailabilityReason =
  | "property_paused"
  | "outside_booking_window"
  | "minimum_stay"
  | "confirmed_reservation"
  | "calendar_booking"
  | "calendar_block"
  | "manual_block"
  | "cleaning_buffer";

export type CalendarStatus =
  | "current"
  | "stale"
  | "sync_error"
  | "never_synced"
  | "not_connected";

type AvailabilityProperty = {
  id: number;
  name: string;
  minNights: number;
  checkInTime: string;
  checkOutTime: string;
  bookingWindow: number;
  cleaningEnabled: boolean;
  isPaused: boolean;
  reservations: Array<{ checkIn: Date | string; checkOut: Date | string }>;
  calendarEvents: Array<{
    startDate: string;
    endDate: string;
    summary: string;
  }>;
  calendarLinks: Array<{
    bufferBefore: number;
    bufferAfter: number;
    lastFetchedAt: Date | string | null;
    lastError: string | null;
  }>;
  dateOverrides: Array<{ date: string; type: string }>;
};

export type PropertyAvailability = {
  propertyId: number;
  propertyName: string;
  dateStatus: "available" | "unavailable";
  reasons: AvailabilityReason[];
  calendarStatus: CalendarStatus;
  calendarCheckedAt: string | null;
  requiresHumanReview: boolean;
  minNights: number;
  checkInTime: string;
  checkOutTime: string;
  capacityVerified: false;
};

function positiveOptionalInteger(
  value: string | null,
  field: string,
): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return parsed;
}

export function boliviaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDateDays(date: string, days: number): string {
  const parsed = parseReservationDate(date);
  if (!parsed) throw new MessagingValidationError("Invalid date");
  return new Date(parsed.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function parseAvailabilityQuery(
  params: URLSearchParams,
  now: Date = new Date(),
): AvailabilityQuery {
  const checkInRaw = params.get("checkIn") ?? "";
  const checkOutRaw = params.get("checkOut") ?? "";
  const checkInDate = parseReservationDate(checkInRaw);
  const checkOutDate = parseReservationDate(checkOutRaw);
  if (!checkInDate) throw new MessagingValidationError("checkIn is invalid");
  if (!checkOutDate) throw new MessagingValidationError("checkOut is invalid");

  const checkIn = checkInDate.toISOString().slice(0, 10);
  const checkOut = checkOutDate.toISOString().slice(0, 10);
  const nights = reservationNights(checkIn, checkOut);
  if (nights < 1) {
    throw new MessagingValidationError("checkOut must be after checkIn");
  }
  if (nights > MAX_STAY_NIGHTS) {
    throw new MessagingValidationError(`Stay cannot exceed ${MAX_STAY_NIGHTS} nights`);
  }
  if (checkIn < boliviaDateString(now)) {
    throw new MessagingValidationError("checkIn cannot be in the past");
  }

  return {
    checkIn,
    checkOut,
    nights,
    guests: positiveOptionalInteger(params.get("guests"), "guests"),
    propertyId: positiveOptionalInteger(params.get("propertyId"), "propertyId"),
  };
}

function rangeOverlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && endA > startB;
}

function storedDateKey(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : toReservationDateInput(value);
}

function calendarFreshness(
  links: AvailabilityProperty["calendarLinks"],
  now: Date,
): { status: CalendarStatus; checkedAt: string | null } {
  if (links.length === 0) return { status: "not_connected", checkedAt: null };
  if (links.some((link) => Boolean(link.lastError))) {
    return { status: "sync_error", checkedAt: oldestSyncDate(links) };
  }
  if (links.some((link) => !link.lastFetchedAt)) {
    return { status: "never_synced", checkedAt: oldestSyncDate(links) };
  }
  const oldest = Math.min(
    ...links.map((link) => new Date(link.lastFetchedAt!).getTime()),
  );
  const ageMinutes = Math.max(0, (now.getTime() - oldest) / 60_000);
  return {
    status: ageMinutes > CALENDAR_FRESHNESS_MINUTES ? "stale" : "current",
    checkedAt: new Date(oldest).toISOString(),
  };
}

function oldestSyncDate(
  links: AvailabilityProperty["calendarLinks"],
): string | null {
  const dates = links
    .flatMap((link) => (link.lastFetchedAt ? [new Date(link.lastFetchedAt).getTime()] : []))
    .filter(Number.isFinite);
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

function requestedNights(query: AvailabilityQuery): string[] {
  const dates: string[] = [];
  for (let index = 0; index < query.nights; index += 1) {
    dates.push(addDateDays(query.checkIn, index));
  }
  return dates;
}

export function evaluatePropertyAvailability(
  property: AvailabilityProperty,
  query: AvailabilityQuery,
  now: Date = new Date(),
): PropertyAvailability {
  const reasons = new Set<AvailabilityReason>();
  const requestDates = requestedNights(query);
  const openDates = new Set(
    property.dateOverrides
      .filter((override) => override.type === "open")
      .map((override) => override.date),
  );
  const manuallyBlocked = new Set(
    property.dateOverrides
      .filter((override) => override.type === "closed" || override.type === "cleaning")
      .map((override) => override.date),
  );

  if (property.isPaused) reasons.add("property_paused");
  if (query.nights < property.minNights) reasons.add("minimum_stay");
  const bookingCutoff = addDateDays(
    boliviaDateString(now),
    property.bookingWindow,
  );
  if (query.checkIn >= bookingCutoff || query.checkOut > bookingCutoff) {
    reasons.add("outside_booking_window");
  }
  if (requestDates.some((date) => manuallyBlocked.has(date))) {
    reasons.add("manual_block");
  }

  for (const reservation of property.reservations) {
    const start = storedDateKey(reservation.checkIn);
    const end = storedDateKey(reservation.checkOut);
    if (rangeOverlaps(query.checkIn, query.checkOut, start, end)) {
      reasons.add("confirmed_reservation");
    }
  }

  for (const event of property.calendarEvents) {
    if (!rangeOverlaps(query.checkIn, query.checkOut, event.startDate, event.endDate)) {
      continue;
    }
    reasons.add(
      isAvailabilityBlockSummary(event.summary)
        ? "calendar_block"
        : "calendar_booking",
    );
  }

  if (property.cleaningEnabled) {
    const bufferDates = new Set<string>();
    const maxBefore = Math.max(
      0,
      ...property.calendarLinks.map((link) => link.bufferBefore),
    );
    const maxAfter = Math.max(
      0,
      ...property.calendarLinks.map((link) => link.bufferAfter),
    );
    const bufferSources = [
      ...property.reservations.map((reservation) => ({
        start: storedDateKey(reservation.checkIn),
        end: storedDateKey(reservation.checkOut),
      })),
      ...property.calendarEvents
        .filter((event) => !isAvailabilityBlockSummary(event.summary))
        .map((event) => ({ start: event.startDate, end: event.endDate })),
    ];
    // Match the master calendar's `allBooked` guard. Reservation/event end
    // dates are checkout boundaries: their night is available, but the date
    // still suppresses a stale buffer emitted by an earlier adjacent stay.
    // Without this guard, a chain such as 10→11 followed by 11→12 leaves
    // 12 incorrectly blocked by the first stay's buffer even though the most
    // recent guest checks out on 12 and the master calendar offers that night.
    const isStayOrCheckoutBoundary = (date: string) =>
      bufferSources.some((source) => date >= source.start && date <= source.end);
    for (const source of bufferSources) {
      for (let offset = 1; offset <= maxBefore; offset += 1) {
        const date = addDateDays(source.start, -offset);
        if (!isStayOrCheckoutBoundary(date)) bufferDates.add(date);
      }
      for (let offset = 1; offset <= maxAfter; offset += 1) {
        const date = addDateDays(source.end, offset);
        if (!isStayOrCheckoutBoundary(date)) bufferDates.add(date);
      }
    }
    for (const date of openDates) bufferDates.delete(date);
    if (requestDates.some((date) => bufferDates.has(date))) {
      reasons.add("cleaning_buffer");
    }
  }

  const freshness = calendarFreshness(property.calendarLinks, now);
  return {
    propertyId: property.id,
    propertyName: property.name,
    dateStatus: reasons.size === 0 ? "available" : "unavailable",
    reasons: [...reasons],
    calendarStatus: freshness.status,
    calendarCheckedAt: freshness.checkedAt,
    requiresHumanReview:
      reasons.size === 0 &&
      (freshness.status !== "current" || query.guests !== null),
    minNights: property.minNights,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
    capacityVerified: false,
  };
}
