import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDateDays, evaluatePropertyAvailability, parseAvailabilityQuery } from "@/lib/messaging-availability";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";

export function rentHomeOwner() {
  const id = Number(process.env.RENTHOME_OWNER_ID);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function readListing(listing: { detailsJson: string; photosJson: string }) {
  const details = JSON.parse(listing.detailsJson) as Omit<RentHomeDetails, "city" | "locationNotes"> & Partial<Pick<RentHomeDetails, "city" | "locationNotes">>;
  return { details: { city: "", locationNotes: "", ...details }, photos: JSON.parse(listing.photosJson) as string[] };
}

export function rentHomeDates(input: { checkIn?: unknown; checkOut?: unknown; guests?: unknown }) {
  const checkIn = typeof input.checkIn === "string" ? input.checkIn : "";
  const checkOut = typeof input.checkOut === "string" ? input.checkOut : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) throw new Error("Selecciona fechas válidas.");
  const guests = String(input.guests ?? "");
  if (!/^\d{1,2}$/.test(guests) || Number(guests) < 1 || Number(guests) > 50) throw new Error("Indica una cantidad de huéspedes válida.");
  let query;
  try { query = parseAvailabilityQuery(new URLSearchParams({ checkIn, checkOut, guests })); }
  catch { throw new Error("Selecciona una estadía válida a partir de hoy."); }
  if (query.nights < 2) throw new Error("La reserva mínima es de dos noches.");
  return query;
}

export async function rentHomeAvailability(db: Prisma.TransactionClient, propertyId: number, query: ReturnType<typeof rentHomeDates>) {
  const owner = rentHomeOwner();
  if (!owner) return false;
  const property = await db.property.findFirst({
    where: { id: propertyId, userId: owner },
    select: {
      id: true, name: true, minNights: true, bookingWindow: true, checkInTime: true, checkOutTime: true, cleaningEnabled: true, isPaused: true,
      reservations: { where: { status: "confirmed" }, select: { checkIn: true, checkOut: true } },
      calendarEvents: { where: { platform: { not: "booking" } }, select: { startDate: true, endDate: true, summary: true } },
      calendarLinks: { select: { bufferBefore: true, bufferAfter: true, lastFetchedAt: true, lastError: true } },
      dateOverrides: { select: { date: true, type: true } },
    },
  });
  return !!property && evaluatePropertyAvailability(property, query).dateStatus === "available";
}

export async function rentHomeCatalog(query?: ReturnType<typeof rentHomeDates>) {
  const owner = rentHomeOwner();
  if (!owner) return [];
  const listings = await prisma.rentHomeListing.findMany({ where: { published: true } });
  const properties = await prisma.property.findMany({
    where: { id: { in: listings.map((item) => item.propertyId) }, userId: owner, isPaused: false },
    select: { id: true, checkInTime: true, checkOutTime: true },
    orderBy: { name: "asc" },
  });
  const byId = new Map(listings.map((item) => [item.propertyId, item]));
  return (await Promise.all(properties.map(async (property) => {
    const listing = readListing(byId.get(property.id)!);
    if (!query) return { ...property, ...listing, totalMinor: null };
    if (listing.details.capacity < (query.guests ?? 1) || !(await rentHomeAvailability(prisma, property.id, query))) return null;
    const prices = await prisma.dailyPrice.findMany({
      where: { propertyId: property.id, date: { gte: query.checkIn, lt: query.checkOut } },
      select: { date: true, directBobMinor: true },
    });
    const byDate = new Map(prices.map((price) => [price.date, price.directBobMinor]));
    let totalMinor = 0;
    for (let offset = 0; offset < query.nights; offset++) {
      const amount = byDate.get(addDateDays(query.checkIn, offset));
      if (!amount || amount < 1) return null;
      totalMinor += amount;
    }
    return { ...property, ...listing, totalMinor };
  }))).filter((property) => property !== null);
}
