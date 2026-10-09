"use client";

import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type CurrencyTotals = { BOB: number; USD: number };
type ReportData = {
  period: { from: string; to: string };
  policy: { operatedProperties: { deysi: string[]; milton: string[] }; ownerFeeProperties: Array<{ name: string; feeBps: number; fixedFeeMinor: number; fixedFeeCurrency: "BOB" | "USD"; beneficiary: string }>; miltonShareBps: number; deysiAdministrationShareBps: number; deysiOwnShareBps: number; bookingCommissionBps: number };
  channelTotals: Record<string, { reservations: number; BOB: number; USD: number }>;
  received: { deysi: CurrencyTotals; milton: CurrencyTotals };
  held: { deysi: CurrencyTotals; milton: CurrencyTotals };
  entitled: { deysi: CurrencyTotals; milton: CurrencyTotals };
  commissions: { deysi: CurrencyTotals; milton: CurrencyTotals; owner: CurrencyTotals };
  commissionReimbursements: Array<{ reservationId: number; reservationName: string; physicalProperty: string; originalProperty: string; from: "deysi" | "milton"; to: "deysi" | "milton"; currency: "BOB" | "USD"; amountMinor: number }>;
  ownerPayable: CurrencyTotals;
  ownerSettlements: Array<{ propertyId: number; property: string; gross: CurrencyTotals; management: CurrencyTotals; payable: CurrencyTotals; bookingCommission: CurrencyTotals; reservationsWithFixedFee: number }>;
  transfers: Array<{ from: "deysi" | "milton" | "owner"; to: "deysi" | "milton" | "owner"; currency: "BOB" | "USD"; amountMinor: number }>;
  reservations: Array<{ id: number; property: string; guest: string; channel: string; checkIn: string; checkOut: string; nights: number; lodgingAmount: number; lodgingCurrency: string; receivedBOB: number; receivedUSD: number; commissionBOB: number; commissionUSD: number; reconciliationStatus: "included" | "outstanding" }>;
  blockedPeriods: Array<{ propertyId: number; property: string; checkIn: string; checkOut: string; nights: number; reason: string }>;
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

export function FinancialReportsPanel({ propertyId, properties }: { propertyId?: number | null; properties: Array<{ id: number; name: string }> }) {
  const [kind, setKind] = useState<ReportKind>("management");
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const initial = monthRange(new Date().toISOString().slice(0, 7));
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportPropertyId, setReportPropertyId] = useState(propertyId ? String(propertyId) : "");
  const [administrationDialogOpen, setAdministrationDialogOpen] = useState(false);
  const [administrationExchangeRate, setAdministrationExchangeRate] = useState("");

  const selectedPeriod = useMemo(
    () => periodMode === "month" ? monthRange(month) : { from, to },
    [periodMode, month, from, to],
  );
  const query = useMemo(() => {
    const params = new URLSearchParams(selectedPeriod);
    if (reportPropertyId) params.set("propertyId", reportPropertyId);
    return params.toString();
  }, [selectedPeriod, reportPropertyId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading must reset immediately when the report query changes
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
  const selectedProperty = properties.find((item) => String(item.id) === reportPropertyId);
  const administrationProperty = selectedProperty && data?.policy.ownerFeeProperties.some((policy) => policy.name === selectedProperty.name)
    ? selectedProperty
    : null;
  const exportAdministration = () => {
    if (!administrationProperty) return;
    const exchangeRate = Number(administrationExchangeRate.replace(",", "."));
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) return;
    const params = new URLSearchParams(selectedPeriod);
    params.set("propertyId", String(administrationProperty.id));
    params.set("format", "administration");
    params.set("exchangeRate", String(exchangeRate));
    setAdministrationDialogOpen(false);
    window.location.href = `/api/reports/financial?${params.toString()}`;
  };
  const parsedAdministrationExchangeRate = Number(administrationExchangeRate.replace(",", "."));
  const validAdministrationExchangeRate = Number.isFinite(parsedAdministrationExchangeRate) && parsedAdministrationExchangeRate > 0;
  const channelRows = data ? Object.entries(data.channelTotals).map(([channel, values]) => ({ channel, label: channelNames[channel] || channel, color: channelColors[channel] || "#7b8794", ...values })) : [];

  return <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-2)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-base font-semibold text-[var(--ink)]">Informes financieros</h2><p className="mt-1 text-xs text-[var(--ink-3)]">Conciliación, detalle de reservas y rendimiento para el período seleccionado.</p></div>
      <div className="flex flex-wrap gap-2">
        {administrationProperty && <button type="button" onClick={() => setAdministrationDialogOpen(true)} disabled={loading || !data} className="rounded-lg border border-[var(--brand-orange)] bg-[var(--bg)] px-4 py-2 text-xs font-semibold text-[var(--brand-orange)] disabled:opacity-50">Descargar reporte administración</button>}
        <button type="button" onClick={exportExcel} disabled={loading || !data} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Descargar informe Excel</button>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
      <label className="min-w-[210px] text-[10px] uppercase text-[var(--ink-4)]">Departamento del informe<select aria-label="Departamento del informe" value={reportPropertyId} onChange={(event) => setReportPropertyId(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs text-[var(--ink)]"><option value="">Todos los departamentos</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="flex rounded-lg bg-[var(--bg-3)] p-1 text-xs"><button type="button" onClick={() => setPeriodMode("month")} className={`rounded-md px-3 py-1.5 ${periodMode === "month" ? "bg-[var(--brand-orange)] text-white" : "text-[var(--ink-3)]"}`}>Por mes</button><button type="button" onClick={() => setPeriodMode("range")} className={`rounded-md px-3 py-1.5 ${periodMode === "range" ? "bg-[var(--brand-orange)] text-white" : "text-[var(--ink-3)]"}`}>Rango personalizado</button></div>
      {periodMode === "month" ? <div className="flex items-center gap-1"><button type="button" onClick={() => moveMonth(-1)} className="h-9 w-9 rounded-lg border border-[var(--line-2)]">←</button><input aria-label="Mes del informe" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs"/><button type="button" onClick={() => moveMonth(1)} className="h-9 w-9 rounded-lg border border-[var(--line-2)]">→</button></div> : <><label className="text-[10px] uppercase text-[var(--ink-4)]">Desde<input aria-label="Fecha inicial del informe" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs text-[var(--ink)]" /></label><label className="text-[10px] uppercase text-[var(--ink-4)]">Hasta<input aria-label="Fecha final del informe" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block h-9 rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] px-3 text-xs text-[var(--ink)]" /></label></>}
    </div>

    <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-3)] p-1 text-xs font-semibold">
      {([['management','Gerencial'],['detail','Detallado'],['performance','Rendimiento']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setKind(value)} className={`rounded-md px-2 py-2 ${kind === value ? "bg-[var(--bg)] text-[var(--brand-orange)] shadow-sm" : "text-[var(--ink-3)]"}`}>{label}</button>)}
    </div>

    {loading ? <div className="mt-4 h-52 animate-pulse rounded-xl bg-[var(--bg-3)]" /> : !data ? <p className="mt-4 text-sm text-red-400">No se pudo cargar el informe.</p> : <div className="mt-4">
      {kind === "management" && <div className="grid gap-3 lg:grid-cols-2">
        <ReceivedByPie title="Montos recibidos en Bs" totals={data.received} currency="BOB" />
        <ReceivedByPie title="Montos recibidos en USD" totals={data.received} currency="USD" />
      </div>}
      {kind === "management" && <><ManagementReport data={data} channels={channelRows} /><BookingReassignmentAdjustments items={data.commissionReimbursements} /></>}
      {kind === "detail" && <DetailedReport data={data} />}
      {kind === "performance" && <PerformanceReport data={data} />}
    </div>}

    {administrationDialogOpen && administrationProperty && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdministrationDialogOpen(false); }}>
      <form onSubmit={(event) => { event.preventDefault(); exportAdministration(); }} role="dialog" aria-modal="true" aria-labelledby="administration-report-title" className="w-full max-w-md rounded-2xl border border-[var(--line-2)] bg-[var(--bg)] p-5 shadow-2xl">
        <h3 id="administration-report-title" className="text-base font-semibold text-[var(--ink)]">Reporte de administración</h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">Ingresa el tipo de cambio USD a Bs que se aplicará al reporte de {administrationProperty.name}. Todos los cálculos y totales se generarán en bolivianos.</p>
        <label className="mt-4 block text-xs font-semibold text-[var(--ink-2)]">Tipo de cambio USD/BOB
          <div className="mt-1 flex items-center rounded-lg border border-[var(--line-2)] bg-[var(--bg-2)] focus-within:border-[var(--brand-orange)]">
            <span className="px-3 text-xs text-[var(--ink-4)]">Bs</span>
            <input autoFocus inputMode="decimal" type="text" value={administrationExchangeRate} onChange={(event) => setAdministrationExchangeRate(event.target.value)} placeholder="Ej. 6,96" className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-[var(--ink)] outline-none" />
          </div>
        </label>
        {administrationExchangeRate && !validAdministrationExchangeRate && <p className="mt-2 text-xs text-red-500">Ingresa un tipo de cambio mayor a cero.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setAdministrationDialogOpen(false)} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-xs font-semibold text-[var(--ink-2)]">Cancelar</button>
          <button type="submit" disabled={!validAdministrationExchangeRate} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Generar reporte</button>
        </div>
      </form>
    </div>}
  </section>;
}

function ReceivedByPie({ title, totals, currency }: { title: string; totals: ReportData["received"]; currency: "BOB" | "USD" }) {
  const data = [
    { name: "Deysi", value: totals.deysi[currency], color: "#16b8a6" },
    { name: "Milton", value: totals.milton[currency], color: "#f28c28" },
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <div className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
    <div className="text-xs font-semibold text-[var(--ink)]">{title}</div>
    <div className="mt-2 h-44 min-w-0">{total > 0 ? <ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={38} outerRadius={68} paddingAngle={2}>{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value) => money(Number(value), currency)} contentStyle={{background:"var(--bg)",border:"1px solid var(--line)"}} /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-[var(--ink-4)]">Sin ingresos recibidos</div>}</div>
    <div className="border-t border-[var(--line)] pt-2 text-center text-xs text-[var(--ink-3)]">Total recibido <strong className="ml-1 text-sm text-[var(--ink)]">{money(total, currency)}</strong></div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">{data.map((item) => <div key={item.name}><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} /> <span className="text-[var(--ink-3)]">{item.name}</span><strong className="ml-1 text-[var(--ink)]">{money(item.value, currency)}</strong>{total > 0 && <span className="ml-1 text-[10px] text-[var(--ink-4)]">({((item.value / total) * 100).toFixed(1)}%)</span>}</div>)}</div>
  </div>;
}

function BookingReassignmentAdjustments({ items }: { items: ReportData["commissionReimbursements"] }) {
  if (!items.length) return null;
  return <div className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-3 text-xs">
    <div className="font-semibold">Ajustes por reasignaciones de Booking</div>
    <p className="mt-1 text-[var(--ink-3)]">El operador del departamento físico reembolsa la comisión a quien administra el anuncio original de Booking.</p>
    {items.map((item) => <div key={item.reservationId} className="mt-2">
      <strong>{item.reservationName}</strong> · anuncio {item.originalProperty} → estadía física {item.physicalProperty}: <span className="capitalize">{item.from}</span> entrega a <span className="capitalize">{item.to}</span> <strong>{money(item.amountMinor, item.currency)}</strong>
    </div>)}
  </div>;
}

function ManagementReport({ data, channels }: { data: ReportData; channels: Array<{ channel: string; label: string; color: string; reservations: number; BOB: number; USD: number }> }) {
  const party = (value: string) => value === "owner" ? "propietario" : value;
  return <div className="mt-4 space-y-3"><div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Canal</th><th className="px-3 py-2 text-right">Reservas</th><th className="px-3 py-2 text-right">Total Bs</th><th className="px-3 py-2 text-right">Total USD</th></tr></thead><tbody>{channels.map(row => <tr key={row.channel} className="border-t border-[var(--line)]"><td className="px-3 py-2 font-semibold"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{backgroundColor:row.color}}/>{row.label}</td><td className="px-3 py-2 text-right">{row.reservations}</td><td className="px-3 py-2 text-right">{amount(row.BOB,"BOB")}</td><td className="px-3 py-2 text-right">{amount(row.USD,"USD")}</td></tr>)}</tbody></table></div><div className="grid gap-3 sm:grid-cols-2">{(["deysi","milton"] as const).map(person => <div key={person} className="rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3"><div className="font-semibold capitalize">{person}</div><p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">Opera: {data.policy.operatedProperties[person].join(", ") || "Ningún departamento en este alcance"}</p><div className="mt-2 grid grid-cols-2 gap-3 text-xs"><div><span className="text-[var(--ink-4)]">Recibido</span><strong className="mt-1 block">{money(data.held[person].BOB,"BOB")}</strong><strong className="block">{money(data.held[person].USD,"USD")}</strong></div><div><span className="text-[var(--ink-4)]">Le corresponde</span><strong className="mt-1 block">{money(data.entitled[person].BOB,"BOB")}</strong><strong className="block">{money(data.entitled[person].USD,"USD")}</strong></div></div><div className="mt-3 border-t border-[var(--line)] pt-2 text-xs text-[var(--ink-3)]">Comisión Booking a su cargo: <strong>{money(data.commissions[person].BOB,"BOB")}</strong> · <strong>{money(data.commissions[person].USD,"USD")}</strong></div></div>)}</div>{data.policy.ownerFeeProperties.map(policy => { const settlement=data.ownerSettlements.find(item=>item.property===policy.name); return <div key={policy.name} className="rounded-xl border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs"><div className="font-semibold text-[var(--ink)]">Contrato con propietario · {policy.name}</div><p className="mt-1 text-[var(--ink-3)]">Administración para {party(policy.beneficiary)}: {(policy.feeBps/100).toLocaleString("es-BO")}% del dinero recibido + {money(policy.fixedFeeMinor,policy.fixedFeeCurrency)} por reserva. El 100% cobrado debe quedar bajo custodia de {party(policy.beneficiary)}; luego esa persona paga al propietario el saldo indicado abajo.</p>{settlement&&<div className="mt-2 grid gap-2 sm:grid-cols-3"><div>Cobrado<br/><strong>{money(settlement.gross.BOB,"BOB")} · {money(settlement.gross.USD,"USD")}</strong></div><div>Administración<br/><strong>{money(settlement.management.BOB,"BOB")} · {money(settlement.management.USD,"USD")}</strong></div><div>Pago posterior al propietario<br/><strong>{money(settlement.payable.BOB,"BOB")} · {money(settlement.payable.USD,"USD")}</strong></div></div>}<div className="mt-2 text-[var(--ink-3)]">Comisión Booking del propietario: {money(settlement?.bookingCommission.BOB||0,"BOB")} · {money(settlement?.bookingCommission.USD||0,"USD")}</div></div>})}<div className="rounded-xl bg-[var(--brand-orange-soft)] p-3 text-xs"><div className="font-semibold">Conciliación resultante entre Deysi y Milton</div><p className="mt-1 leading-relaxed text-[var(--ink-3)]">Aquí solo se muestran transferencias entre Deysi y Milton. En propiedades de Milton, el ingreso se distribuye 80% para Milton y 20% para Deysi; en propiedades de Deysi, el 100% le corresponde a ella. En contratos con propietario, como Luxe Suites 113, el 100% cobrado debe llegar primero a Deysi y el pago posterior al propietario se controla por separado.</p>{data.transfers.length ? data.transfers.map(item => <div key={`${item.from}-${item.to}-${item.currency}`} className="mt-2 capitalize">{party(item.from)} transfiere a {party(item.to)}: <strong>{money(item.amountMinor,item.currency)}</strong></div>) : <p className="mt-2 text-[var(--ink-3)]">Deysi y Milton no tienen transferencias pendientes entre sí para este período.</p>}</div></div>;
}

function DetailedReport({ data }: { data: ReportData }) {
  const totals = data.reservations.reduce((sum, item) => {
    sum.nights += item.nights;
    sum.reservation[item.lodgingCurrency === "USD" ? "USD" : "BOB"] += item.lodgingAmount;
    sum.received.BOB += item.receivedBOB;
    sum.received.USD += item.receivedUSD;
    sum.commission.BOB += item.commissionBOB;
    sum.commission.USD += item.commissionUSD;
    return sum;
  }, { nights: 0, reservation: { BOB: 0, USD: 0 }, received: { BOB: 0, USD: 0 }, commission: { BOB: 0, USD: 0 } });
  return <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="min-w-[1320px] w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Departamento</th><th className="px-3 py-2 text-left">Huésped / estado</th><th className="px-3 py-2 text-left">Canal</th><th className="px-3 py-2 text-left">Estadía</th><th className="px-3 py-2 text-left">Conciliación</th><th className="px-3 py-2 text-right">Noches</th><th className="px-3 py-2 text-right">Reserva</th><th className="px-3 py-2 text-right">Recibido Bs</th><th className="px-3 py-2 text-right">Recibido USD</th><th className="px-3 py-2 text-right">Comisión</th><th className="px-3 py-2 text-left">Motivo del bloqueo</th></tr></thead><tbody>{data.reservations.map(item => <tr key={`reservation-${item.id}`} className={`border-t border-[var(--line)] ${item.reconciliationStatus === "included" ? "" : "bg-amber-500/[0.05] text-[var(--ink-3)]"}`}><td className="px-3 py-2 font-medium">{item.property}</td><td className="px-3 py-2">{item.guest}</td><td className="px-3 py-2">{channelNames[item.channel] || item.channel}</td><td className="px-3 py-2">{item.checkIn} → {item.checkOut}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${item.reconciliationStatus === "included" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>{item.reconciliationStatus === "included" ? "Conciliable" : "Pendiente de pago"}</span></td><td className="px-3 py-2 text-right">{item.nights}</td><td className="px-3 py-2 text-right">{amount(item.lodgingAmount,item.lodgingCurrency as "BOB"|"USD")}</td><td className="px-3 py-2 text-right">{money(item.receivedBOB,"BOB")}</td><td className="px-3 py-2 text-right">{money(item.receivedUSD,"USD")}</td><td className="px-3 py-2 text-right">{item.commissionBOB || item.commissionUSD ? <>{money(item.commissionBOB,"BOB")}<br/>{money(item.commissionUSD,"USD")}</> : "—"}</td><td className="px-3 py-2">—</td></tr>)}{data.blockedPeriods.map(item => <tr key={`block-${item.propertyId}-${item.checkIn}-${item.checkOut}`} className="border-t border-[var(--line)] bg-rose-500/[0.05]"><td className="px-3 py-2 font-medium">{item.property}</td><td className="px-3 py-2 font-semibold text-rose-500">Noches bloqueadas</td><td className="px-3 py-2">Bloqueo manual</td><td className="px-3 py-2">{item.checkIn} → {item.checkOut}</td><td className="px-3 py-2">—</td><td className="px-3 py-2 text-right">{item.nights}</td><td className="px-3 py-2 text-right">Bs 0</td><td className="px-3 py-2 text-right">Bs 0</td><td className="px-3 py-2 text-right">USD 0</td><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 font-medium">{item.reason}</td></tr>)}</tbody><tfoot className="border-t-2 border-[var(--brand-teal)] bg-[var(--bg-3)] font-bold text-[var(--ink)]"><tr><td className="px-3 py-3" colSpan={5}>Total de reservas</td><td className="px-3 py-3 text-right">{totals.nights}</td><td className="px-3 py-3 text-right">{amount(totals.reservation.BOB,"BOB")}<br/>{amount(totals.reservation.USD,"USD")}</td><td className="px-3 py-3 text-right">{money(totals.received.BOB,"BOB")}</td><td className="px-3 py-3 text-right">{money(totals.received.USD,"USD")}</td><td className="px-3 py-3 text-right">{money(totals.commission.BOB,"BOB")}<br/>{money(totals.commission.USD,"USD")}</td><td className="px-3 py-3">—</td></tr></tfoot></table></div>;
}

function PerformanceReport({ data }: { data: ReportData }) {
  return <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--bg)]"><table className="min-w-[720px] w-full text-xs"><thead className="bg-[var(--bg-3)] text-[var(--ink-4)]"><tr><th className="px-3 py-2 text-left">Departamento</th><th className="px-3 py-2 text-right">Ocupación</th><th className="px-3 py-2 text-right">Noches ocupadas</th><th className="px-3 py-2 text-right">Noches libres</th><th className="px-3 py-2 text-right">Promedio Bs</th><th className="px-3 py-2 text-right">Promedio USD</th></tr></thead><tbody>{[...data.performance].sort((a,b)=>b.occupancy-a.occupancy).map(item => <tr key={item.propertyId} className="border-t border-[var(--line)]"><td className="px-3 py-2 font-medium">{item.property}</td><td className="px-3 py-2 text-right font-semibold">{(item.occupancy*100).toFixed(1)}%</td><td className="px-3 py-2 text-right">{item.occupiedNights}</td><td className="px-3 py-2 text-right">{item.freeNights}</td><td className="px-3 py-2 text-right">{amount(item.averageNightlyBOB,"BOB")}</td><td className="px-3 py-2 text-right">{amount(item.averageNightlyUSD,"USD")}</td></tr>)}</tbody></table></div>;
}
