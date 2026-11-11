"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface BookingAlert {
  id: number;
  uid: string;
  summary: string;
  propertyId: number;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  status: "pending" | "resolved";
  resolution: "reservation" | "manual" | null;
  reservationId: number | null;
  reservationName: string | null;
  assignedPropertyId: number | null;
  assignedPropertyName: string | null;
  reviewedAt: string | null;
}

interface BookingAlertsPanelProps {
  onCreateReservation: (alert: BookingAlert) => void;
  onOpenReservation: (reservationId: number) => void;
  refreshKey?: number;
}

function localDateKey(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

export function bookingAlertNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T12:00:00.000Z`).getTime();
  const end = new Date(`${checkOut}T12:00:00.000Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00`));
}

export function BookingAlertsPanel({ onCreateReservation, onOpenReservation, refreshKey = 0 }: BookingAlertsPanelProps) {
  const today = useMemo(() => localDateKey(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [alerts, setAlerts] = useState<BookingAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/booking-alerts?date=${selectedDate}`, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudieron cargar las alertas de Booking.");
      const body = await response.json();
      setAlerts(Array.isArray(body.alerts) ? body.alerts : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las alertas de Booking.");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);

  const updateStatus = async (alert: BookingAlert, status: "pending" | "resolved") => {
    setUpdatingId(alert.id);
    setError("");
    try {
      const response = await fetch("/api/booking-alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.id, status }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar la alerta.");
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la alerta.");
    } finally {
      setUpdatingId(null);
    }
  };

  const syncBookingCalendars = async () => {
    if (syncing) return;
    setSyncing(true);
    setError("");
    setSyncMessage("");
    try {
      const response = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "booking" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron sincronizar los calendarios de Booking.");
      await load();
      const properties = Number(body.propertiesSynced || 0);
      const changes = Number(body.newEvents || 0) + Number(body.removedEvents || 0);
      setSyncMessage(
        properties === 0
          ? "No hay calendarios de Booking conectados."
          : `Booking sincronizado: ${properties} ${properties === 1 ? "alojamiento" : "alojamientos"}, ${changes} ${changes === 1 ? "cambio" : "cambios"}.`,
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "No se pudieron sincronizar los calendarios de Booking.");
    } finally {
      setSyncing(false);
    }
  };

  const pending = alerts.filter((alert) => alert.status === "pending");
  const resolved = alerts.filter((alert) => alert.status === "resolved");
  const selectedLabel = selectedDate === today
    ? "Hoy"
    : new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short" })
        .format(new Date(`${selectedDate}T12:00:00`));

  return (
    <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/15 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-white">B</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--ink)]">Alertas de Booking</h2>
              {pending.length > 0 && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  {pending.length} {pending.length === 1 ? "pendiente" : "pendientes"}
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-[var(--ink-4)]">Avisos iCal para coordinar; no bloquean disponibilidad.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={syncBookingCalendars}
            disabled={syncing}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#003580] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#00285f] disabled:cursor-wait disabled:opacity-70"
          >
            <svg className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m-2.096 14.17a8.25 8.25 0 10-2.896-13.178l4.992 4.992" />
            </svg>
            {syncing ? "Sincronizando…" : "Sincronizar Booking"}
          </button>
          <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, -1))} aria-label="Día anterior" className="h-8 w-8 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] text-[var(--ink-2)] hover:bg-[var(--bg-3)]">‹</button>
          <button type="button" onClick={() => setSelectedDate(today)} className="min-w-24 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium capitalize text-[var(--ink)] hover:bg-[var(--bg-3)]">{selectedLabel}</button>
          <button type="button" onClick={() => setSelectedDate(shiftDate(selectedDate, 1))} aria-label="Día siguiente" className="h-8 w-8 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] text-[var(--ink-2)] hover:bg-[var(--bg-3)]">›</button>
        </div>
      </div>

      <div className="px-3 py-2.5 sm:px-4">
        {error && <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-300">{error}</p>}
        {syncMessage && <p role="status" className="mb-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{syncMessage}</p>}
        {!loading && pending.length > 0 && (
          <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white">!</span>
            Hay reservas de Booking sin resolver.
          </div>
        )}
        {loading ? (
          <div className="flex h-14 items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500/25 border-t-emerald-500" /></div>
        ) : alerts.length === 0 ? (
          <div className="flex min-h-12 items-center justify-center text-center text-xs text-[var(--ink-4)]">No hay ingresos detectados por Booking para este día.</div>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {[...pending, ...resolved].map((alert) => {
              const nights = bookingAlertNights(alert.checkIn, alert.checkOut);
              const isResolved = alert.status === "resolved";
              return (
                <article key={alert.id} className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 ${isResolved ? "border-[var(--line)] bg-[var(--bg-2)] opacity-60" : "border-amber-400/35 bg-[var(--bg)]"}`}>
                  <button
                    type="button"
                    disabled={updatingId === alert.id}
                    onClick={() => updateStatus(alert, isResolved ? "pending" : "resolved")}
                    aria-label={isResolved ? "Reabrir alerta" : "Marcar alerta como resuelta"}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${isResolved ? "border-emerald-500 bg-emerald-500 text-white" : "border-amber-500/60 text-transparent hover:bg-amber-500/10"} disabled:cursor-default`}
                  >✓</button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{alert.propertyName}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">{formatShortDate(alert.checkIn)} → {formatShortDate(alert.checkOut)} · {nights} {nights === 1 ? "noche" : "noches"}</p>
                    {alert.reservationId && (
                      <p className="mt-0.5 truncate text-[10px] font-medium text-emerald-600 dark:text-emerald-300">
                        Asignada a {alert.assignedPropertyName || "un alojamiento"}{alert.reservationName ? ` · ${alert.reservationName}` : ""}
                      </p>
                    )}
                  </div>
                  {!isResolved && !alert.reservationId && (
                    <button type="button" onClick={() => onCreateReservation(alert)} className="shrink-0 rounded-md bg-[#003580] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#00285f]">Asignar</button>
                  )}
                  {alert.reservationId && (
                    <button type="button" onClick={() => onOpenReservation(alert.reservationId!)} className="shrink-0 rounded-md border border-[#003580]/35 bg-[#003580]/10 px-2.5 py-1.5 text-[11px] font-semibold text-[#003580] hover:bg-[#003580]/15 dark:text-blue-300">
                      Ver reserva
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-[var(--ink-4)]">Booking solo comparte la unidad y las fechas mediante iCal; el nombre, el pago y la llegada deben confirmarse en Booking.com.</p>
      </div>
    </section>
  );
}
