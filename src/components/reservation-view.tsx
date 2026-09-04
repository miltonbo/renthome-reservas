"use client";

import Link from "next/link";
import type { Reservation } from "@/lib/types";
import { reservationNights, toReservationDateInput } from "@/lib/reservation-dates";
import { segmentChargeStatus } from "@/lib/finance";

interface ReservationViewProps {
  reservation: Reservation;
  propertyName?: string;
  relatedReservations?: Reservation[];
}

const CHANNELS: Record<string, string> = { airbnb: "Airbnb", booking: "Booking.com", vrbo: "Vrbo", direct: "Directo" };
const CHANNEL_STYLES: Record<string, string> = {
  airbnb: "bg-[#ff385c]/15 text-[#ff385c]",
  booking: "bg-[#1677c8]/15 text-[#1677c8]",
  direct: "bg-emerald-500/15 text-emerald-600",
  vrbo: "bg-violet-500/15 text-violet-600",
};

function money(value?: number | null, currency: "BOB" | "USD" = "BOB"): string {
  return `${currency === "USD" ? "USD" : "Bs"} ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value || 0)}`;
}

const MOVEMENT_LABELS: Record<string, string> = { lodging: "Hospedaje", parking: "Parqueo", guarantee: "Garantía", additional: "Ingreso adicional", adjustment: "Ajuste", refund: "Reembolso" };
const METHOD_LABELS: Record<string, string> = { qr: "QR", cash: "Efectivo", transfer: "Transferencia", takenos: "Takenos", binance: "Binance", sepa: "SEPA", airbnb: "Airbnb" };

function segmentTotals(segment: Reservation) {
  return segmentChargeStatus(segment);
}

function dateLabel(value: string): string {
  const key = toReservationDateInput(value);
  return new Date(`${key}T12:00:00`).toLocaleDateString("es-BO", { day: "2-digit", month: "short", year: "numeric" });
}

function movementDateLabel(value: string): string {
  return new Date(value).toLocaleString("es-BO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const receivedTotals = allMovements.reduce((totals, movement) => {
    totals[movement.currency] += movement.amountMinor / 100;
    return totals;
  }, { BOB: 0, USD: 0 });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--ink-3)] hover:text-[var(--brand-orange)]">← Volver al calendario maestro</Link>
          <h1 className="text-2xl font-bold text-[var(--ink)]">{root.name}</h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">{propertyName}</p>
          {root.platform === "booking" && <p className="mt-1 text-xs text-[var(--ink-3)]">Departamento que recibió la reserva: <strong className="text-[var(--ink)]">{root.bookingOriginalProperty?.name || propertyName || "—"}</strong></p>}
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
                <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[var(--ink)]">{index === 0 ? "Reserva inicial" : `Extensión ${index}`}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CHANNEL_STYLES[segment.platform] || "bg-[var(--bg-3)] text-[var(--ink-3)]"}`}>{CHANNELS[segment.platform] || segment.platform}</span></div>
                <p className="mt-1 text-xs text-[var(--ink-3)]">{dateLabel(segment.checkIn)} → {dateLabel(segment.checkOut)} · {reservationNights(segment.checkIn, segment.checkOut)} {reservationNights(segment.checkIn, segment.checkOut) === 1 ? "noche" : "noches"}</p>
              </div>
              <div className="text-xs text-[var(--ink-3)]">{segment.hasParking ? `Parqueo ${money(segment.parkingTotalPrice, segment.parkingCurrency || "BOB")}` : "Sin parqueo"}</div>
              <div className="text-right"><div className="font-semibold tabular-nums text-[var(--ink)]">{money(segment.totalPrice, segment.priceCurrency || "BOB")}</div>{(() => { const totals = segmentTotals(segment); const pending = totals.balance.BOB < -0.005 || totals.balance.USD < -0.005; const excess = totals.balance.BOB > 0.005 || totals.balance.USD > 0.005; return <div className={`mt-0.5 text-[10px] font-semibold ${pending ? "text-amber-400" : "text-emerald-500"}`}>{pending ? <>{totals.balance.BOB < 0 && `- ${money(Math.abs(totals.balance.BOB))} `}{totals.balance.USD < 0 && `- ${money(Math.abs(totals.balance.USD), "USD")}`}</> : excess ? <>{totals.balance.BOB > 0 && `+ ${money(totals.balance.BOB)} `}{totals.balance.USD > 0 && `+ ${money(totals.balance.USD, "USD")}`}</> : totals.manuallySettled ? "Saldado manualmente" : "Saldado"}</div>; })()}</div>
              {segment.note && <div className="rounded-lg bg-[var(--bg-3)] px-3 py-2 text-xs text-[var(--ink-2)] sm:col-span-3"><span className="font-semibold">Nota:</span> {segment.note}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--brand-orange)]/30 bg-[var(--brand-orange-soft)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-base font-semibold text-[var(--ink)]">Pagos realizados por el huésped</h2><p className="mt-0.5 text-xs text-[var(--ink-4)]">Ingresos registrados para todos los tramos de la estadía.</p></div>
          <div className="grid min-w-[280px] grid-cols-3 gap-2 text-xs">
            <PaymentSummary label="Total recibido en Bs" value={money(receivedTotals.BOB)} />
            <PaymentSummary label="Total recibido en USD" value={money(receivedTotals.USD, "USD")} />
            <PaymentSummary label="Garantía vigente" value={root.guaranteeAmount ? money(root.guaranteeAmount, root.guaranteeCurrency || "BOB") : "Sin garantía"} />
          </div>
        </div>
        {allMovements.length === 0 ? <p className="mt-4 text-sm text-[var(--ink-3)]">Todavía no hay pagos registrados.</p> : <div className="mt-4 overflow-hidden rounded-xl border border-[var(--brand-orange)]/20 bg-[var(--bg)]">
          <div className="hidden grid-cols-[minmax(0,1fr)_180px_110px] gap-3 border-b border-[var(--line)] bg-[var(--bg-3)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-4)] sm:grid"><span>Concepto y método</span><span>Fecha registrada</span><span className="text-right">Monto</span></div>
          {allMovements.map(movement => <div key={movement.id} className="grid gap-1 border-b border-[var(--line)] px-3 py-3 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px_110px] sm:items-center sm:gap-3"><div><div className="font-semibold text-[var(--ink)]">{MOVEMENT_LABELS[movement.type] || movement.type} · {METHOD_LABELS[movement.paymentMethod] || movement.paymentMethod}</div>{movement.note && <div className="mt-0.5 text-[var(--ink-3)]">{movement.note}</div>}</div><time className="text-[var(--ink-3)]" dateTime={movement.occurredAt}>{movementDateLabel(movement.occurredAt)}</time><div className={`font-bold sm:text-right ${movement.amountMinor < 0 ? "text-red-400" : "text-[var(--ink)]"}`}>{money(movement.amountMinor / 100, movement.currency)}</div></div>)}
        </div>}
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4"><div className="text-[11px] font-medium uppercase tracking-wide text-[var(--ink-4)]">{label}</div><div className="mt-1.5 text-sm font-semibold text-[var(--ink)]">{value}</div></div>; }
function PaymentSummary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-[var(--brand-orange)]/20 bg-[var(--bg)] px-3 py-2"><div className="text-[10px] text-[var(--ink-4)]">{label}</div><div className="mt-0.5 font-bold tabular-nums text-[var(--ink)]">{value}</div></div>; }
