import { prisma } from "@/lib/prisma";
import { generateICal, type ICalEvent } from "@/lib/ical";

export { parseFeedFilename } from "@/lib/feed-utils";

/** Actual inventory channel for feed routing. The migration rewrites durable
 *  extension rows to platform=direct; checking the explicit role as well keeps
 *  an in-flight/legacy row safe if it is read before that backfill completes. */
function reservationChannel(reservation: {
  platform: string | null;
  linkedEventRole?: string | null;
}): string {
  if (reservation.linkedEventRole === "extension") return "direct";
  return reservation.platform || "airbnb";
}

/**
 * Empty-but-RFC-valid iCal — served at the onboarding-draft slug before
 * the user signs up so anything they paste into Airbnb / Booking still
 * returns a 200 with valid calendar content. generateICal already emits
 * a single past-dated placeholder VEVENT when given an empty events array
 * (some platforms reject 0-event feeds), so this is just a wrapper.
 */
export function generateEmptyFeed(calendarName: string = "DeptosBO placeholder"): string {
  return generateICal([], calendarName);
}

/**
 * Generate an iCal feed for a property+platform.
 * Single source of truth — used by all feed routes.
 */
export async function generateFeed(propertyId: number, forPlatform: string): Promise<{ ical: string } | { error: string; status: number }> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { name: true },
  });

  if (!property) {
    return { error: "Property not found", status: 404 };
  }

  const allReservations = await prisma.reservation.findMany({
    where: { propertyId, status: "confirmed", checkOut: { gte: new Date() } },
    orderBy: { checkIn: "asc" },
  });

  // Outbound feeds are intentionally one-way. Synced CalendarEvent rows are
  // observations imported from Airbnb/Booking/Vrbo and must never be echoed
  // back to a channel. Date overrides and cleaning buffers are internal too.
  // Only confirmed local reservations from another channel block inventory.
  const outboundEvents: ICalEvent[] = allReservations
    .filter((reservation) => reservationChannel(reservation) !== forPlatform)
    .map((reservation) => ({
      uid: `deptosbo-reservation-${reservation.id}`,
      summary: `DeptosBO reservation (${reservationChannel(reservation)})`,
      startDate: new Date(reservation.checkIn).toISOString().substring(0, 10),
      endDate: new Date(reservation.checkOut).toISOString().substring(0, 10),
    }));

  const seen = new Set<string>();
  const finalEvents = outboundEvents.filter((event) => {
    const key = `${event.startDate}-${event.endDate}-${event.uid}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ical = generateICal(finalEvents, `DeptosBO - Reservations for ${forPlatform}`);
  return { ical };
}
