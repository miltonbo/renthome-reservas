"use client";

import { useMemo, useState } from "react";

export interface MasterCalendarStay {
  start: Date;
  end: Date;
  name: string;
  platform: string;
  reservationId?: number;
  totalPrice?: number | null;
  extensionOfId?: number | null;
}

interface MasterCalendarProperty {
  id: number;
  name: string;
  stays: MasterCalendarStay[];
  syncError?: boolean;
}

interface MasterCalendarProps {
  properties: MasterCalendarProperty[];
  loading?: boolean;
  onOpenProperty: (propertyId: number) => void;
  onOpenReservation: (propertyId: number, reservationId: number) => void;
  onCreateReservation: (propertyId: number) => void;
}

// Compact enough that a booking four weeks out is genuinely visible on a
// 1920px dashboard without horizontal scrolling (1309 exposed this edge
// case), while retaining enough width for readable day headers and bars.
const DAY_WIDTH = 48;
// Visual turnover split inside a shared check-out/check-in date: the outgoing
// stay uses 30%, a 5% gap keeps both bookings distinguishable, and the incoming
// stay receives the remaining 65%. This is presentation only; operational
// times and overlap rules remain check-out 11:00 / check-in 14:00.
const CHECKOUT_OFFSET_PX = Math.round(DAY_WIDTH * 0.30);
const CHECKIN_OFFSET_PX = Math.round(DAY_WIDTH * 0.35);
// Six weeks keeps near-future OTA bookings visible on first load. The earlier
// 24-day window made successfully imported reservations look missing when
// their arrival fell just beyond the viewport (for example, 16 September
// while viewing from 19 August).
const VISIBLE_DAYS = 42;

const PLATFORM_COLORS: Record<string, { background: string; foreground: string }> = {
  airbnb: { background: "#ff385c", foreground: "#ffffff" },
  "airbnb-block": { background: "#64748b", foreground: "#ffffff" },
  booking: { background: "#1769aa", foreground: "#ffffff" },
  direct: { background: "#159a73", foreground: "#ffffff" },
  vrbo: { background: "#5b4bc4", foreground: "#ffffff" },
};

function platformLabel(platform: string): string {
  if (platform.endsWith("-block")) return "Bloqueo del canal";
  if (platform === "direct") return "Directa";
  if (platform === "booking") return "Booking";
  if (platform === "airbnb") return "Airbnb";
  return platform;
}

const INVENTORY_ORDER = [
  "Sky Elite 305", "Sky Elite 329", "Sky Elite 331", "Sky Elite 406",
  "Sky Elite 523", "Sky Elite 527", "Sky Elite 528", "Sky Elite 540",
  "Sky Eclipse 1309", "Sky Eclipse 1402", "Sky Eclipse 1602", "Sky Eclipse 1709",
  "Luxe Suites 104", "Luxe Suites 113", "Luxe Suites 117", "Luxe Suites 204",
  "Luxe Suites 205", "Luxe Suites 316", "Luxe Suites 406",
  "Sky Moon 706", "Sky Luxia 112", "Stanza 8B", "Uptown Nuu 12D",
];

function startOfLocalDay(value = new Date()): Date {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function dayDiff(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcA - utcB) / 86_400_000);
}

function buildingName(propertyName: string): string {
  if (propertyName.startsWith("Sky Elite")) return "Sky Elite";
  if (propertyName.startsWith("Sky Eclipse")) return "Sky Eclipse";
  if (propertyName.startsWith("Luxe Suites")) return "Luxe Suites";
  if (propertyName.startsWith("Sky Moon")) return "Sky Moon";
  if (propertyName.startsWith("Sky Luxia")) return "Sky Luxia";
  if (propertyName.startsWith("Stanza")) return "Stanza";
  if (propertyName.startsWith("Uptown")) return "Uptown Nuu";
  return "Otros";
}

function shortUnitName(propertyName: string): string {
  return propertyName.split(" ").at(-1) || propertyName;
}

function formatRange(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short" });
  return `${formatter.format(start)} → ${formatter.format(end)}`;
}

function formatBolivianos(value: number): string {
  return `Bs ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value)}`;
}

export function MasterCalendar({
  properties,
  loading = false,
  onOpenProperty,
  onOpenReservation,
  onCreateReservation,
}: MasterCalendarProps) {
  const today = useMemo(() => startOfLocalDay(), []);
  const [windowStart, setWindowStart] = useState(() => addDays(today, -2));
  const windowEnd = useMemo(() => addDays(windowStart, VISIBLE_DAYS), [windowStart]);
  const days = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, index) => addDays(windowStart, index)),
    [windowStart],
  );

  const orderedProperties = useMemo(() => {
    const order = new Map(INVENTORY_ORDER.map((name, index) => [name, index]));
    return [...properties].sort((a, b) => {
      const ai = order.get(a.name) ?? 999;
      const bi = order.get(b.name) ?? 999;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [properties]);

  const monthFormatter = new Intl.DateTimeFormat("es-BO", { month: "short", year: "numeric" });
  const lastVisibleDay = addDays(windowEnd, -1);
  const monthLabel = windowStart.getMonth() === lastVisibleDay.getMonth()
    ? monthFormatter.format(windowStart)
    : `${monthFormatter.format(windowStart)} – ${monthFormatter.format(lastVisibleDay)}`;

  return (
    <section className="[--property-column-width:148px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-2)] shadow-sm sm:[--property-column-width:184px] lg:[--property-column-width:210px]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-2.5 py-2 sm:px-4 sm:py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)] sm:text-base">Calendario maestro</h2>
            <span className="rounded-full bg-[var(--brand-orange-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-orange)] sm:px-2 sm:text-[11px]">
              <span className="sm:hidden">{properties.length}</span><span className="hidden sm:inline">{properties.length} departamentos</span>
            </span>
          </div>
          <p className="mt-0.5 hidden text-xs text-[var(--ink-4)] sm:block">
            Reservas confirmadas, ingresos y salidas en una sola vista
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setWindowStart(addDays(windowStart, -7))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-2)] text-sm text-[var(--ink-2)] hover:bg-[var(--bg-3)]"
            aria-label="Semana anterior"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWindowStart(addDays(today, -2))}
            className="h-8 rounded-lg border border-[var(--line-2)] px-2.5 text-xs font-medium text-[var(--ink-2)] hover:bg-[var(--bg-3)] sm:px-3"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setWindowStart(addDays(windowStart, 7))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-2)] text-sm text-[var(--ink-2)] hover:bg-[var(--bg-3)]"
            aria-label="Semana siguiente"
          >
            →
          </button>
          <span className="ml-1 hidden min-w-32 capitalize text-right text-xs font-medium text-[var(--ink-3)] sm:inline">
            {monthLabel}
          </span>
        </div>
      </div>

      <div className="max-h-[78vh] overflow-auto sm:max-h-[75vh]">
        <div style={{ minWidth: `calc(var(--property-column-width) + ${DAY_WIDTH * VISIBLE_DAYS}px)` }}>
          <div className="sticky top-0 z-30 flex border-b border-[var(--line)] bg-[var(--bg-2)] shadow-[0_2px_6px_rgba(15,23,42,0.08)]">
            <div className="sticky left-0 z-30 flex w-[var(--property-column-width)] shrink-0 items-end border-r border-[var(--line)] bg-[var(--bg-2)] px-2 pb-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)] sm:px-3 sm:text-[10px]">
              <span className="hidden sm:inline">Departamento</span><span className="sm:hidden">Depto.</span>
            </div>
            <div className="flex">
              {days.map((day) => {
                const isToday = day.getTime() === today.getTime();
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={day.toISOString()}
                    className={`relative flex h-14 shrink-0 flex-col items-center justify-center border-r border-[var(--line)] ${weekend ? "bg-[var(--brand-navy-soft)]" : ""} ${isToday ? "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-0.5 before:bg-[var(--brand-orange)]" : ""}`}
                    style={{ width: DAY_WIDTH }}
                  >
                    <span className={`text-[9px] font-medium uppercase ${isToday ? "text-[var(--brand-orange)]" : "text-[var(--ink-4)]"}`}>
                      {new Intl.DateTimeFormat("es-BO", { weekday: "short" }).format(day).slice(0, 2)}
                    </span>
                    <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-[var(--brand-orange)] text-white" : "text-[var(--ink-2)]"}`}>
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="space-y-px p-3">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-lg bg-[var(--bg-3)]" />
              ))}
            </div>
          ) : orderedProperties.map((property, index) => {
            const building = buildingName(property.name);
            const previousBuilding = index > 0 ? buildingName(orderedProperties[index - 1].name) : null;
            const visibleStays = property.stays.filter(
              (stay) => stay.start < windowEnd && stay.end > windowStart,
            );

            return (
              <div key={property.id}>
                {building !== previousBuilding && (
                  <div className="sticky left-0 z-10 flex h-6 items-center border-b border-[var(--line)] bg-[var(--brand-navy)] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/70 sm:h-7 sm:px-3 sm:text-[10px]">
                    {building}
                  </div>
                )}
                <div className="flex h-[48px] border-b border-[var(--line)] last:border-b-0">
                  <div className="sticky left-0 z-10 flex w-[var(--property-column-width)] shrink-0 items-center justify-between gap-1.5 border-r border-[var(--line)] bg-[var(--bg-2)] px-2 sm:px-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenProperty(property.id)}
                      className="min-w-0 text-left"
                      title={property.name}
                    >
                      <span className="block truncate text-xs font-semibold text-[var(--ink)]">{property.name}</span>
                      <span className="mt-0.5 hidden text-[10px] text-[var(--ink-4)] sm:block">
                        Unidad {shortUnitName(property.name)}{property.syncError ? " · error de sync" : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCreateReservation(property.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-orange-soft)] text-sm font-medium text-[var(--brand-orange)] hover:bg-[var(--brand-orange)] hover:text-white sm:h-7 sm:w-7 sm:text-base"
                      aria-label={`Agregar reserva en ${property.name}`}
                      title="Agregar reserva"
                    >
                      +
                    </button>
                  </div>

                  <div className="relative h-[48px]" style={{ width: DAY_WIDTH * VISIBLE_DAYS }}>
                    <div className="absolute inset-0 flex">
                      {days.map((day) => {
                        const weekend = day.getDay() === 0 || day.getDay() === 6;
                        const isToday = day.getTime() === today.getTime();
                        return (
                          <div
                            key={day.toISOString()}
                            className={`relative h-full shrink-0 border-r border-[var(--line)] ${weekend ? "bg-[var(--brand-navy-soft)]" : ""} ${isToday ? "bg-[var(--brand-orange-faint)] before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-0.5 before:bg-[var(--brand-orange)]" : ""}`}
                            style={{ width: DAY_WIDTH }}
                          />
                        );
                      })}
                    </div>

                    {visibleStays.map((stay, stayIndex) => {
                      const clippedStart = stay.start < windowStart ? windowStart : stay.start;
                      const clippedEnd = stay.end > windowEnd ? windowEnd : stay.end;
                      const left = dayDiff(clippedStart, windowStart) * DAY_WIDTH +
                        (stay.start < windowStart ? 3 : stay.extensionOfId ? CHECKOUT_OFFSET_PX : CHECKIN_OFFSET_PX);
                      const right = dayDiff(clippedEnd, windowStart) * DAY_WIDTH +
                        (stay.end < windowEnd ? CHECKOUT_OFFSET_PX : -3);
                      const width = Math.max(18, right - left);
                      const color = PLATFORM_COLORS[stay.platform] || { background: "#6b7280", foreground: "#ffffff" };
                      return (
                        <button
                          key={`${stay.reservationId ?? stay.name}-${stay.start.toISOString()}-${stayIndex}`}
                          type="button"
                          onClick={() => stay.reservationId
                            ? onOpenReservation(property.id, stay.reservationId)
                            : onOpenProperty(property.id)}
                          className="absolute top-2 z-[2] h-8 overflow-hidden rounded-lg px-2 text-left text-[11px] font-semibold shadow-sm transition-transform hover:z-[3] hover:scale-[1.015] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:ring-offset-1"
                          style={{ left, width, backgroundColor: color.background, color: color.foreground }}
                          title={`${stay.name} · ${formatRange(stay.start, stay.end)} · ${platformLabel(stay.platform)}${stay.totalPrice != null ? ` · ${formatBolivianos(stay.totalPrice)}` : ""}`}
                        >
                          <span className="flex items-center gap-1 truncate">
                            {stay.extensionOfId && <span className="rounded bg-white/25 px-1 text-[8px] uppercase">Ext.</span>}
                            <span className="truncate">{stay.name}</span>
                          </span>
                          <span className="flex items-center justify-between gap-1 text-[9px] font-medium opacity-90">
                            <span className="truncate">{platformLabel(stay.platform)}</span>
                            {stay.totalPrice != null && (
                              <span className="shrink-0 font-semibold">{formatBolivianos(stay.totalPrice)}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--ink-4)] sm:flex">
        {[
          ["#ff385c", "Airbnb"], ["#64748b", "No disponible"], ["#1769aa", "Booking"], ["#159a73", "Directa"], ["#5b4bc4", "Vrbo"],
        ].map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="ml-auto">Check-in 14:00 · Check-out 11:00</span>
      </div>
    </section>
  );
}
