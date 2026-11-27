import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDateDays, evaluatePropertyAvailability, parseAvailabilityQuery } from "@/lib/messaging-availability";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";
import { calculateCalendarStayQuote } from "@/lib/pricing-stay-quote";
import { getStayQuoteConfig } from "@/lib/pricing-stay-quote-config";
import { rentHomeBuilding } from "@/lib/renthome-group";

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

const availabilityFields = {
  id: true, name: true, minNights: true, bookingWindow: true, checkInTime: true, checkOutTime: true, cleaningEnabled: true, isPaused: true,
  reservations: { where: { status: "confirmed" }, select: { checkIn: true, checkOut: true } },
  calendarEvents: { where: { platform: { not: "booking" } }, select: { startDate: true, endDate: true, summary: true } },
  calendarLinks: { select: { bufferBefore: true, bufferAfter: true, lastFetchedAt: true, lastError: true } },
  dateOverrides: { select: { date: true, type: true } },
} satisfies Prisma.PropertySelect;

export async function rentHomeAvailability(db: Prisma.TransactionClient, propertyId: number, query: ReturnType<typeof rentHomeDates>) {
  const owner = rentHomeOwner();
  if (!owner) return false;
  const property = await db.property.findFirst({ where: { id: propertyId, userId: owner }, select: availabilityFields });
  return !!property && evaluatePropertyAvailability(property, query).dateStatus === "available";
}

export async function rentHomeCatalog(query?: ReturnType<typeof rentHomeDates>, includeSmaller = false) {
  const owner = rentHomeOwner();
  if (!owner) return [];
  const listings = await prisma.rentHomeListing.findMany({ where: { published: true } });
  const properties = await prisma.property.findMany({
    where: { id: { in: listings.map((item) => item.propertyId) }, userId: owner, isPaused: false },
    select: { id: true, name: true, pricingProfile: { select: { building: true } }, checkInTime: true, checkOutTime: true },
    orderBy: { name: "asc" },
  });
  const byId = new Map(listings.map((item) => [item.propertyId, item]));
  const catalog = properties.map(({ name, pricingProfile, ...property }) => {
    const listing = readListing(byId.get(property.id)!);
    return { ...property, ...listing, building: rentHomeBuilding(name, pricingProfile?.building) };
  });
  if (!query) return catalog.map((property) => ({ ...property, totalMinor: null, savingsMinor: 0 }));
  const candidates = catalog.filter((property) => includeSmaller || property.details.capacity >= (query.guests ?? 1));
  if (!candidates.length) return [];
  const availability = await prisma.property.findMany({
    where: { id: { in: candidates.map(({ id }) => id) }, userId: owner, isPaused: false },
    select: availabilityFields,
  });
  const now = new Date();
  const availableIds = new Set(availability.filter((property) => evaluatePropertyAvailability(property, query, now).dateStatus === "available").map(({ id }) => id));
  if (!availableIds.size) return [];

  const propertyIds = [...availableIds];
  const [quoteConfig, prices] = await Promise.all([
    getStayQuoteConfig(propertyIds, owner, ["direct"]),
    prisma.dailyPrice.findMany({
      where: { propertyId: { in: propertyIds }, date: { gte: query.checkIn, lt: query.checkOut } },
      select: { propertyId: true, date: true, directBobMinor: true, reasonSummary: true },
    }),
  ]);
  const pricesByProperty = new Map<number, Map<string, (typeof prices)[number]>>();
  for (const price of prices) {
    const byDate = pricesByProperty.get(price.propertyId) ?? new Map();
    byDate.set(price.date, price);
    pricesByProperty.set(price.propertyId, byDate);
  }
  const dates = Array.from({ length: query.nights }, (_, offset) => addDateDays(query.checkIn, offset));
  const policies = new Map(quoteConfig.policies.map((policy) => [policy.propertyId, policy]));
  return candidates.flatMap((property) => {
    const byDate = pricesByProperty.get(property.id);
    if (!byDate) return [];
    const nightly = [];
    for (const date of dates) {
      const row = byDate.get(date);
      if (!row?.directBobMinor || row.directBobMinor < 1) return [];
      nightly.push({ date, priceMinor: row.directBobMinor, reasons: row.reasonSummary });
    }
    const { totalMinor, savingsMinor } = calculateCalendarStayQuote(nightly, policies.get(property.id), quoteConfig);
    return [{ ...property, totalMinor, savingsMinor }];
  });
}
