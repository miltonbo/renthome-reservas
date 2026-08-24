"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type CurrencyTotals = { BOB: number; USD: number };
type ReportData = {
  period: { from: string; to: string };
  policy: { operatedProperties: { deysi: string[]; milton: string[] }; miltonShareBps: number; deysiAdministrationShareBps: number; deysiOwnShareBps: number; bookingCommissionBps: number };
  channelTotals: Record<string, { reservations: number; BOB: number; USD: number }>;
  held: { deysi: CurrencyTotals; milton: CurrencyTotals };
  entitled: { deysi: CurrencyTotals; milton: CurrencyTotals };
  commissions: { deysi: CurrencyTotals; milton: CurrencyTotals };
  transfers: Array<{ from: string; to: string; currency: "BOB" | "USD"; amountMinor: number }>;
  reservations: Array<{ id: number; property: string; guest: string; channel: string; checkIn: string; checkOut: string; nights: number; lodgingAmount: number; lodgingCurrency: string; receivedBOB: number; receivedUSD: number; commissionAmount: number; commissionCurrency: string | null }>;
  performance: Array<{ propertyId: number; property: string; occupiedNights: number; freeNights: number; occupancy: number; averageNightlyBOB: number; averageNightlyUSD: number }>;
  monthlyIncome: Array<{ month: string; BOB: number; USD: number }>;
};

type ReportKind = "management" | "detail" | "performance";
const channelNames: Record<string, string> = { airbnb: "Airbnb", booking: "Booking.com", direct: "Directo", vrbo: "Vrbo" };
const channelColors: Record<string, string> = { airbnb: "#ff385c", booking: "#1677c8", direct: "#10a174", vrbo: "#6654c7" };
const money = (value: number, currency: "BOB" | "USD") => `${currency === "BOB" ? "Bs" : "USD"} ${(value / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
const amount = (value: number, currency: "BOB" | "USD") => `${currency === "BOB" ? "Bs" : "USD"} ${value.toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function FinancialReportsPanel({ propertyId }: { propertyId?: number | null }) {
  const [kind, setKind] = useState<ReportKind>("management");
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const initial = monthRange(new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedPeriod = periodMode === "month" ? monthRange(month) : { from, to };
  const query = useMemo(() => {
    const params = new URLSearchParams(selectedPeriod);
    if (propertyId) params.set("propertyId", String(propertyId));
    return params.toString();
  }, [selectedPeriod.from, selectedPeriod.to, propertyId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/reports/financial?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const moveMonth = (delta: number) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };
  const exportExcel = () => { window.location.href = `/api/reports/financial?${query}&format=xlsx`; };
  const channelRows = data ? Object.entries(data.channelTotals).map(([channel, values]) => ({ channel, label: channelNames[channel] || channel, color: channelColors[channel] || "#7b8794", ...values })) : [];

  return <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-base font-semibold text-[var(--ink)]">Informes financieros</h2><p className="mt-1 text-xs text-[var(--ink-3)]">Conciliación, detalle de reservas y rendimiento para el período seleccionado.</p></div>
      <button type="button" onClick={exportExcel} disabled={loading || !data} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Descargar informe Excel</button>
    </div>

    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
      <div className="flex rounded-lg bg-[var(--bg-3)] p-1 text-xs"><button type="button" onClick={() => setPeriodMode("month")} className={`rounded-md px-3 py-1.5 ${periodMode === "month" ? "bg-[var(--brand-orange)] text-white" : "text-[var(--ink-3)]"}`}>Por mes</button><button type="button" onClick={() => setPeriodMode("range")} className={`rounded-md px-3 py-1.5 ${periodMode === "range" ? "bg-[var(--brand-orange)] text-white" : "text-[var(--ink-3)]"}`}>Rango personalizado</button></div>
      {periodMode === "month" ? <div className="flex items-center gap-1"><button type="button" onClick={() => moveMonth(-1)} className="h-9 w-9 rounded-lg border border-[var(--line-2)]">←</button><input aria-label="Mes del informe" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs"/><button type="button" onClick={() => moveMonth(1)} className="h-9 w-9 rounded-lg border border-[var(--line-2)]">→</button></div> : <><label className="text-[10px] uppercase text-[var(--ink-4)]">Desde<input aria-label="Fecha inicial del informe" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs text-[var(--ink)]" /></label><label className="text-[10px] uppercase text-[var(--ink-4)]">Hasta<input aria-label="Fecha final del informe" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs text-[var(--ink)]" /></label></>}
    </div>

    <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-3)] p-1 text-xs font-semibold">
      {([['management','Gerencial'],['detail','Detallado'],['performance','Rendimiento']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-md px-2 py-2 ${kind === value ? "bg-[var(--bg)] text-[var(--brand-orange)] shadow-sm" : "text-[var(--ink-3)]"}`}>{label}</button>)}
    </div>

    {loading ? <div className="mt-4 h-52 animate-pulse rounded-xl bg-[var(--bg-3)]" /> : !data ? <p className="mt-4 text-sm text-red-400">No se pudo cargar el informe.</p> : <div className="mt-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <IncomeChart title="Ingresos recibidos en Bs" data={data.monthlyIncome} currency="BOB" />
        <IncomeChart title="Ingresos recibidos en USD" data={data.monthlyIncome} currency="USD" />
      </div>
      {kind === "management" && <ManagementReport data={data} channels={channelRows} />}
      {kind === "detail" && <DetailedReport data={data} />}
      {kind === "performance" && <PerformanceReport data={data} />}
    </div>}
  </section>;
}

function IncomeChart({ title, data, currency }: { title: string; data: ReportData["monthlyIncome"]; currency: "BOB" | "USD" }) {
  return <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"><div className="text-xs font-semibold text-[var(--ink)]">{title}</div><div className="mt-2 h-36"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12}/><XAxis dataKey="month" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={(value) => amount(Number(value), currency)} contentStyle={{background:"var(--bg)",border:"1px solid var(--line)"}}/><Bar dataKey={currency} fill={currency === "BOB" ? "#f28c28" : "#1677c8"} radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></div>;
}

function ManagementReport({ data, channels }: { data: ReportData; channels: Array<any> }) {
  return <div className="mt-4 space-y-3"><div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Canal</th><th className="px-3 py-2 text-right">Reservas</th><th className="px-3 py-2 text-right">Total Bs</th><th className="px-3 py-2 text-right">Total USD</th></tr></thead><tbody>{channels.map(row => <tr key={row.channel} className="border-t border-[var(--line)]"><td className="px-3 py-2 font-semibold"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{backgroundColor:row.color}}/>{row.label}</td><td className="px-3 py-2 text-right">{row.reservations}</td><td className="px-3 py-2 text-right">{amount(row.BOB,"BOB")}</td><td className="px-3 py-2 text-right">{amount(row.USD,"USD")}</td></tr>)}</tbody></table></div><div className="grid gap-3 sm:grid-cols-2">{(["deysi","milton"] as const).map(person => <div key={person} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"><div className="font-semibold capitalize">{person}</div><p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">Opera: {data.policy.operatedProperties[person].join(", ") || "Ningún departamento en este alcance"}</p><div className="mt-2 grid grid-cols-2 gap-3 text-xs"><div><span className="text-[var(--ink-4)]">Recibido</span><strong className="mt-1 block">{money(data.held[person].BOB,"BOB")}</strong><strong className="block">{money(data.held[person].USD,"USD")}</strong></div><div><span className="text-[var(--ink-4)]">Le corresponde</span><strong className="mt-1 block">{money(data.entitled[person].BOB,"BOB")}</strong><strong className="block">{money(data.entitled[person].USD,"USD")}</strong></div></div><div className="mt-3 border-t border-[var(--line)] pt-2 text-xs text-[var(--ink-3)]">Comisión Booking a su cargo: <strong>{money(data.commissions[person].BOB,"BOB")}</strong> · <strong>{money(data.commissions[person].USD,"USD")}</strong></div></div>)}</div><div className="rounded-xl bg-[var(--brand-orange-soft)] p-3 text-xs"><div className="font-semibold">Conciliación resultante</div><p className="mt-1 leading-relaxed text-[var(--ink-3)]">Se compara quién recibió cada pago con quién opera el departamento. En propiedades de Milton, el ingreso se distribuye 80% para Milton y 20% para Deysi por administración. En propiedades de Deysi, el 100% le corresponde a ella. La comisión de Booking queda a cargo del operador y se muestra separada para que sea pagada por quien corresponde.</p>{data.transfers.length ? data.transfers.map(item => <div key={`${item.from}-${item.currency}`} className="mt-2 capitalize">{item.from} transfiere a {item.to}: <strong>{money(item.amountMinor,item.currency)}</strong></div>) : <p className="mt-2 text-[var(--ink-3)]">No existen transferencias pendientes para este período.</p>}</div></div>;
}

function DetailedReport({ data }: { data: ReportData }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="min-w-[1050px] w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Departamento</th><th className="px-3 py-2 text-left">Huésped</th><th className="px-3 py-2 text-left">Canal</th><th className="px-3 py-2 text-left">Estadía</th><th className="px-3 py-2 text-right">Noches</th><th className="px-3 py-2 text-right">Reserva</th><th className="px-3 py-2 text-right">Recibido Bs</th><th className="px-3 py-2 text-right">Recibido USD</th><th className="px-3 py-2 text-right">Comisión</th></tr></thead><tbody>{data.reservations.map(item => <tr key={item.id} className="border-t border-[var(--line)]"><td className="px-3 py-2 font-medium">{item.property}</td><td className="px-3 py-2">{item.guest}</td><td className="px-3 py-2">{channelNames[item.channel] || item.channel}</td><td className="px-3 py-2">{item.checkIn} → {item.checkOut}</td><td className="px-3 py-2 text-right">{item.nights}</td><td className="px-3 py-2 text-right">{amount(item.lodgingAmount,item.lodgingCurrency as "BOB"|"USD")}</td><td className="px-3 py-2 text-right">{money(item.receivedBOB,"BOB")}</td><td className="px-3 py-2 text-right">{money(item.receivedUSD,"USD")}</td><td className="px-3 py-2 text-right">{item.commissionCurrency ? money(item.commissionAmount,item.commissionCurrency as "BOB"|"USD") : "—"}</td></tr>)}</tbody></table></div>;
}

function PerformanceReport({ data }: { data: ReportData }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="min-w-[720px] w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Departamento</th><th className="px-3 py-2 text-right">Ocupación</th><th className="px-3 py-2 text-right">Noches ocupadas</th><th className="px-3 py-2 text-right">Noches libres</th><th className="px-3 py-2 text-right">Promedio Bs</th><th className="px-3 py-2 text-right">Promedio USD</th></tr></thead><tbody>{[...data.performance].sort((a,b)=>b.occupancy-a.occupancy).map(item => <tr key={item.propertyId} className="border-t border-[var(--line)]"><td className="px-3 py-2 font-medium">{item.property}</td><td className="px-3 py-2 text-right font-semibold">{(item.occupancy*100).toFixed(1)}%</td><td className="px-3 py-2 text-right">{item.occupiedNights}</td><td className="px-3 py-2 text-right">{item.freeNights}</td><td className="px-3 py-2 text-right">{amount(item.averageNightlyBOB,"BOB")}</td><td className="px-3 py-2 text-right">{amount(item.averageNightlyUSD,"USD")}</td></tr>)}</tbody></table></div>;
}
