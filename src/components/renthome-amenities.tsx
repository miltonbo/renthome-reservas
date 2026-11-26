import {
  ArrowUpDown, Bath, CircleCheck, Coffee, CookingPot, Dumbbell, Fence, Laptop, Shirt, Snowflake,
  ThermometerSun, Tv, UsersRound, WashingMachine, Waves, Wifi,
} from "lucide-react";
import { rentHomeServices } from "@/lib/renthome-listing-details";

const amenityIcons = [
  { pattern: /\bpiscinas?\b/, icon: Waves, highlight: true, tone: "bg-[#e2f2f8] text-[#176078]" },
  { pattern: /\b(balcon(?:es)?|terraza)\b/, icon: Fence, highlight: true, tone: "bg-[#faeddd] text-[#8b501e]" },
  { pattern: /\bgimnasio\b/, icon: Dumbbell, highlight: true, tone: "bg-[#e8eafa] text-[#494d95]" },
  { pattern: /\bsauna\b/, icon: ThermometerSun, highlight: true, tone: "bg-[#f9eadd] text-[#8f4b25]" },
  { pattern: /\bcowork(?:ing)?\b/, icon: UsersRound, highlight: true, tone: "bg-[#e4f1e9] text-[#216146]" },
  { pattern: /\b(wi[\s-]?fi|internet)\b/, icon: Wifi, highlight: true, tone: "bg-[#e2f2f8] text-[#176078]" },
  { pattern: /\b(cocina|cocineta)\b/, icon: CookingPot, highlight: true, tone: "bg-[#faeddd] text-[#8b501e]" },
  { pattern: /\b(trabajo|escritorio)\b/, icon: Laptop },
  { pattern: /\b(lavadora|lavanderia)\b/, icon: WashingMachine },
  { pattern: /\bsecadora\b/, icon: Shirt },
  { pattern: /\baire acondicionado\b/, icon: Snowflake },
  { pattern: /\b(tv|televisor|television)\b/, icon: Tv },
  { pattern: /\b(bano|banera|jacuzzi)\b/, icon: Bath },
  { pattern: /\b(cafe|cafetera)\b/, icon: Coffee },
  { pattern: /\b(ascensor|elevador)\b/, icon: ArrowUpDown },
];

export function RentHomeAmenities({ services }: { services: string }) {
  const amenities = rentHomeServices(services).map((label) => {
    const normalized = label.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const match = amenityIcons.find(({ pattern }) => pattern.test(normalized));
    return { label, Icon: match?.icon ?? CircleCheck, tone: match?.tone, highlight: match?.highlight };
  });
  if (!amenities.length) return null;
  const featured = amenities.filter((amenity) => amenity.highlight).slice(0, 6);
  const remaining = amenities.filter((amenity) => !featured.includes(amenity));

  return (
    <section aria-labelledby="renthome-amenities" className="border-b border-[var(--rh-line)] pb-6 sm:pb-7">
      <h2 id="renthome-amenities" className="mb-4 text-xl font-extrabold">Servicios del alojamiento</h2>
      {featured.length > 0 && <ul aria-label="Servicios destacados" className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {featured.map(({ label, Icon, tone }) => (
          <li key={label} className="flex min-w-0 flex-col items-start gap-2 rounded-xl bg-[var(--rh-tint)] p-3 min-[420px]:flex-row min-[420px]:items-center">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
              <Icon size={20} aria-hidden />
            </span>
            <span className="min-w-0 break-words text-sm font-semibold leading-snug text-[var(--rh-ink)]">{label}</span>
          </li>
        ))}
      </ul>}
      {remaining.length > 0 && <ul aria-label={featured.length ? "Otros servicios" : undefined} className={`grid gap-x-5 gap-y-3 sm:grid-cols-2 ${featured.length ? "mt-5 border-t border-[var(--rh-line)] pt-5" : ""}`}>
        {remaining.map(({ label, Icon }) => (
          <li key={label} className="flex items-start gap-2.5 text-sm text-[var(--rh-muted)]">
            <Icon size={18} className="mt-0.5 shrink-0 text-[var(--rh-brand)]" aria-hidden />
            <span>{label}</span>
          </li>
        ))}
      </ul>}
    </section>
  );
}
