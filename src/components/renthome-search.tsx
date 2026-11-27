"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, Search, Users } from "lucide-react";
import { reservationNights } from "@/lib/reservation-dates";

export type RentHomeDates = { checkIn: string; checkOut: string; guests: string };
const dateForMonth = (month: string, offset: number) => {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
};
const calendarMonth = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("es-BO", { dateStyle: "full", timeZone: "UTC" });
export const rentHomeDateLabel = (value: string) => new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));

export function RentHomeSearch({ dates, today, loading, compact, hasQuote, onChange, onSearch }: {
  dates: RentHomeDates; today: string; loading: boolean; compact?: boolean; hasQuote?: boolean;
  onChange: (dates: RentHomeDates) => void; onSearch: () => void;
}) {
  const [open, setOpen] = useState<"dates" | "guests" | null>(null);
  const [month, setMonth] = useState(dates.checkIn.slice(0, 7) || today.slice(0, 7));
  const [children, setChildren] = useState(0);
  const [feedback, setFeedback] = useState("");
  const container = useRef<HTMLFormElement>(null);
  const datesButton = useRef<HTMLButtonElement>(null);
  const guestsButton = useRef<HTMLButtonElement>(null);
  const dateId = useId();
  const guestId = useId();
  const total = Number(dates.guests);
  const adults = total - children;
  const pickingEnd = !!dates.checkIn && !dates.checkOut;
  const nights = reservationNights(dates.checkIn, dates.checkOut);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(null);
        (open === "dates" ? datesButton : guestsButton).current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function selectDate(day: string) {
    if (pickingEnd && day > dates.checkIn) {
      if (reservationNights(dates.checkIn, day) < 2) {
        setFeedback("Selecciona una salida al menos dos noches después del ingreso.");
        return;
      }
      onChange({ ...dates, checkOut: day });
      setOpen(null);
      datesButton.current?.focus();
    } else {
      onChange({ ...dates, checkIn: day, checkOut: "" });
    }
    setFeedback("");
  }

  function monthGrid(value: string, extra = false) {
    const first = new Date(`${value}-01T12:00:00Z`);
    const count = Math.round((Date.parse(dateForMonth(value, 1) + "-01T12:00:00Z") - first.getTime()) / 86400000);
    const offset = (first.getUTCDay() + 6) % 7;
    return <section className={extra ? "hidden sm:block" : ""} aria-label={calendarMonth.format(first)}>
      <h3 className="mb-3 text-center text-sm font-bold capitalize">{calendarMonth.format(first)}</h3>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-xs text-[var(--rh-muted)]">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((label) => <span key={label} aria-hidden className="py-1">{label}</span>)}
        {Array.from({ length: offset }, (_, index) => <span key={`space-${index}`} aria-hidden />)}
        {Array.from({ length: count }, (_, index) => {
          const day = `${value}-${String(index + 1).padStart(2, "0")}`;
          const endpoint = day === dates.checkIn || day === dates.checkOut;
          const inRange = day > dates.checkIn && day < dates.checkOut;
          return <button key={day} type="button" disabled={day < today} aria-pressed={endpoint}
            aria-label={fullDate.format(new Date(day + "T12:00:00Z"))} onClick={() => selectDate(day)}
            className={`mx-auto grid h-9 w-full max-w-10 place-items-center rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)] disabled:line-through disabled:opacity-35 ${endpoint ? "bg-[var(--rh-brand)] text-white" : inRange ? "bg-[#d5e9f3] text-[var(--rh-ink)]" : "text-[var(--rh-ink)] hover:bg-[var(--rh-tint)]"}`}>{index + 1}</button>;
        })}
      </div>
    </section>;
  }

  const segment = "flex min-h-14 min-w-0 items-center gap-2.5 rounded-lg border border-[var(--rh-line)] bg-[var(--rh-bg)] px-3 py-2 text-left hover:bg-[var(--rh-tint)] focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)]";
  const round = "grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--rh-line)] hover:bg-[var(--rh-tint)] disabled:opacity-35";
  return <form ref={container} className="relative" onSubmit={(event) => {
    event.preventDefault();
    if (!dates.checkIn || !dates.checkOut || nights < 2) {
      setMonth(dates.checkIn.slice(0, 7) || today.slice(0, 7));
      setOpen("dates");
      setFeedback("Selecciona el ingreso y la salida para una estadía de al menos dos noches.");
      return;
    }
    setOpen(null); setFeedback(""); onSearch();
  }}>
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-[1.25fr_1fr_auto]"}`}>
      <button ref={datesButton} type="button" aria-expanded={open === "dates"} aria-controls={open === "dates" ? dateId : undefined} className={segment}
        onClick={() => { if (open !== "dates") setMonth(dates.checkIn.slice(0, 7) || today.slice(0, 7)); setOpen(open === "dates" ? null : "dates"); }}>
        <CalendarDays size={19} aria-hidden className="shrink-0 text-[var(--rh-brand)]" />
        <span className="min-w-0"><span className="block text-sm font-extrabold">Fechas</span><span className="block truncate text-xs text-[var(--rh-muted)] sm:text-sm">{dates.checkIn && dates.checkOut ? `${rentHomeDateLabel(dates.checkIn)} – ${rentHomeDateLabel(dates.checkOut)}` : dates.checkIn ? `${rentHomeDateLabel(dates.checkIn)} · elige salida` : "Ingreso y salida"}</span></span>
      </button>
      <button ref={guestsButton} type="button" aria-expanded={open === "guests"} aria-controls={open === "guests" ? guestId : undefined} className={segment}
        onClick={() => setOpen(open === "guests" ? null : "guests")}>
        <Users size={19} aria-hidden className="shrink-0 text-[var(--rh-brand)]" />
        <span><span className="block text-sm font-extrabold">Huéspedes</span><span className="block text-xs text-[var(--rh-muted)] sm:text-sm">{total} {total === 1 ? "huésped" : "huéspedes"}</span></span>
      </button>
      {!hasQuote && <button disabled={loading} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--rh-brand)] px-5 py-3 font-extrabold text-white hover:bg-[var(--rh-deep)] disabled:opacity-60 ${compact ? "" : "col-span-2 sm:col-span-1 sm:px-7"}`}><Search size={18} aria-hidden /> {compact ? "Consultar disponibilidad" : "Buscar alojamiento"}</button>}
    </div>
    {!hasQuote && <p className="mt-2 text-sm text-[var(--rh-muted)]">{nights >= 2 ? `${nights} noches seleccionadas` : "Estadía mínima de 2 noches."}</p>}
    {open === "dates" && <div id={dateId} className={`z-30 mt-2 w-full rounded-2xl border border-[var(--rh-line)] bg-white p-3 shadow-xl sm:p-4 ${compact ? "relative" : "absolute left-0 top-[3.65rem] max-w-[620px]"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" className={round} aria-label="Mes anterior" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(dateForMonth(month, -1))}><ChevronLeft size={18} aria-hidden /></button>
        <p className="text-center text-sm font-semibold">{pickingEnd ? "Selecciona la salida" : "Selecciona el ingreso"}</p>
        <button type="button" className={round} aria-label="Mes siguiente" onClick={() => setMonth(dateForMonth(month, 1))}><ChevronRight size={18} aria-hidden /></button>
      </div>
      <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>{monthGrid(month)}{!compact && monthGrid(dateForMonth(month, 1), true)}</div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--rh-line)] pt-3 text-sm">
        <button type="button" className="font-semibold underline" onClick={() => { onChange({ ...dates, checkIn: "", checkOut: "" }); setFeedback(""); }}>Limpiar fechas</button>
        <button type="button" className="font-semibold" onClick={() => { setOpen(null); datesButton.current?.focus(); }}>Cerrar</button>
      </div>
      {feedback && <p role="status" className="mt-2 text-sm text-[#904910]">{feedback}</p>}
    </div>}
    {open === "guests" && <div id={guestId} className={`z-30 mt-2 w-full space-y-3 rounded-2xl border border-[var(--rh-line)] bg-white p-4 shadow-xl ${compact ? "relative" : "absolute right-0 top-[3.65rem] sm:max-w-[340px]"}`}>
      {([["Adultos", "13 años o más", adults, 1], ["Niños", "De 2 a 12 años", children, 0]] as const).map(([label, hint, count, min]) => <div key={label} className="flex items-center justify-between gap-3">
        <div><p className="font-semibold">{label}</p><p className="text-sm text-[var(--rh-muted)]">{hint}</p></div>
        <div className="flex items-center gap-2">
          {[-1, 0, 1].map((delta) => delta === 0 ? <span key={delta} className="w-5 text-center tabular-nums">{count}</span> : <button key={delta} type="button" className={round}
            aria-label={`${delta < 0 ? "Quitar" : "Agregar"} ${label.toLowerCase()}`} disabled={delta < 0 ? count <= min : total >= 50}
            onClick={() => { if (label === "Niños") setChildren(children + delta); onChange({ ...dates, guests: String(total + delta) }); }}>
            {delta < 0 ? <Minus size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          </button>)}
        </div>
      </div>)}
      <div className="flex justify-end border-t border-[var(--rh-line)] pt-2"><button type="button" className="font-semibold" onClick={() => { setOpen(null); guestsButton.current?.focus(); }}>Listo</button></div>
    </div>}
  </form>;
}
