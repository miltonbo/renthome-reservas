import { Tag } from "lucide-react";
import { reservationNights } from "@/lib/reservation-dates";

export function RentHomeStaySavings({ dates, savingsMinor }: {
  dates: { checkIn: string; checkOut: string } | null;
  savingsMinor: number;
}) {
  if (!dates || savingsMinor <= 0) return null;
  const nights = reservationNights(dates.checkIn, dates.checkOut);
  if (nights < 7) return null;
  const amount = (savingsMinor / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
      <Tag size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span>Descuento {nights >= 28 ? "mensual" : "semanal"} aplicado · Ahorras <span className="whitespace-nowrap tabular-nums">Bs {amount}</span></span>
    </p>
  );
}
