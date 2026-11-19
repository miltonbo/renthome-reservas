"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

export interface MasterCalendarStay {
  start: Date;
  end: Date;
  name: string;
  platform: string;
  reservationId?: number;
  totalPrice?: number | null;
  extensionOfId?: number | null;
  currency?: "BOB" | "USD";
  hasOutstandingBalance?: boolean;
  hasMissingAirbnbDetails?: boolean;
  uid?: string;
  blockReason?: string;
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
  onOpenImportedStay: (propertyId: number, stay: MasterCalendarStay) => void;
  onCreateReservation: (propertyId: number) => void;
  bookingPendingCount?: number;
}

interface ShadowDailyPrice {
  propertyId: number;
  date: string;
  directBobMinor: number | null;
  airbnbUsdMinor: number | null;
  bookingUsdMinor: number | null;
  floorBobMinor: number;
  status: string;
  reasonSummary: string;
}

interface QuoteSelection {
  propertyId: number;
  anchor: string;
  focus: string;
}

// Compact enough that a booking four weeks out is genuinely visible on a
// 1920px dashboard without horizontal scrolling (1309 exposed this edge
// case), while retaining enough width for readable day headers and bars.
const DAY_WIDTH = 48;
// Visual turnover split inside a shared check-out/check-in date: the outgoing
// stay uses 28%, a 10% gap keeps both bookings distinguishable, and the incoming
// stay receives the remaining 62%. This is presentation only; operational
// times and overlap rules remain check-out 11:00 / check-in 14:00.
const CHECKOUT_OFFSET_PX = DAY_WIDTH * 0.28;
const CHECKIN_OFFSET_PX = DAY_WIDTH * 0.38;
// Six weeks keeps near-future OTA bookings visible on first load. The earlier
// 24-day window made successfully imported reservations look missing when
// their arrival fell just beyond the viewport (for example, 16 September
// while viewing from 19 August).
const VISIBLE_DAYS = 42;

const PLATFORM_COLORS: Record<string, { background: string; foreground: string }> = {
  airbnb: { background: "#ff385c", foreground: "#ffffff" },
  "airbnb-block": { background: "transparent", foreground: "#64748b" },
  "deptosbo-block": { background: "transparent", foreground: "#64748b" },
  booking: { background: "#1769aa", foreground: "#ffffff" },
  direct: { background: "#159a73", foreground: "#ffffff" },
  vrbo: { background: "#5b4bc4", foreground: "#ffffff" },
};

function platformLabel(platform: string): string {
  if (platform === "deptosbo-block") return "Bloqueo manual";
  if (platform.endsWith("-block")) return "Bloqueo del canal";
  if (platform === "direct") return "Directa";
  if (platform === "booking") return "Booking";
  if (platform === "airbnb") return "Airbnb";
  return platform;
}

const INVENTORY_ORDER = [
  "Sky Elite 305", "Sky Elite 329", "Sky Elite 331", "Sky Elite 406",
  "Sky Elite 523", "Sky Elite 527", "Sky Elite 528", "Sky Elite 540",
  "Sky Eclipse 1309", "Sky Eclipse 1402", "Sky Eclipse 1409", "Sky Eclipse 1602", "Sky Eclipse 1709",
  "Luxe Suites 104", "Luxe Suites 113", "Luxe Suites 117", "Luxe Suites 204",
  "Luxe Suites 205", "Luxe Suites 316", "Luxe Suites 406",
  "Sky Moon 706", "Sky Luxia 112", "Stanza 8B", "Uptown Nuu 10D", "Uptown Nuu 12D",
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

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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

function mobilePropertyName(propertyName: string): string {
  const unit = propertyName.match(/([0-9]+[A-Za-z]?)$/)?.[1] || propertyName;
  if (unit === "406" && propertyName.startsWith("Sky Elite")) return "Sky 406";
  if (unit === "406" && propertyName.startsWith("Luxe Suites")) return "Luxe 406";
  return unit;
}

function formatRange(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short" });
  return `${formatter.format(start)} → ${formatter.format(end)}`;
}

function formatBolivianos(value: number): string {
  return `Bs ${new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(value)}`;
}

function formatUsdMinor(value: number): string {
  return `USD ${new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)}`;
}

function explainPricingCriterion(criterion: string): { title: string; detail: string } {
  const normalized = criterion.toLocaleLowerCase("es");
  if (normalized.includes("hoy al cierre") || normalized.includes("hoy")) {
    return { title: "La fecha sigue libre hoy", detail: "Se vuelve más competitivo el precio para aumentar la posibilidad de reservarla." };
  }
  if (normalized.includes("último minuto") || normalized.includes("próximos 7 días")) {
    return { title: "La llegada está cerca", detail: "Se ajusta el precio porque quedan pocos días para vender esas noches." };
  }
  if (normalized.includes("alta disponibilidad")) {
    return { title: "Hay muchas opciones disponibles", detail: "Se usa un precio más atractivo para competir con los demás departamentos libres." };
  }
  if (normalized.includes("disponibilidad amplia")) {
    return { title: "Todavía quedan varias opciones", detail: "El precio se mantiene competitivo para mejorar la ocupación." };
  }
  if (normalized.includes("inventario casi agotado") || normalized.includes("baja disponibilidad")) {
    return { title: "Quedan pocos departamentos libres", detail: "La menor disponibilidad permite buscar una tarifa más alta." };
  }
  if (normalized.includes("lunes/martes")) {
    return { title: "Es un día de menor demanda", detail: "Lunes y martes suelen necesitar un precio más competitivo." };
  }
  if (normalized.includes("domingo")) {
    return { title: "Es domingo", detail: "Normalmente tiene menor demanda y el precio se ajusta para facilitar la reserva." };
  }
  if (normalized.includes("fin de semana")) {
    return { title: "Es fin de semana", detail: "La demanda habitual de viernes y sábado permite defender mejor el precio." };
  }
  if (normalized.includes("reserva anticipada")) {
    return { title: "Es una reserva con anticipación", detail: "Todavía hay tiempo para esperar una tarifa más rentable." };
  }
  if (normalized.includes("feriado") || normalized.includes("evento")) {
    return { title: "Hay un feriado o evento relevante", detail: "La demanda esperada para esas fechas permite elevar la tarifa." };
  }
  if (normalized.includes("rotación")) {
    return { title: "Este alojamiento necesita más movimiento", detail: "Se prioriza conseguir una reserva sin bajar del mínimo protegido." };
  }
  if (normalized.includes("histórico superior")) {
    return { title: "Tiene buen desempeño histórico", detail: "Sus reservas anteriores respaldan cobrar una tarifa más alta." };
  }
  if (normalized.includes("ritmo histórico inferior")) {
    return { title: "Se está reservando más lento", detail: "Se vuelve más competitivo frente a propiedades comparables." };
  }
  if (normalized.includes("promociones") || normalized.includes("descuentos")) {
    return { title: "Hay descuentos activos", detail: "El precio bruto se eleva lo necesario para que el ingreso final respete el mínimo." };
  }
  if (normalized.includes("hueco de una noche")) {
    return { title: "Es un espacio libre de una noche", detail: "Se agregan Bs 50 al mínimo para cubrir la limpieza de esa estadía corta." };
  }
  return { title: criterion, detail: "Este dato fue considerado al calcular el precio recomendado." };
}

function selectedRange(selection: QuoteSelection): { start: Date; end: Date } {
  const anchor = dateFromKey(selection.anchor);
  const focus = dateFromKey(selection.focus);
  return anchor <= focus ? { start: anchor, end: focus } : { start: focus, end: anchor };
}

function nightUnavailable(property: MasterCalendarProperty, day: Date): boolean {
  const localDay = startOfLocalDay(day);
  return property.stays.some((stay) => localDay >= startOfLocalDay(stay.start) && localDay < startOfLocalDay(stay.end));
}

function clampSelectionFocus(property: MasterCalendarProperty, anchorKey: string, focusKey: string): string {
  const anchor = dateFromKey(anchorKey);
  const focus = dateFromKey(focusKey);
  const direction = focus >= anchor ? 1 : -1;
  let cursor = anchor;
  let lastAvailable = anchor;
  while (localDateKey(cursor) !== localDateKey(focus)) {
    cursor = addDays(cursor, direction);
    if (nightUnavailable(property, cursor)) break;
    lastAvailable = cursor;
  }
  return localDateKey(lastAvailable);
}

export function MasterCalendar({
  properties,
  loading = false,
  onOpenProperty,
  onOpenReservation,
  onOpenImportedStay,
  onCreateReservation,
  bookingPendingCount = 0,
}: MasterCalendarProps) {
  const today = useMemo(() => startOfLocalDay(), []);
  const [windowStart, setWindowStart] = useState(() => addDays(today, -2));
  const [shadowPrices, setShadowPrices] = useState<ShadowDailyPrice[]>([]);
  const [quoteSelection, setQuoteSelection] = useState<QuoteSelection | null>(null);
  const [quoteDetailsOpen, setQuoteDetailsOpen] = useState(false);
  const dragSelectionRef = useRef<{ propertyId: number; anchor: string } | null>(null);
  const mouseMovedRef = useRef(false);
  const lastPointerTypeRef = useRef<string | null>(null);
  const windowEnd = useMemo(() => addDays(windowStart, VISIBLE_DAYS), [windowStart]);
  const days = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, index) => addDays(windowStart, index)),
    [windowStart],
  );
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pricing/recommendations?start=${localDateKey(windowStart)}&days=${VISIBLE_DAYS}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { prices: [] })
      .then((body) => { if (!cancelled) setShadowPrices(Array.isArray(body.prices) ? body.prices : []); })
      .catch(() => { if (!cancelled) setShadowPrices([]); });
    return () => { cancelled = true; };
  }, [windowStart]);
  const shadowPriceMap = useMemo(
    () => new Map(shadowPrices.map((price) => [`${price.propertyId}:${price.date}`, price])),
    [shadowPrices],
  );

  const orderedProperties = useMemo(() => {
    const order = new Map(INVENTORY_ORDER.map((name, index) => [name, index]));
    return [...properties].sort((a, b) => {
      const ai = order.get(a.name) ?? 999;
      const bi = order.get(b.name) ?? 999;
      return ai - bi || a.name.localeCompare(b.name);
    });
  }, [properties]);

  useEffect(() => {
    const stopDragging = () => { dragSelectionRef.current = null; };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const beginMouseSelection = (property: MasterCalendarProperty, date: string) => {
    dragSelectionRef.current = { propertyId: property.id, anchor: date };
    mouseMovedRef.current = false;
  };

  const extendMouseSelection = (property: MasterCalendarProperty, date: string) => {
    const drag = dragSelectionRef.current;
    if (!drag || drag.propertyId !== property.id) return;
    if (drag.anchor === date) return;
    mouseMovedRef.current = true;
    setQuoteSelection({ propertyId: property.id, anchor: drag.anchor, focus: clampSelectionFocus(property, drag.anchor, date) });
  };

  const tapSelection = (property: MasterCalendarProperty, date: string) => {
    setQuoteDetailsOpen(false);
    setQuoteSelection((current) => {
      if (!current || current.propertyId !== property.id) return { propertyId: property.id, anchor: date, focus: date };
      if (current.anchor !== current.focus) return { propertyId: property.id, anchor: date, focus: date };
      return { ...current, focus: clampSelectionFocus(property, current.anchor, date) };
    });
  };

  const selectedProperty = quoteSelection
    ? orderedProperties.find((property) => property.id === quoteSelection.propertyId) || null
    : null;
  const quoteRange = quoteSelection ? selectedRange(quoteSelection) : null;
  const quoteNights = quoteRange ? dayDiff(quoteRange.end, quoteRange.start) + 1 : 0;
  const quoteRows = useMemo(() => {
    if (!quoteSelection || !quoteRange) return [];
    return Array.from({ length: quoteNights }, (_, index) => {
      const date = addDays(quoteRange.start, index);
      return shadowPriceMap.get(`${quoteSelection.propertyId}:${localDateKey(date)}`) || null;
    });
  }, [quoteNights, quoteRange, quoteSelection, shadowPriceMap]);
  const quoteTotals = useMemo(() => {
    const availableRows = quoteRows.filter((row): row is ShadowDailyPrice => row != null);
    const complete = availableRows.length === quoteRows.length && quoteRows.length > 0;
    const sum = (field: "directBobMinor" | "airbnbUsdMinor" | "bookingUsdMinor") => {
      if (!complete || availableRows.some((row) => row[field] == null)) return null;
      return availableRows.reduce((total, row) => total + (row[field] || 0), 0);
    };
    const criteria = Array.from(new Set(availableRows.flatMap((row) => row.reasonSummary.split(";").map((reason) => reason.trim()).filter(Boolean))));
    return {
      directBobMinor: sum("directBobMinor"),
      airbnbUsdMinor: sum("airbnbUsdMinor"),
      bookingUsdMinor: sum("bookingUsdMinor"),
      floorBobMinor: complete ? availableRows.reduce((total, row) => total + row.floorBobMinor, 0) : null,
      criteria,
      needsReview: availableRows.some((row) => row.status === "needs_review"),
      missingNights: quoteRows.length - availableRows.length,
    };
  }, [quoteRows]);

  const monthFormatter = new Intl.DateTimeFormat("es-BO", { month: "short", year: "numeric" });
  const lastVisibleDay = addDays(windowEnd, -1);
  const monthLabel = windowStart.getMonth() === lastVisibleDay.getMonth()
    ? monthFormatter.format(windowStart)
    : `${monthFormatter.format(windowStart)} – ${monthFormatter.format(lastVisibleDay)}`;
  const quoteCards = [
    {
      label: "Directa",
      note: "Total final en Bs",
      color: "text-emerald-700 dark:text-emerald-300",
      total: quoteTotals.directBobMinor == null ? null : formatBolivianos(quoteTotals.directBobMinor / 100),
      average: quoteTotals.directBobMinor == null || quoteNights === 0 ? null : `${formatBolivianos(quoteTotals.directBobMinor / quoteNights / 100)} / noche`,
    },
    {
      label: "Airbnb",
      note: "Bruto sugerido",
      color: "text-rose-600 dark:text-rose-300",
      total: quoteTotals.airbnbUsdMinor == null ? null : formatUsdMinor(quoteTotals.airbnbUsdMinor),
      average: quoteTotals.airbnbUsdMinor == null || quoteNights === 0 ? null : `${formatUsdMinor(quoteTotals.airbnbUsdMinor / quoteNights)} / noche`,
    },
    {
      label: "Booking",
      note: "Bruto sugerido",
      color: "text-sky-700 dark:text-sky-300",
      total: quoteTotals.bookingUsdMinor == null ? null : formatUsdMinor(quoteTotals.bookingUsdMinor),
      average: quoteTotals.bookingUsdMinor == null || quoteNights === 0 ? null : `${formatUsdMinor(quoteTotals.bookingUsdMinor / quoteNights)} / noche`,
    },
  ];
  const friendlyCriteria = quoteTotals.criteria
    .map(explainPricingCriterion)
    .filter((criterion, index, all) => all.findIndex((item) => item.title === criterion.title) === index)
    .slice(0, 4);

  return (
    <section className="flex min-h-0 flex-1 flex-col [--property-column-width:116px] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-2)] shadow-sm sm:[--property-column-width:184px] lg:[--property-column-width:210px]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-2.5 py-2 sm:px-4 sm:py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[var(--ink)] sm:text-base">Calendario maestro</h2>
            <span className="rounded-full bg-[var(--brand-orange-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-orange)] sm:px-2 sm:text-[11px]">
              <span className="sm:hidden">{properties.length}</span><span className="hidden sm:inline">{properties.length} departamentos</span>
            </span>
            {bookingPendingCount > 0 && (
              <Link
                href="/dashboard?view=booking"
                className="relative flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-black text-white shadow-sm ring-2 ring-amber-500/20 transition-transform hover:scale-105"
                title={`${bookingPendingCount} ${bookingPendingCount === 1 ? "reserva de Booking pendiente" : "reservas de Booking pendientes"}`}
                aria-label={`Abrir Booking: ${bookingPendingCount} ${bookingPendingCount === 1 ? "reserva pendiente" : "reservas pendientes"}`}
              >
                !
                <span className="sr-only">Abrir alertas de Booking</span>
              </Link>
            )}
          </div>
          <p className="mt-0.5 hidden text-xs text-[var(--ink-4)] sm:block">
            Arrastra sobre noches libres para cotizar; en celular toca la primera y la última noche
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)] sm:hidden">Toca noches libres para cotizar</p>
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

      {quoteSelection && selectedProperty && quoteRange && !quoteDetailsOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2 sm:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[var(--ink)]">{selectedProperty.name}</p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--ink-3)]">
              {formatRange(quoteRange.start, addDays(quoteRange.end, 1))} · {quoteNights} {quoteNights === 1 ? "noche" : "noches"} · {quoteCards[0].total || "Calculando"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setQuoteDetailsOpen(true)}
            className="h-8 shrink-0 rounded-lg bg-[var(--brand-teal)] px-3 text-[10px] font-semibold text-white"
          >
            Ver detalle
          </button>
          <button
            type="button"
            onClick={() => setQuoteSelection(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line-2)] text-sm text-[var(--ink-3)]"
            aria-label="Cerrar cotización"
          >
            ×
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
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
                    className={`relative flex h-14 shrink-0 flex-col items-center justify-center border-r border-[var(--line)] ${isToday ? "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-0.5 before:bg-[var(--brand-orange)]" : ""}`}
                    style={{
                      width: DAY_WIDTH,
                      backgroundImage: weekend
                        ? "repeating-linear-gradient(135deg, transparent 0, transparent 6px, rgba(100,116,139,0.09) 6px, rgba(100,116,139,0.09) 7px)"
                        : undefined,
                    }}
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
                  <div className="h-6 border-b border-[var(--line)] bg-[var(--brand-navy)] sm:h-7">
                    <div className="sticky left-0 z-20 flex h-full w-[var(--property-column-width)] items-center border-r border-white/10 bg-[var(--brand-navy)] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/80 sm:px-3 sm:text-[10px]">
                      {building}
                    </div>
                  </div>
                )}
                <div className="flex h-[48px] border-b border-[var(--line-2)] shadow-[inset_0_-1px_0_rgba(100,116,139,0.16)] last:border-b-0">
                  <div className="sticky left-0 z-10 flex w-[var(--property-column-width)] shrink-0 items-center justify-between gap-1.5 border-r border-[var(--line)] bg-[var(--bg-2)] px-2 sm:px-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenProperty(property.id)}
                      className="min-w-0 text-left"
                      title={property.name}
                    >
                      <span className="block truncate text-xs font-semibold text-[var(--ink)] sm:hidden">{mobilePropertyName(property.name)}</span>
                      <span className="hidden truncate text-xs font-semibold text-[var(--ink)] sm:block">{property.name}</span>
                      {property.syncError && <span className="mt-0.5 hidden text-[10px] text-amber-400 sm:block">Error de sincronización</span>}
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
                        // A stay occupies nights in [check-in, check-out).
                        // Therefore the check-out date remains visually free,
                        // even though the bar reaches into its morning.
                        const isOccupiedNight = visibleStays.some((stay) =>
                          !stay.platform.endsWith("-block") &&
                          day >= startOfLocalDay(stay.start) &&
                          day < startOfLocalDay(stay.end),
                        );
                        const isUnavailableNight = nightUnavailable(property, day);
                        const shadowPrice = shadowPriceMap.get(`${property.id}:${localDateKey(day)}`);
                        const isSelectedNight = quoteSelection?.propertyId === property.id && quoteRange != null && day >= quoteRange.start && day <= quoteRange.end;
                        return (
                          <button
                            key={day.toISOString()}
                            type="button"
                            disabled={isUnavailableNight || !shadowPrice}
                            onPointerDown={(event) => {
                              lastPointerTypeRef.current = event.pointerType;
                              if (event.pointerType === "mouse") {
                                beginMouseSelection(property, localDateKey(day));
                              }
                            }}
                            onPointerEnter={() => extendMouseSelection(property, localDateKey(day))}
                            onClick={() => {
                              if (lastPointerTypeRef.current === "mouse") {
                                lastPointerTypeRef.current = null;
                                if (!mouseMovedRef.current) tapSelection(property, localDateKey(day));
                                mouseMovedRef.current = false;
                                return;
                              }
                              tapSelection(property, localDateKey(day));
                            }}
                            className={`relative h-full shrink-0 touch-pan-x touch-pan-y border-r border-[var(--line)] text-left outline-none transition-colors focus-visible:z-[4] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-orange)] disabled:cursor-default ${isOccupiedNight ? "bg-slate-500/[0.14] shadow-[inset_0_1px_0_rgba(148,163,184,0.12),inset_0_-1px_0_rgba(148,163,184,0.12)]" : "hover:bg-[var(--brand-orange-soft)]"} ${isSelectedNight ? "z-[1] bg-[var(--brand-orange-soft)] shadow-[inset_0_0_0_2px_var(--brand-orange)]" : ""} ${isToday ? "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-0.5 before:bg-[var(--brand-orange)]" : ""}`}
                            style={{
                              width: DAY_WIDTH,
                              backgroundImage: weekend && !isOccupiedNight
                                ? "repeating-linear-gradient(135deg, transparent 0, transparent 6px, rgba(100,116,139,0.09) 6px, rgba(100,116,139,0.09) 7px)"
                                : undefined,
                            }}
                            aria-label={shadowPrice?.directBobMinor != null ? `Cotizar ${property.name}, ${localDateKey(day)}, Bs ${Math.round(shadowPrice.directBobMinor / 100)}` : undefined}
                            title={shadowPrice?.directBobMinor != null ? `Seleccionar para cotizar · Bs ${(shadowPrice.directBobMinor / 100).toFixed(0)} · Piso Bs ${(shadowPrice.floorBobMinor / 100).toFixed(0)}${shadowPrice.reasonSummary ? ` · ${shadowPrice.reasonSummary}` : ""}` : undefined}
                          >
                            {!isOccupiedNight && shadowPrice?.directBobMinor != null && (
                              <span className={`absolute inset-x-0 bottom-0.5 z-[1] truncate text-center text-[8px] font-semibold ${isSelectedNight ? "text-[var(--brand-orange)]" : shadowPrice.status === "needs_review" ? "text-amber-600 dark:text-amber-300" : "text-[var(--ink-4)]"}`}>
                                Bs {Math.round(shadowPrice.directBobMinor / 100)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {visibleStays.map((stay, stayIndex) => {
                      const isAvailabilityBlock = stay.platform.endsWith("-block");
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
                            : onOpenImportedStay(property.id, stay)}
                          className={`absolute top-1 h-10 overflow-hidden text-left text-xs font-semibold transition-[filter,box-shadow] focus:outline-none focus:ring-2 focus:ring-[var(--brand-orange)] focus:ring-offset-1 ${
                            isAvailabilityBlock
                              ? "z-[1] rounded-lg border border-dashed border-slate-500/55 bg-slate-500/[0.06] px-2 text-slate-500 shadow-none hover:bg-slate-500/[0.10]"
                              : "z-[2] shadow-sm hover:z-[3] hover:brightness-110 hover:ring-1 hover:ring-inset hover:ring-white/45"
                          } ${
                            stay.extensionOfId
                              ? "rounded-l-sm rounded-r-lg border-l-2 border-dashed border-white/75 pl-1.5 pr-2"
                              : isAvailabilityBlock ? "" : "rounded-lg px-2"
                          } ${(stay.hasOutstandingBalance || stay.hasMissingAirbnbDetails) && !isAvailabilityBlock ? "ring-2 ring-inset ring-amber-300/90" : ""}`}
                          style={{ left, width, backgroundColor: isAvailabilityBlock ? undefined : color.background, color: isAvailabilityBlock ? undefined : color.foreground }}
                          title={`${stay.extensionOfId ? "Extensión de estadía · " : ""}${stay.name} · ${formatRange(stay.start, stay.end)} · ${platformLabel(stay.platform)}${stay.blockReason ? ` · Motivo: ${stay.blockReason}` : ""}${stay.totalPrice != null ? ` · ${stay.currency === "USD" ? `USD ${stay.totalPrice}` : formatBolivianos(stay.totalPrice)}` : ""}`}
                        >
                          {(stay.hasOutstandingBalance || stay.hasMissingAirbnbDetails) && !isAvailabilityBlock && (
                            <span
                              className="absolute right-0 top-0 z-10 flex h-4 w-4 items-center justify-center rounded-bl-md bg-amber-300 text-[9px] font-black leading-none text-amber-950 shadow-sm"
                              title={stay.hasMissingAirbnbDetails ? "Faltan nombre del huésped o monto de Airbnb" : "Saldo pendiente"}
                              aria-label={stay.hasMissingAirbnbDetails ? "Datos de Airbnb incompletos" : "Saldo pendiente"}
                            >
                              !
                            </span>
                          )}
                          <span className={`flex items-center gap-1 truncate text-[12px] leading-5 ${stay.hasOutstandingBalance || stay.hasMissingAirbnbDetails ? "pr-3" : ""}`}>
                            {stay.extensionOfId && (
                              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] leading-none" aria-hidden>↳</span>
                            )}
                            <span className="truncate">{stay.name}</span>
                          </span>
                          <span className="flex items-center justify-between gap-1 text-[10px] font-semibold leading-4 opacity-95">
                            <span className="truncate">{stay.extensionOfId ? "Extensión" : ""}</span>
                            {stay.totalPrice != null && (
                              <span className="shrink-0 text-[11px] font-bold tracking-tight">{stay.currency === "USD" ? `USD ${stay.totalPrice}` : formatBolivianos(stay.totalPrice)}</span>
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

      {quoteSelection && selectedProperty && quoteRange && (
        <aside
          aria-live="polite"
          aria-label="Cotización tentativa"
          className={`fixed inset-x-2 bottom-2 z-50 max-h-[72vh] overflow-y-auto rounded-2xl border border-[var(--line-2)] bg-[var(--bg-2)] p-3 shadow-2xl sm:left-1/2 sm:right-auto sm:block sm:w-[min(920px,calc(100%-32px))] sm:-translate-x-1/2 sm:p-4 ${quoteDetailsOpen ? "block" : "hidden"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">{selectedProperty.name}</p>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {formatRange(quoteRange.start, addDays(quoteRange.end, 1))} · {quoteNights} {quoteNights === 1 ? "noche" : "noches"} · 1–2 huéspedes
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuoteDetailsOpen(false)}
                className="flex h-8 items-center justify-center rounded-full border border-[var(--line-2)] px-2.5 text-[10px] font-semibold text-[var(--ink-3)] sm:hidden"
                aria-label="Minimizar cotización"
              >
                Minimizar
              </button>
              <button
                type="button"
                onClick={() => setQuoteSelection(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--line-2)] text-sm text-[var(--ink-3)] hover:bg-[var(--bg-3)]"
                aria-label="Cerrar cotización"
              >
                ×
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-3">
            {quoteCards.map((card) => (
              <div key={card.label} className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2 sm:p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <span className={`text-[11px] font-semibold sm:text-xs ${card.color}`}>{card.label}</span>
                  <span className="hidden text-[9px] text-[var(--ink-4)] sm:inline">{card.note}</span>
                </div>
                <p className="mt-1 truncate text-sm font-bold text-[var(--ink)] sm:text-lg">{card.total || "Sin cálculo"}</p>
                <p className="mt-0.5 truncate text-[9px] text-[var(--ink-4)] sm:text-[11px]">{card.average || card.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs">
            {quoteTotals.floorBobMinor != null && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
                Mínimo protegido del canal más exigente: {formatBolivianos(quoteTotals.floorBobMinor / 100)}
              </span>
            )}
            {quoteTotals.needsReview && (
              <span className="rounded-full bg-amber-500/10 px-2 py-1 font-medium text-amber-700 dark:text-amber-300">Requiere revisión</span>
            )}
          </div>

          {friendlyCriteria.length > 0 && (
            <div className="mt-3">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {friendlyCriteria.map((criterion) => (
                  <div key={criterion.title} className="rounded-lg bg-[var(--bg-3)] px-2.5 py-2">
                    <p className="text-[10px] font-semibold text-[var(--ink-2)] sm:text-xs">{criterion.title}</p>
                    <p className="mt-0.5 text-[9px] leading-3.5 text-[var(--ink-4)] sm:text-[10px] sm:leading-4">{criterion.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {quoteTotals.missingNights > 0 && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-800 dark:text-amber-200">
              Faltan recomendaciones para {quoteTotals.missingNights} {quoteTotals.missingNights === 1 ? "noche" : "noches"}; el total se mostrará al recalcular precios.
            </p>
          )}
          {quoteNights >= 7 && (
            <p className="mt-2 rounded-lg bg-sky-500/10 px-2.5 py-2 text-[10px] text-sky-800 dark:text-sky-200">
              Cotización preliminar: suma las tarifas diarias. El descuento semanal o mensual todavía no se aplica automáticamente al total.
            </p>
          )}
          {quoteNights === 1 && (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] text-amber-800 dark:text-amber-200">
              <strong>Cotización de una noche:</strong> úsala solamente si esta fecha quedó libre entre dos reservas, o si es hoy y mañana ingresa otro huésped. En esos casos el precio mínimo ya suma Bs 50 para cubrir la limpieza adicional.
            </p>
          )}

          <div className="mt-3 flex justify-end border-t border-[var(--line)] pt-2.5">
            <button
              type="button"
              onClick={() => setQuoteSelection(null)}
              className="h-8 shrink-0 rounded-lg border border-[var(--line-2)] px-3 text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-3)]"
            >
              Limpiar
            </button>
          </div>
        </aside>
      )}

      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] px-4 py-2 text-[10px] text-[var(--ink-4)] sm:flex">
        {[
          ["#ff385c", "Airbnb"], ["transparent", "No disponible"], ["#1769aa", "Booking"], ["#159a73", "Directa"], ["#5b4bc4", "Vrbo"],
        ].map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${label === "No disponible" ? "border border-dashed border-slate-500/70 bg-slate-500/5" : ""}`} style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--ink-4)]/25 text-[10px] text-[var(--ink-3)]">↳</span>
          Extensión
        </span>
        <span className="ml-auto">Check-in 14:00 · Check-out 11:00</span>
      </div>
    </section>
  );
}
