"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RentHomePushControl } from "@/components/renthome-push-control";

type Turnover = {
  id: number;
  name: string;
  scheduled: boolean;
  checkOutTime: string;
  nextArrivalTime: string | null;
  checkoutAt: string | null;
  readyAt: string | null;
};
type Board = { today: string; date: string; rows: Turnover[] };
const groups = [
  { id: "clean", title: "Listos para limpiar", matches: (row: Turnover) => row.checkoutAt && !row.readyAt },
  { id: "wait", title: "Por confirmar salida", matches: (row: Turnover) => !row.checkoutAt },
  { id: "ready", title: "Listos para recibir", matches: (row: Turnover) => row.readyAt },
];
const clock = new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hour12: false });
const formatTime = (value: string) => clock.format(new Date(value));
const button = "min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60";
const api = "/api/renthome-turnovers";

export function RentHomeTurnoverBoard({ supervisor = false }: { supervisor?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const date = params.get("turnoverDate") ?? "";
  const [board, setBoard] = useState<Board | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(api + (date ? "?date=" + encodeURIComponent(date) : ""), { cache: "no-store", signal });
    if (response.status === 403) {
      setDenied(true);
      return;
    }
    if (!response.ok) throw new Error("No se pudo actualizar la agenda.");
    setBoard(await response.json());
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load(controller.signal).catch(() => {
        if (!controller.signal.aborted) setError("No se pudo actualizar la agenda. Intenta de nuevo.");
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function mark(row: Turnover, action: "checkout" | "ready") {
    if (!board || saving !== null) return;
    setSaving(row.id);
    setError("");
    setStatus("");
    try {
      const response = await fetch(api, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: row.id, date: board.date, action }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      await load();
      setStatus(action === "ready" ? row.name + " está listo para recibir." : "Salida confirmada en " + row.name + ".");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(null);
    }
  }

  function changeDate(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("turnoverDate", value);
    else next.delete("turnoverDate");
    setError("");
    setStatus("");
    router.replace("/dashboard?" + next.toString(), { scroll: false });
  }

  if (denied && !supervisor) return null;
  const current = board && (!date || date === board.date) ? board : null;
  return <section id="renthome-turnovers" className="mb-6 rounded-xl border border-[var(--line-2)] bg-[var(--bg-2)] p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Supervisión de limpieza</h1>
        <p className="mt-1 text-sm text-[var(--ink-2)]">
          {current ? current.rows.length + (current.rows.length === 1 ? " salida en la agenda" : " salidas en la agenda") : "Salidas y departamentos listos"}
        </p>
      </div>
      <RentHomePushControl />
    </header>
    <div className="my-5 flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm font-medium">
        Fecha de salida
        <input type="date" value={date || current?.today || ""} onChange={(event) => changeDate(event.target.value)}
          className="min-h-11 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3" />
      </label>
      <button type="button" className={button + " border border-[var(--line-2)]"} onClick={() => changeDate("")}>Hoy</button>
      <button type="button" className={button + " border border-[var(--line-2)]"} onClick={() => {
        setError("");
        void load().catch(() => setError("No se pudo actualizar la agenda."));
      }}>Actualizar</button>
    </div>
    {denied && <p role="alert">La agenda de RentHome requiere que se configure el propietario de la operación.</p>}
    {error && <p role="alert" className="mb-3 text-sm font-semibold">{error}</p>}
    <p role="status" className="text-sm text-[var(--ink-2)]">{status}</p>
    {!current && !denied && !error && <p role="status">Cargando agenda…</p>}
    {current?.rows.length === 0 && <p className="border-t border-[var(--line-2)] py-5">No hay salidas programadas para esta fecha.</p>}
    {current && current.rows.length > 0 && <div className="space-y-5">
      {groups.map((group) => {
        const rows = current.rows.filter(group.matches).sort((a, b) =>
          (a.nextArrivalTime ?? "99:99").localeCompare(b.nextArrivalTime ?? "99:99"));
        return <section key={group.id} aria-labelledby={"turnover-" + group.id}>
          <h2 id={"turnover-" + group.id} className="mb-1 font-semibold">{group.title} <span className="ml-1 tabular-nums text-[var(--ink-2)]">{rows.length}</span></h2>
          <ul className="divide-y divide-[var(--line-2)] border-t border-[var(--line-2)]">
            {rows.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-semibold">{row.name}</p>
                <p className="mt-0.5 text-sm tabular-nums text-[var(--ink-2)]">
                  {row.readyAt ? "Listo a las " + formatTime(row.readyAt)
                    : row.checkoutAt ? "Salió a las " + formatTime(row.checkoutAt)
                    : "Salida prevista " + row.checkOutTime}
                  {row.nextArrivalTime ? " · Entrada el mismo día " + row.nextArrivalTime : ""}
                  {!row.scheduled && !row.readyAt ? " · Revisar cambio de reserva" : ""}
                </p>
              </div>
              {row.scheduled && current.date <= current.today && ((!supervisor && !row.checkoutAt) || (supervisor && row.checkoutAt && !row.readyAt)) &&
                <button type="button" disabled={saving !== null}
                  className={button + " bg-[var(--ink)] text-[var(--bg)] hover:opacity-80"}
                  onClick={() => void mark(row, supervisor ? "ready" : "checkout")}>
                  {saving === row.id ? "Guardando…" : supervisor ? "Marcar listo" : "Confirmar salida"}
                </button>}
            </li>)}
          </ul>
        </section>;
      })}
    </div>}
  </section>;
}
