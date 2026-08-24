"use client";

import Link from "next/link";
import type { Reservation } from "@/lib/types";
import { reservationNights, toReservationDateInput } from "@/lib/reservation-dates";

interface ReservationViewProps {
  reservation: Reservation;
  propertyName?: string;
  relatedReservations?: Reservation[];
}

const CHANNELS: Record<string, string> = { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", direct: "Directo" };

function money(value?: number | null, currency: "BOB" | "USD" = "BOB"): string {
  return `${currency === "USD" ? "USD" : "Bs"} ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value || 0)}`;
}

const MOVEMENT_LABELS: Record<string, string> = { lodging: "Hospedaje", parking: "Parqueo", guarantee: "Garantía", additional: "Ingreso adicional", adjustment: "Ajuste", refund: "Reembolso" };
const METHOD_LABELS: Record<string, string> = { qr: "QR", cash: "Efectivo", transfer: "Transferencia", takenos: "Takenos", binance: "Binance", sepa: "SEPA", airbnb: "Airbnb" };

function segmentTotals(segment: Reservation) {
  const expected = { BOB: 0, USD: 0 }, paid = { BOB: 0, USD: 0 };
  if (segment.totalPrice != null) expected[segment.priceCurrency || "BOB"] += segment.totalPrice;
  if (segment.parkingTotalPrice != null) expected[segment.parkingCurrency || "BOB"] += segment.parkingTotalPrice;
  if (segment.guaranteeAmount != null) expected[segment.guaranteeCurrency || "BOB"] += segment.guaranteeAmount;
  for (const movement of segment.moneyMovements || []) if (["lodging", "parking", "guarantee", "refund"].includes(movement.type)) paid[movement.currency] += movement.amountMinor / 100;
  return { expected, paid, due: { BOB: Math.max(0, expected.BOB - paid.BOB), USD: Math.max(0, expected.USD - paid.USD) } };
}

function dateLabel(value: string): string {
  const key = toReservationDateInput(value);
  return new Date(`${key}T12:00:00`).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

export function ReservationView({ reservation, propertyName, relatedReservations = [] }: ReservationViewProps) {
  const rootId = reservation.extensionOfId || reservation.id;
  const family = relatedReservations
    .filter((item) => item.id === rootId || item.extensionOfId === rootId)
    .sort((a, b) => toReservationDateInput(a.checkIn).localeCompare(toReservationDateInput(b.checkIn)));
  const segments = family.length > 0 ? family : [reservation];
  const root = segments.find((item) => item.id === rootId) || segments[0];
  const checkIn = segments[0].checkIn;
  const checkOut = segments[segments.length - 1].checkOut;
  const allMovements = segments.flatMap((item) => item.moneyMovements || []);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--brand-orange)]">← Volver al calendario maestro</Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">{root.name}</h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">{propertyName}</p>
        </div>
        <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-500">Reserva confirmada</span>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Ingreso" value={`${dateLabel(checkIn)} · 14:00`} />
        <Summary label="Salida final" value={`${dateLabel(checkOut)} · 11:00`} />
        <Summary label="Estadía total" value={`${reservationNights(checkIn, checkOut)} noches`} />
        <Summary label="Departamento físico" value={propertyName || "—"} />
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold text-[var(--ink)]">Tramos de la estadía</h2><p className="mt-0.5 text-xs text-[var(--ink-4)]">La limpieza se programa únicamente después de la salida final.</p></div>
          {segments.length > 1 && <span className="rounded-full bg-[var(--brand-orange-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--brand-orange)]">{segments.length - 1} extensión{segments.length > 2 ? "es" : ""}</span>}
        </div>
        <div className="space-y-2">
          {segments.map((segment, index) => (
            <div key={segment.id} className="grid gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[var(--ink)]">{index === 0 ? "Reserva inicial" : `Extensión ${index}`}</span><span className="rounded-full bg-[var(--bg-3)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">{CHANNELS[segment.platform] || segment.platform}</span></div>
                <p className="mt-1 text-xs text-[var(--ink-3)]">{dateLabel(segment.checkIn)} → {dateLabel(segment.checkOut)} · {reservationNights(segment.checkIn, segment.checkOut)} {reservationNights(segment.checkIn, segment.checkOut) === 1 ? "noche" : "noches"}</p>
              </div>
              <div className="text-xs text-[var(--ink-3)]">{segment.hasParking ? `Parqueo ${money(segment.parkingTotalPrice, segment.parkingCurrency || "BOB")}` : "Sin parqueo"}</div>
              <div className="text-right"><div className="font-semibold tabular-nums text-[var(--ink)]">{money(segment.totalPrice, segment.priceCurrency || "BOB")}</div>{(() => { const totals = segmentTotals(segment); const pending = totals.due.BOB > 0.005 || totals.due.USD > 0.005; return <div className={`mt-0.5 text-[10px] font-semibold ${pending ? "text-amber-400" : "text-emerald-500"}`}>{pending ? <>{totals.due.BOB > 0 && `${money(totals.due.BOB)} adeudado `}{totals.due.USD > 0 && `${money(totals.due.USD, "USD")} adeudado`}</> : "Saldado"}</div>; })()}</div>
              {segment.note && <div className="rounded-lg bg-[var(--bg-3)] px-3 py-2 text-xs text-[var(--ink-2)] sm:col-span-3"><span className="font-semibold">Nota:</span> {segment.note}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-5">
          <h2 className="text-base font-semibold text-[var(--ink)]">Información operativa</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Info label="Huésped" value={root.name} /><Info label="Canal inicial" value={CHANNELS[root.platform] || root.platform} />
            <Info label="Parqueo" value={segments.some(item => item.hasParking) ? "Sí" : "No"} /><Info label="Garantía vigente" value={root.guaranteeAmount ? money(root.guaranteeAmount, root.guaranteeCurrency || "BOB") : "Sin garantía"} />
            {segments.some((item) => item.note) && <Info label="Notas" value={segments.filter((item) => item.note).map((item) => item.note).join(" · ")} wide />}
          </dl>
        </div>
        <div className="rounded-2xl border border-[var(--brand-orange)]/30 bg-[var(--brand-orange-soft)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Pagos realizados por el huésped</h2>
          {allMovements.length === 0 ? <p className="mt-3 text-sm text-[var(--ink-3)]">Todavía no hay pagos registrados.</p> : <div className="mt-3 space-y-2">{allMovements.map(movement => <div key={movement.id} className="flex items-start justify-between gap-3 border-b border-[var(--brand-orange)]/15 pb-2 text-xs"><div><div className="font-semibold text-[var(--ink)]">{MOVEMENT_LABELS[movement.type] || movement.type} · {METHOD_LABELS[movement.paymentMethod] || movement.paymentMethod}</div>{movement.note && <div className="mt-0.5 text-[var(--ink-3)]">{movement.note}</div>}</div><div className={`shrink-0 font-bold ${movement.amountMinor < 0 ? "text-red-400" : "text-[var(--ink)]"}`}>{money(movement.amountMinor / 100, movement.currency)}</div></div>)}</div>}
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">{label}</div><div className="mt-1.5 text-sm font-semibold text-[var(--ink)]">{value}</div></div>; }
function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={wide ? "sm:col-span-2" : ""}><dt className="text-xs text-[var(--ink-4)]">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-medium text-[var(--ink)]">{value}</dd></div>; }
