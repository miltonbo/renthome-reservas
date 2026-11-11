"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PropertyRow = { id: number; name: string };
type Policy = {
  id: number; propertyId: number; channel: string; currency: "BOB" | "USD";
  floorMinor: number; targetMinor: number; ceilingMinor: number;
  baseOccupancy: number; extraGuestFrom: number; extraGuestMarkupBps: number;
  commissionBps: number; maxDiscountBps: number; defaultMinNights: number; gapMinNights: number; isActive: boolean;
};
type Promotion = {
  id: number; propertyId: number; channel: string; promotionType: string; enabled: boolean;
  discountBps: number; stackable: boolean; minNights: number; netFloorMinor: number; netFloorCurrency: "BOB" | "USD";
};
type MarketEvent = {
  id: number; name: string; startsOn: string; endsOn: string; impactBps: number;
  confidenceBps: number; status: string; eventType: string; sourceName: string;
};

const CHANNELS = [
  { value: "direct", label: "Directas" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking" },
] as const;
const PROMOTIONS: Record<string, Array<{ value: string; label: string }>> = {
  direct: [{ value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }],
  airbnb: [{ value: "last_minute", label: "Último minuto" }, { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }, { value: "custom", label: "Promoción visible" }],
  booking: [{ value: "genius", label: "Genius" }, { value: "mobile", label: "Móvil" }, { value: "country", label: "País" }, { value: "last_minute", label: "Último minuto" }, { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }],
};

function amount(minor: number | undefined): string { return minor == null ? "" : (minor / 100).toFixed(2); }
function toMinor(value: string): number { return Math.round((Number(value) || 0) * 100); }

function PromotionEditor({ propertyId, channel, definition, saved, floorMinor, currency, onSaved }: {
  propertyId: number; channel: string; definition: { value: string; label: string }; saved?: Promotion;
  floorMinor: number; currency: "BOB" | "USD"; onSaved: (promotion: Promotion) => void;
}) {
  const [enabled, setEnabled] = useState(saved?.enabled ?? false);
  const [discount, setDiscount] = useState(String((saved?.discountBps ?? 0) / 100));
  const [stackable, setStackable] = useState(saved?.stackable ?? false);
  const [minNights, setMinNights] = useState(String(saved?.minNights ?? 1));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/pricing/policies", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "promotion", propertyId, channel, promotionType: definition.value, enabled,
          discountBps: Math.round(Number(discount) * 100), stackable, minNights: Number(minNights),
          netFloorMinor: floorMinor, netFloorCurrency: currency, requiresReviewBps: 2_000,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar");
      onSaved(body.promotion);
    } finally { setSaving(false); }
  };

  return (
    <div className="grid items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2.5 sm:grid-cols-[1fr_90px_90px_100px_auto]">
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> {definition.label}
      </label>
      <label className="text-[10px] text-[var(--ink-4)]">Descuento %<input type="number" min="0" max="100" step="0.5" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label>
      <label className="text-[10px] text-[var(--ink-4)]">Noches mín.<input type="number" min="1" value={minNights} onChange={(event) => setMinNights(event.target.value)} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label>
      <label className="flex items-center gap-2 text-xs text-[var(--ink-3)]"><input type="checkbox" checked={stackable} onChange={(event) => setStackable(event.target.checked)} /> Acumulable</label>
      <button type="button" onClick={save} disabled={saving} className="h-8 rounded-md border border-[var(--line-2)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--bg-3)] disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
    </div>
  );
}

export default function PricingOperationsPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [channel, setChannel] = useState("direct");
  const [currency, setCurrency] = useState<"BOB" | "USD">("BOB");
  const [floor, setFloor] = useState("");
  const [target, setTarget] = useState("");
  const [ceiling, setCeiling] = useState("");
  const [commission, setCommission] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("20");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [eventDraft, setEventDraft] = useState({ name: "", startsOn: "", endsOn: "", impact: "20", confidence: "50", status: "candidate", type: "other", source: "" });

  const load = useCallback(async () => {
    const [policyResponse, eventResponse] = await Promise.all([fetch("/api/pricing/policies"), fetch("/api/pricing/events")]);
    if (!policyResponse.ok) throw new Error("No se pudieron cargar las políticas.");
    const policyBody = await policyResponse.json();
    const eventBody = eventResponse.ok ? await eventResponse.json() : { events: [] };
    setProperties(policyBody.properties || []); setPolicies(policyBody.policies || []); setPromotions(policyBody.promotions || []); setEvents(eventBody.events || []);
    setSelectedPropertyId((current) => current ?? policyBody.properties?.[0]?.id ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((loadError) => setError(loadError.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const policy = useMemo(() => policies.find((row) => row.propertyId === selectedPropertyId && row.channel === channel), [policies, selectedPropertyId, channel]);
  useEffect(() => {
    // This resets the editable draft when the operator deliberately changes
    // property/channel; it is form synchronisation, not derived display state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrency(policy?.currency || "BOB"); setFloor(amount(policy?.floorMinor)); setTarget(amount(policy?.targetMinor)); setCeiling(amount(policy?.ceilingMinor));
    setCommission(String((policy?.commissionBps ?? (channel === "booking" ? 1500 : 0)) / 100)); setMaxDiscount(String((policy?.maxDiscountBps ?? 2000) / 100));
  }, [policy, channel, selectedPropertyId]);

  const savePolicy = async () => {
    if (!selectedPropertyId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/policies", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedPropertyId, channel, currency, floorMinor: toMinor(floor), targetMinor: toMinor(target), ceilingMinor: toMinor(ceiling), baseOccupancy: 2, extraGuestFrom: 3, extraGuestMarkupBps: 2000, commissionBps: Math.round(Number(commission) * 100), maxDiscountBps: Math.round(Number(maxDiscount) * 100), defaultMinNights: 2, gapMinNights: 1, isActive: true }),
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar");
      setPolicies((rows) => [...rows.filter((row) => !(row.propertyId === selectedPropertyId && row.channel === channel)), body.policy]); setMessage("Política guardada.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar"); } finally { setSaving(false); }
  };

  const runShadow = async () => {
    setRunning(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 90 }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo calcular");
      setMessage(`Modo sombra actualizado: ${body.recommendations} recomendaciones para ${body.properties} alojamientos; ${body.needsReview} requieren revisión.`);
    } catch (runError) { setError(runError instanceof Error ? runError.message : "No se pudo calcular"); } finally { setRunning(false); }
  };

  const saveEvent = async () => {
    setError("");
    try {
      const response = await fetch("/api/pricing/events", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: eventDraft.name, startsOn: eventDraft.startsOn, endsOn: eventDraft.endsOn, impactBps: Math.round(Number(eventDraft.impact) * 100), confidenceBps: Math.round(Number(eventDraft.confidence) * 100), status: eventDraft.status, eventType: eventDraft.type, sourceName: eventDraft.source }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar el evento");
      setEvents((rows) => [...rows, body.event].sort((a, b) => a.startsOn.localeCompare(b.startsOn))); setEventDraft({ name: "", startsOn: "", endsOn: "", impact: "20", confidence: "50", status: "candidate", type: "other", source: "" });
    } catch (eventError) { setError(eventError instanceof Error ? eventError.message : "No se pudo guardar el evento"); }
  };

  const selectedPromotions = promotions.filter((row) => row.propertyId === selectedPropertyId && row.channel === channel);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold text-[var(--ink)]">Agente de precios · modo sombra</h2><p className="mt-1 text-sm text-[var(--ink-4)]">Configura políticas y calcula recomendaciones. Esta fase no modifica Airbnb ni Booking.</p></div><button type="button" onClick={runShadow} disabled={running || policies.length === 0} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running ? "Calculando…" : "Calcular próximos 90 días"}</button></div>
      {(message || error) && <div role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/5 text-rose-600" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"}`}>{error || message}</div>}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs text-[var(--ink-4)]">Alojamiento<select value={selectedPropertyId ?? ""} onChange={(event) => setSelectedPropertyId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <div className="flex items-end gap-1">{CHANNELS.map((item) => <button key={item.value} type="button" onClick={() => setChannel(item.value)} className={`h-10 rounded-lg px-3 text-sm font-medium ${channel === item.value ? "bg-[var(--brand-navy)] text-white" : "border border-[var(--line-2)] text-[var(--ink-2)]"}`}>{item.label}</button>)}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs text-[var(--ink-4)]">Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as "BOB" | "USD")} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option>BOB</option><option>USD</option></select></label>
          {[{ label: "Piso", value: floor, set: setFloor }, { label: "Objetivo", value: target, set: setTarget }, { label: "Techo", value: ceiling, set: setCeiling }].map((field) => <label key={field.label} className="text-xs text-[var(--ink-4)]">{field.label}<input type="number" min="0" step="0.01" value={field.value} onChange={(event) => field.set(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>)}
          <label className="text-xs text-[var(--ink-4)]">Comisión %<input type="number" min="0" max="100" step="0.1" value={commission} onChange={(event) => setCommission(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Descuento máx. %<input type="number" min="0" max="100" step="0.5" value={maxDiscount} onChange={(event) => setMaxDiscount(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[var(--ink-4)]">Base: 2 huéspedes · tercer huésped +20 % · mínimo normal 2 noches · huecos 1 noche.</p><button type="button" onClick={savePolicy} disabled={saving || !floor || !target || !ceiling} className="rounded-lg bg-[var(--m-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar política"}</button></div>
      </section>

      <section className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4"><div><h3 className="font-semibold text-[var(--ink)]">Promociones de {CHANNELS.find((item) => item.value === channel)?.label}</h3><p className="text-xs text-[var(--ink-4)]">El motor eleva el precio bruto para respetar el piso neto después de comisión y descuentos.</p></div>{policy ? (PROMOTIONS[channel] || []).map((definition) => <PromotionEditor key={`${selectedPropertyId}-${channel}-${definition.value}`} propertyId={selectedPropertyId!} channel={channel} definition={definition} saved={selectedPromotions.find((row) => row.promotionType === definition.value)} floorMinor={policy.floorMinor} currency={policy.currency} onSaved={(promotion) => setPromotions((rows) => [...rows.filter((row) => row.id !== promotion.id), promotion])} />) : <p className="rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--ink-4)]">Guarda primero la política de este canal.</p>}</section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4"><h3 className="font-semibold text-[var(--ink)]">Feriados y eventos</h3><p className="mb-3 text-xs text-[var(--ink-4)]">Los eventos tentativos ponderan su impacto por confianza; pueden confirmarse cuando exista una fuente oficial.</p><div className="grid gap-2 md:grid-cols-4"><input placeholder="Nombre del evento" value={eventDraft.name} onChange={(event) => setEventDraft((draft) => ({ ...draft, name: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /><input type="date" value={eventDraft.startsOn} onChange={(event) => setEventDraft((draft) => ({ ...draft, startsOn: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /><input type="date" value={eventDraft.endsOn} onChange={(event) => setEventDraft((draft) => ({ ...draft, endsOn: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /><button type="button" onClick={saveEvent} className="h-9 rounded bg-[var(--brand-navy)] px-3 text-sm font-medium text-white">Agregar evento</button><label className="text-[10px] text-[var(--ink-4)]">Impacto %<input type="number" value={eventDraft.impact} onChange={(event) => setEventDraft((draft) => ({ ...draft, impact: event.target.value }))} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs text-[var(--ink)]" /></label><label className="text-[10px] text-[var(--ink-4)]">Confianza %<input type="number" value={eventDraft.confidence} onChange={(event) => setEventDraft((draft) => ({ ...draft, confidence: event.target.value }))} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs text-[var(--ink)]" /></label><select value={eventDraft.status} onChange={(event) => setEventDraft((draft) => ({ ...draft, status: event.target.value }))} className="h-8 self-end rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs text-[var(--ink)]"><option value="candidate">Tentativo</option><option value="confirmed">Confirmado</option></select><input placeholder="Fuente" value={eventDraft.source} onChange={(event) => setEventDraft((draft) => ({ ...draft, source: event.target.value }))} className="h-8 self-end rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-xs text-[var(--ink)]" /></div>{events.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{events.slice(0, 12).map((event) => <span key={event.id} className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-2.5 py-1 text-xs text-[var(--ink-2)]">{event.name} · {event.startsOn} · {event.impactBps / 100}% × {event.confidenceBps / 100}%</span>)}</div>}</section>
    </div>
  );
}
