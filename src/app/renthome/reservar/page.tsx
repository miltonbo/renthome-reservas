import Link from "next/link";
import { RentHomeCheckout } from "@/components/renthome-checkout";
import { rentHomeBackToResults } from "@/lib/renthome-booking-links";
import { quoteRentHomeGroup } from "@/lib/renthome-group";
import { rentHomeCatalog, rentHomeDates } from "@/lib/renthome";
import { priceForGuests } from "@/lib/pricing";

export const metadata = { title: "Reservar · RentHome" };

export default async function RentHomeCheckoutPage({ searchParams }: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string; unidades?: string }>;
}) {
  const params = await searchParams;
  const ids = typeof params.unidades === "string" && /^\d+(,\d+){0,2}$/.test(params.unidades)
    ? params.unidades.split(",").map(Number) : [];
  let query;
  try { query = rentHomeDates(params); } catch { /* Render the recovery link below. */ }
  if (query && ids.length) {
    const dates = { checkIn: query.checkIn, checkOut: query.checkOut, guests: String(query.guests) };
    const options = await rentHomeCatalog(query, ids.length > 1);
    const matches = ids.flatMap((id) => {
      const match = options.find((option) => option.id === id && option.totalMinor !== null);
      return match ? [match] : [];
    });
    const single = matches[0];
    const group = ids.length > 1 && matches.length === ids.length ? quoteRentHomeGroup(matches, query.guests!) : null;
    const units = group?.units ?? (ids.length === 1 && single?.totalMinor != null
      ? [{ propertyId: single.id, title: single.details.title, guests: query.guests!, totalMinor: priceForGuests(single.totalMinor, query.guests!) }] : []);
    if (units.length) return <RentHomeCheckout dates={dates} units={units.map((unit) => ({
      ...unit, photos: matches.find((match) => match.id === unit.propertyId)?.photos.slice(0, 3) ?? [],
    }))} building={group?.building} />;
    return <Unavailable href={rentHomeBackToResults(dates)} />;
  }
  return <Unavailable href="/renthome#buscar-estadia" />;
}

function Unavailable({ href }: { href: string }) {
  return <main className="mx-auto max-w-xl space-y-4 px-5 py-16">
    <h1 className="text-2xl font-extrabold">Esta opción ya no está disponible</h1>
    <p className="text-[var(--rh-muted)]">Vuelve a buscar para ver los departamentos disponibles.</p>
    <Link className="font-bold text-[var(--rh-brand)] underline" href={href}>Volver a la búsqueda</Link>
  </main>;
}
