"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";

interface DateSliderProps {
  checkIn: string;
  checkOut: string;
  onChangeCheckIn: (date: string) => void;
  onChangeCheckOut: (date: string) => void;
  compact?: boolean;
  // RT-25.6 tick 8 — set of YYYY-MM-DD dates already covered by an
  // existing reservation or synced calendar event on the property the
  // host picked in the form. Occupied nights are visually marked and
  // cannot be selected. A booked check-in day may still be used as the
  // preceding stay's check-out boundary when every earlier night is free.
  bookedDates?: ReadonlySet<string>;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function canSelectCalendarDate(
  dateStr: string,
  selecting: "in" | "out",
  checkIn: string,
  bookedDates?: ReadonlySet<string>,
): boolean {
  if (!bookedDates) return true;
  if (selecting !== "out" || !checkIn || dateStr <= checkIn) {
    return !bookedDates.has(dateStr);
  }

  // The selected date is an exclusive check-out boundary. It is valid even
  // when another guest checks in that day, provided none of this stay's
  // actual nights [checkIn, dateStr) are occupied.
  const cursor = new Date(`${checkIn}T12:00:00`);
  const end = new Date(`${dateStr}T12:00:00`);
  while (cursor < end) {
    if (bookedDates.has(toDateStr(cursor))) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

function nightCountLabel(count: number, locale: Locale): string {
  const labels: Record<Locale, [string, string]> = {
    en: ["night", "nights"],
    es: ["noche", "noches"],
    ru: ["ночь", "ночей"],
    de: ["Nacht", "Nächte"],
    fr: ["nuit", "nuits"],
  };
  return `${count} ${count === 1 ? labels[locale][0] : labels[locale][1]}`;
}

const DATE_LOCALES: Record<Locale, string> = {
  en: "en-GB", es: "es-BO", ru: "ru-RU", de: "de-DE", fr: "fr-FR",
};

const CALENDAR_COPY: Record<Locale, { in: string; out: string; manual: string; calendar: string; done: string; select: string; selectDates: string; occupied: string }> = {
  en: { in: "In", out: "Out", manual: "Manual", calendar: "Calendar", done: "Done", select: "Select", selectDates: "Select dates", occupied: "Occupied" },
  es: { in: "Entrada", out: "Salida", manual: "Manual", calendar: "Calendario", done: "Listo", select: "Seleccionar", selectDates: "Seleccionar fechas", occupied: "Ocupado" },
  ru: { in: "Заезд", out: "Выезд", manual: "Вручную", calendar: "Календарь", done: "Готово", select: "Выбрать", selectDates: "Выбрать даты", occupied: "Занято" },
  de: { in: "Anreise", out: "Abreise", manual: "Manuell", calendar: "Kalender", done: "Fertig", select: "Auswählen", selectDates: "Daten auswählen", occupied: "Belegt" },
  fr: { in: "Arrivée", out: "Départ", manual: "Manuel", calendar: "Calendrier", done: "Terminé", select: "Choisir", selectDates: "Choisir les dates", occupied: "Occupé" },
};

function CalendarGrid({
  checkIn,
  checkOut,
  onChangeCheckIn,
  onChangeCheckOut,
  onDone,
  bookedDates,
}: {
  checkIn: string;
  checkOut: string;
  onChangeCheckIn: (date: string) => void;
  onChangeCheckOut: (date: string) => void;
  onDone?: () => void;
  bookedDates?: ReadonlySet<string>;
}) {
  const { locale } = useI18n();
  const copy = CALENDAR_COPY[locale];
  const [selecting, setSelecting] = useState<"in" | "out">(
    !checkIn ? "in" : !checkOut ? "out" : "in"
  );
  const [showClassic, setShowClassic] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Build months to display (current month and next month)
  const months = useMemo(() => {
    const m1 = new Date(today.getFullYear(), today.getMonth(), 1);
    const m2 = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return [m1, m2];
  }, [today]);

  const handleDayClick = (dateStr: string) => {
    setHoverDate(null);
    if (selecting === "in") {
      onChangeCheckIn(dateStr);
      onChangeCheckOut("");
      setSelecting("out");
    } else {
      if (checkIn && dateStr < checkIn) {
        onChangeCheckIn(dateStr);
        onChangeCheckOut(checkIn);
        onDone?.();
      } else {
        onChangeCheckOut(dateStr);
        if (checkIn && dateStr > checkIn) onDone?.();
      }
      setSelecting("in");
    }
  };

  const isInRange = (dateStr: string) => {
    if (!checkIn || !checkOut) return false;
    return dateStr > checkIn && dateStr < checkOut;
  };

  const previewEnd = selecting === "out" && checkIn && hoverDate && hoverDate > checkIn &&
    canSelectCalendarDate(hoverDate, "out", checkIn, bookedDates)
      ? hoverDate
      : null;

  const isInPreviewRange = (dateStr: string) =>
    Boolean(previewEnd && dateStr >= checkIn && dateStr < previewEnd);

  const dayCount = () => {
    if (!checkIn || !checkOut) return 0;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    return Math.max(0, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  };

  const formatSelected = (d: string) => {
    if (!d) return "—";
    return new Date(`${d}T12:00:00`).toLocaleDateString(DATE_LOCALES[locale], { day: "2-digit", month: "short" });
  };

  if (showClassic) {
    return (
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <span className="w-14 text-xs text-[var(--ink-3)]">{copy.in}</span>
          <input type="date" value={checkIn} onChange={(e) => onChangeCheckIn(e.target.value)}
            className="h-8 flex-1 rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-14 text-xs text-[var(--ink-3)]">{copy.out}</span>
          <input type="date" value={checkOut} onChange={(e) => onChangeCheckOut(e.target.value)}
            className="h-8 flex-1 rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]" />
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setShowClassic(false)} className="text-xs text-[var(--ink)] hover:underline">
            {copy.calendar}
          </button>
          {onDone && checkIn && checkOut && (
            <button type="button" onClick={onDone} className="rounded-md bg-[var(--m-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--m-accent-2)]">
              {copy.done}
            </button>
          )}
        </div>
      </div>
    );
  }

  const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(DATE_LOCALES[locale], { weekday: "short" })
      .format(new Date(2024, 0, 1 + index)).replace(".", "").slice(0, 2),
  );

  return (
    <div className="p-3">
      {/* Status bar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelecting("in")}
            className={`rounded-md px-2.5 py-1 text-xs transition-all ${
              selecting === "in"
                ? "bg-[var(--ink)]/15 text-[var(--ink)] ring-1 ring-[var(--ink)]/30"
                : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            }`}
          >
            {copy.in}: {formatSelected(checkIn)}
          </button>
          <span className="text-[var(--ink-4)]">→</span>
          <button
            type="button"
            onClick={() => setSelecting("out")}
            className={`rounded-md px-2.5 py-1 text-xs transition-all ${
              selecting === "out"
                ? "bg-[var(--ink)]/15 text-[var(--ink)] ring-1 ring-[var(--ink)]/30"
                : "text-[var(--ink-3)] hover:text-[var(--ink-2)]"
            }`}
          >
            {copy.out}: {formatSelected(checkOut)}
          </button>
          {checkIn && checkOut && (
            <span className="text-xs text-emerald-500">{nightCountLabel(dayCount(), locale)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowClassic(true)} className="text-xs text-[var(--ink)] hover:underline">
            {copy.manual}
          </button>
          {onDone && checkIn && checkOut && (
            <button type="button" onClick={onDone} className="rounded-md bg-[var(--m-accent)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--m-accent-2)]">
              {copy.done}
            </button>
          )}
        </div>
      </div>

      {/* Calendar grids */}
      <div className="flex gap-4 overflow-x-auto" onMouseLeave={() => setHoverDate(null)}>
        {months.map((monthStart) => {
          const year = monthStart.getFullYear();
          const month = monthStart.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();

          // Monday = 0 offset
          let firstDayOffset = new Date(year, month, 1).getDay() - 1;
          if (firstDayOffset < 0) firstDayOffset = 6;

          const cells: (Date | null)[] = [];
          for (let i = 0; i < firstDayOffset; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

          const monthLabel = monthStart.toLocaleDateString(DATE_LOCALES[locale], { month: "long", year: "numeric" });

          return (
            <div key={monthLabel} className="min-w-[210px] flex-1">
              <div className="mb-2 text-center text-xs font-medium text-[var(--ink)]">
                {monthLabel}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((wd) => (
                  <div key={wd} className="py-1 text-center text-xs text-[var(--ink-4)]">
                    {wd}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={`empty-${i}`} />;

                  const dateStr = toDateStr(d);
                  const isToday = d.getTime() === today.getTime();
                  const isStart = dateStr === checkIn;
                  const isEnd = dateStr === checkOut;
                  const inRange = isInRange(dateStr);
                  const inPreviewRange = isInPreviewRange(dateStr);
                  const isPreviewEnd = dateStr === previewEnd;
                  const isBooked = bookedDates?.has(dateStr) ?? false;
                  const canSelect = canSelectCalendarDate(dateStr, selecting, checkIn, bookedDates);

                  // Dim dates more than 3 days in the past
                  const threeDaysAgo = new Date(today);
                  threeDaysAgo.setDate(threeDaysAgo.getDate() - 4);
                  const isPast = d < threeDaysAgo;

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={isPast || !canSelect}
                      onClick={() => handleDayClick(dateStr)}
                      onMouseEnter={() => canSelect && setHoverDate(dateStr)}
                      aria-label={`${dateStr}${isBooked ? ` · ${copy.occupied}` : ""}`}
                      title={isBooked ? (canSelect ? "Ocupado desde este día; disponible como salida" : "Ocupado por una reserva") : undefined}
                      className={`relative flex h-8 items-center justify-center rounded-md text-xs transition-all ${
                        isPast
                          ? "text-[var(--ink-4)] cursor-not-allowed"
                          : isStart || isEnd
                          ? "bg-sky-600 text-white font-semibold ring-1 ring-inset ring-sky-300/60"
                          : isPreviewEnd
                          ? "bg-sky-500/25 text-sky-100 font-semibold ring-1 ring-inset ring-sky-400"
                          : inPreviewRange
                          ? "bg-sky-500/20 text-sky-200"
                          : inRange
                          ? "bg-sky-500/20 text-sky-200"
                          : isBooked && !canSelect
                          ? "cursor-not-allowed bg-slate-500/25 text-slate-500 ring-1 ring-inset ring-slate-500/25"
                          : isBooked
                          ? "bg-slate-500/20 text-slate-400 ring-1 ring-inset ring-slate-500/25 hover:bg-sky-500/20 hover:text-sky-200 hover:ring-sky-400"
                          : isToday
                          ? "text-[var(--ink)] ring-1 ring-[var(--ink)]/40"
                          : "text-[var(--ink-2)] hover:bg-[var(--bg-3)]"
                      }`}
                    >
                      {d.getDate()}
                      {isToday && !isStart && !isEnd && (
                        <span className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-[var(--ink)]" />
                      )}
                      {isBooked && (
                        <span className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Popover version — renders a portal floating next to the trigger
function CalendarPopover({
  anchorRef,
  checkIn,
  checkOut,
  onChangeCheckIn,
  onChangeCheckOut,
  onClose,
  bookedDates,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  checkIn: string;
  checkOut: string;
  onChangeCheckIn: (date: string) => void;
  onChangeCheckOut: (date: string) => void;
  onClose: () => void;
  bookedDates?: ReadonlySet<string>;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 480 });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      const estimatedHeight = 340;
      const below = rect.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight
        ? below
        : Math.max(8, rect.top - estimatedHeight - 8);
      setPos({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed isolate z-[70] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground opacity-100 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-black/10"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <CalendarGrid
        checkIn={checkIn}
        checkOut={checkOut}
        onChangeCheckIn={onChangeCheckIn}
        onChangeCheckOut={onChangeCheckOut}
        onDone={onClose}
        bookedDates={bookedDates}
      />
    </div>,
    document.body
  );
}

export function DateSlider({
  checkIn,
  checkOut,
  onChangeCheckIn,
  onChangeCheckOut,
  compact = false,
  bookedDates,
}: DateSliderProps) {
  const { locale } = useI18n();
  const copy = CALENDAR_COPY[locale];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const formatDate = (d: string) => {
    if (!d) return copy.select;
    return new Date(`${d}T12:00:00`).toLocaleDateString(DATE_LOCALES[locale], { day: "2-digit", month: "short" });
  };

  const dayCount = useCallback(() => {
    if (!checkIn || !checkOut) return 0;
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    return Math.max(0, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, [checkIn, checkOut]);

  if (compact) {
    // Sidebar mode — show compact trigger button, open popover
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(!open)}
          className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition-all ${
            open
              ? "border-[var(--ink)] bg-[var(--ink)]/5"
              : "border-[var(--line-2)] bg-[var(--bg)] hover:border-[var(--ink-4)]"
          }`}
        >
          <div className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span className="text-xs text-[var(--ink-2)]">
              {checkIn && checkOut
                ? `${formatDate(checkIn)} — ${formatDate(checkOut)}`
                : checkIn
                ? `${formatDate(checkIn)} — ...`
                : copy.selectDates}
            </span>
          </div>
          {checkIn && checkOut && (
            <span className="text-xs text-emerald-500">{nightCountLabel(dayCount(), locale)}</span>
          )}
        </button>
        {open && (
          <CalendarPopover
            anchorRef={triggerRef}
            checkIn={checkIn}
            checkOut={checkOut}
            onChangeCheckIn={onChangeCheckIn}
            onChangeCheckOut={onChangeCheckOut}
            onClose={() => setOpen(false)}
            bookedDates={bookedDates}
          />
        )}
      </>
    );
  }

  // Inline mode for edit forms in main content
  return (
    <div className="rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)]">
      <CalendarGrid
        checkIn={checkIn}
        checkOut={checkOut}
        onChangeCheckIn={onChangeCheckIn}
        onChangeCheckOut={onChangeCheckOut}
        bookedDates={bookedDates}
      />
    </div>
  );
}
