"use client";

import { useEffect, useState } from "react";

type CurrencyTotals = { BOB: number; USD: number };
type PersonTotals = { deysi: CurrencyTotals; milton: CurrencyTotals };
type Reconciliation = {
  month: string;
  held: PersonTotals;
  entitled: PersonTotals;
  transfers: Array<{ from: "deysi" | "milton"; to: "deysi" | "milton"; currency: "BOB" | "USD"; amountMinor: number }>;
  commissions: Array<{ liablePerson: "deysi" | "milton"; currency: "BOB" | "USD"; amountMinor: number }>;
  excess: CurrencyTotals;
  observations?: Array<{ reservationId: number; reservationName: string; reason: "active" | "outstanding" }>;
};

const label = (minor: number, currency: "BOB" | "USD") =>
  `${currency === "BOB" ? "Bs" : "USD"} ${(minor / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;

export function ReconciliationPanel() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [rate, setRate] = useState<{ bobPerUsd: number; effectiveDate: string; stale?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/finance/exchange-rate").then((response) => response.ok ? response.json() : null).then(setRate).catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/finance/reconciliation?month=${month}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [month]);

  const commission = (person: "deysi" | "milton", currency: "BOB" | "USD") =>
    data?.commissions.filter((item) => item.liablePerson === person && item.currency === currency)
      .reduce((sum, item) => sum + item.amountMinor, 0) || 0;

  return <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-[var(--ink)]">Conciliación Deysi · Milton</h2><p className="mt-0.5 text-[11px] text-[var(--ink-4)]">Montos recibidos y obligaciones separados por moneda{rate ? ` · Referencia BCB: Bs ${rate.bobPerUsd} por USD (${rate.effectiveDate}${rate.stale ? ", último dato disponible" : ""})` : ""}</p></div>
      <input aria-label="Mes de conciliación" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 text-xs" />
    </div>
    {loading ? <div className="mt-4 h-24 animate-pulse rounded-lg bg-[var(--bg-3)]" /> : data ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["deysi", "milton"] as const).map((person) => <div key={person} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3">
          <div className="font-semibold capitalize text-[var(--ink)]">{person}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><span className="block text-[var(--ink-4)]">Recibido</span><span className="block font-medium">{label(data.held[person].BOB, "BOB")}</span><span className="block font-medium">{label(data.held[person].USD, "USD")}</span></div>
            <div><span className="block text-[var(--ink-4)]">Le corresponde</span><span className="block font-medium">{label(data.entitled[person].BOB, "BOB")}</span><span className="block font-medium">{label(data.entitled[person].USD, "USD")}</span></div>
          </div>
          <div className="mt-2 border-t border-[var(--line)] pt-2 text-[11px] text-[var(--ink-3)]">Comisión Booking: {label(commission(person, "BOB"), "BOB")} · {label(commission(person, "USD"), "USD")}</div>
        </div>)}
      </div>
      <div className="mt-3 rounded-lg bg-[var(--brand-orange-soft)] p-3 text-xs">
        <div className="font-semibold text-[var(--ink)]">Transferencias para conciliar</div>
        {data.transfers.length ? data.transfers.map((transfer) => <div key={`${transfer.from}-${transfer.currency}`} className="mt-1 text-[var(--ink-2)]"><span className="capitalize">{transfer.from}</span> transfiere a <span className="capitalize">{transfer.to}</span>: <strong>{label(transfer.amountMinor, transfer.currency)}</strong></div>) : <p className="mt-1 text-[var(--ink-3)]">No hay transferencias pendientes con los movimientos registrados.</p>}
      </div>
      <div className="mt-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs">
        <div className="font-semibold text-[var(--ink)]">Excedentes recibidos</div>
        <p className="mt-1 text-[var(--ink-2)]"><strong>{label(data.excess?.BOB || 0, "BOB")}</strong> · <strong>{label(data.excess?.USD || 0, "USD")}</strong></p>
        <p className="mt-1 text-[10px] text-[var(--ink-4)]">Sobrepagos conciliables después de descontar la garantía. Ya están incluidos en los montos recibidos; no se suman nuevamente.</p>
      </div>
      {(data.observations?.length || 0) > 0 && <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs"><div className="font-semibold text-[var(--ink)]">Reservas fuera de la conciliación final</div><p className="mt-1 text-[var(--ink-3)]">{data.observations!.length} tramo{data.observations!.length === 1 ? "" : "s"} de Booking/Directo {data.observations!.length === 1 ? "está" : "están"} activo o pendiente de pago. Sus ingresos no afectan las transferencias.</p></div>}
    </> : <p className="mt-4 text-xs text-red-400">No se pudo cargar la conciliación.</p>}
  </section>;
}
