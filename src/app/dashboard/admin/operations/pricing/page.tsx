"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOfficialExchangeRate } from "@/lib/use-official-exchange-rate";

type PropertyRow = { id: number; name: string };
type Policy = {
  id: number; propertyId: number; channel: string; currency: "BOB" | "USD";
  floorMinor: number; floorCurrency: "BOB" | "USD"; targetMinor: number;
  baseOccupancy: number; extraGuestFrom: number; extraGuestMarkupBps: number;
  commissionBps: number; defaultMinNights: number; gapMinNights: number; isActive: boolean;
};
type Promotion = {
  id: number; propertyId: number; channel: string; promotionType: string; enabled: boolean;
  discountBps: number; stackable: boolean; minNights: number; netFloorMinor: number; netFloorCurrency: "BOB" | "USD";
};
type MarketEvent = {
  id: number; name: string; startsOn: string; endsOn: string; impactBps: number;
  confidenceBps: number; status: string; eventType: string; sourceName: string;
  sourceUrl?: string | null; lastVerifiedAt?: string | null;
};
type SourceStatus = {
  key: string; name: string; url: string; ok: boolean; discovered: number;
  saved: number; error?: string; checkedAt: string;
};
type PricingProfile = {
  propertyId: number; building: string; segment: string; balcony: string; viewQuality: string;
  airbnbHistoryStrength: string; bookingHistoryStrength: string; airbnbReviewCount: number;
  bookingReviewCount: number; airbnbRatingHundredths: number; bookingRatingHundredths: number;
  sellThroughAdjustmentBps: number; interchangeableGroup: string | null;
  bookingFlexibleInventory: boolean; bookingMaxSellableUnits: number; notes: string; saved: boolean;
};
type PricingConnection = {
  id: number; propertyId: number; channel: string; externalListingId: string; status: string;
  lastCollectedAt?: string | null; lastAppliedAt?: string | null; lastVerifiedAt?: string | null;
  lastError?: string | null; property: { name: string };
};
type AutomationRun = {
  id: number; channel: string; runType: string; status: string; propertyCount: number;
  plannedChanges: number; appliedChanges: number; verifiedChanges: number; createdAt: string;
  completedAt?: string | null; errorMessage?: string | null;
};

const CHANNELS = [
  { value: "direct", label: "Directas" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking" },
] as const;
const PROMOTIONS: Record<string, Array<{ value: string; label: string }>> = {
  direct: [{ value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }],
  airbnb: [{ value: "new_listing", label: "Publicación nueva" }, { value: "last_minute", label: "Último minuto" }, { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }, { value: "custom", label: "Promoción visible" }],
  booking: [{ value: "genius", label: "Genius" }, { value: "mobile", label: "Móvil" }, { value: "country", label: "País" }, { value: "last_minute", label: "Último minuto" }, { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }],
};
const AUTOMATIC_SOURCES = new Set(["Calendario automático Bolivia", "Ministerio de Trabajo", "Cultura y Turismo Santa Cruz", "Fexpocruz", "SuperTicket"]);
const EVENT_GROUPS = [
  { key: "holidays", title: "Feriados y fechas cívicas", types: ["holiday", "civic"], accent: "border-sky-500/25 bg-sky-500/[0.05]" },
  { key: "business", title: "Ferias y congresos", types: ["fair", "congress"], accent: "border-violet-500/25 bg-violet-500/[0.05]" },
  { key: "shows", title: "Conciertos y espectáculos", types: ["concert"], accent: "border-rose-500/25 bg-rose-500/[0.05]" },
  { key: "culture", title: "Cultura y museos", types: ["cultural"], accent: "border-cyan-500/25 bg-cyan-500/[0.05]" },
  { key: "sports", title: "Deportes", types: ["sports"], accent: "border-emerald-500/25 bg-emerald-500/[0.05]" },
  { key: "other", title: "Otras señales", types: ["other"], accent: "border-amber-500/25 bg-amber-500/[0.05]" },
];

function amount(minor: number | undefined): string { return minor == null ? "" : (minor / 100).toFixed(2); }
function toMinor(value: string): number { return Math.round((Number(value) || 0) * 100); }
function channelCurrency(channel: string): "BOB" | "USD" { return channel === "direct" ? "BOB" : "USD"; }
function channelCommissionBps(channel: string): number { return channel === "airbnb" ? 1_550 : channel === "booking" ? 1_500 : 0; }
function policyAmount(minor: number | undefined, storedCurrency: "BOB" | "USD" | undefined, desiredCurrency: "BOB" | "USD", bobPerUsd?: number): string {
  if (minor == null) return "";
  if (!storedCurrency || storedCurrency === desiredCurrency) return amount(minor);
  if (!bobPerUsd) return "";
  const converted = desiredCurrency === "USD" ? minor / bobPerUsd : minor * bobPerUsd;
  return amount(Math.round(converted));
}

function eventDate(event: MarketEvent): string {
  const format = (date: string) => new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return event.startsOn === event.endsOn ? format(event.startsOn) : `${format(event.startsOn)} – ${format(event.endsOn)}`;
}

function PromotionEditor({ propertyId, channel, definition, saved, floorMinor, floorCurrency, onSaved }: {
  propertyId: number; channel: string; definition: { value: string; label: string }; saved?: Promotion;
  floorMinor: number; floorCurrency: "BOB" | "USD"; onSaved: (promotion: Promotion) => void;
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
          netFloorMinor: floorMinor, netFloorCurrency: floorCurrency, requiresReviewBps: 2_000,
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
      <label className="text-[10px] text-[var(--ink-4)]">Descuento %<input type="number" min="0" max="99.99" step="0.5" value={discount} onChange={(event) => setDiscount(event.target.value)} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label>
      <label className="text-[10px] text-[var(--ink-4)]">Noches mín.<input type="number" min="1" value={minNights} onChange={(event) => setMinNights(event.target.value)} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label>
      {channel === "booking" ? <label className="flex items-center gap-2 text-xs text-[var(--ink-3)]"><input type="checkbox" checked={stackable} onChange={(event) => setStackable(event.target.checked)} /> Acumulable</label> : <span className="text-[10px] text-[var(--ink-4)]">{channel === "airbnb" ? "Airbnb aplica prioridad" : "Según estadía"}</span>}
      <button type="button" onClick={save} disabled={saving} className="h-8 rounded-md border border-[var(--line-2)] px-3 text-xs font-medium text-[var(--ink)] hover:bg-[var(--bg-3)] disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
    </div>
  );
}

export default function PricingOperationsPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [profiles, setProfiles] = useState<PricingProfile[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [channel, setChannel] = useState("direct");
  const [floorCurrency, setFloorCurrency] = useState<"BOB" | "USD">("BOB");
  const [floor, setFloor] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [syncingSignals, setSyncingSignals] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [eventDraft, setEventDraft] = useState({ name: "", startsOn: "", endsOn: "", impact: "20", confidence: "50", status: "candidate", type: "other", source: "" });
  const [profileDraft, setProfileDraft] = useState<PricingProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [automation, setAutomation] = useState<{ workerConfigured: boolean; connections: PricingConnection[]; runs: AutomationRun[] }>({ workerConfigured: false, connections: [], runs: [] });
  const [queueingAutomation, setQueueingAutomation] = useState(false);
  const { rate: officialRate, loading: exchangeRateLoading } = useOfficialExchangeRate();
  const currency = channelCurrency(channel);

  const load = useCallback(async () => {
    const [policyResponse, eventResponse, automationResponse] = await Promise.all([fetch("/api/pricing/policies"), fetch("/api/pricing/events"), fetch("/api/pricing/automation/status")]);
    if (!policyResponse.ok) throw new Error("No se pudieron cargar las políticas.");
    const policyBody = await policyResponse.json();
    const eventBody = eventResponse.ok ? await eventResponse.json() : { events: [] };
    const automationBody = automationResponse.ok ? await automationResponse.json() : { workerConfigured: false, connections: [], runs: [] };
    setProperties(policyBody.properties || []); setPolicies(policyBody.policies || []); setPromotions(policyBody.promotions || []); setProfiles(policyBody.profiles || []); setEvents(eventBody.events || []); setSourceStatuses(eventBody.sources || []);
    setAutomation(automationBody);
    setSelectedPropertyId((current) => current ?? policyBody.properties?.[0]?.id ?? null);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- changing property/channel intentionally loads a saved policy into this editable form */
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((loadError) => setError(loadError.message)); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const policy = useMemo(() => policies.find((row) => row.propertyId === selectedPropertyId && row.channel === channel), [policies, selectedPropertyId, channel]);
  const selectedProfile = useMemo(() => profiles.find((row) => row.propertyId === selectedPropertyId) || null, [profiles, selectedPropertyId]);
  useEffect(() => {
    // This resets the editable draft when the operator deliberately changes
    // property/channel; it is form synchronisation, not derived display state.
    const nextFloorCurrency = channel === "booking" ? policy?.floorCurrency || "BOB" : currency;
    setFloorCurrency(nextFloorCurrency);
    setFloor(policyAmount(policy?.floorMinor, policy?.floorCurrency, nextFloorCurrency, officialRate?.bobPerUsd));
    setTarget(policyAmount(policy?.targetMinor, policy?.currency, currency, officialRate?.bobPerUsd));
  }, [policy, channel, selectedPropertyId, currency, officialRate?.bobPerUsd]);
  useEffect(() => { setProfileDraft(selectedProfile ? { ...selectedProfile } : null); }, [selectedProfile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const savePolicy = async () => {
    if (!selectedPropertyId) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/policies", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: selectedPropertyId, channel, currency, floorMinor: toMinor(floor), floorCurrency, targetMinor: toMinor(target), baseOccupancy: 2, extraGuestFrom: 3, extraGuestMarkupBps: 2000, commissionBps: channelCommissionBps(channel), defaultMinNights: 2, gapMinNights: 1, isActive: true }),
      });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar");
      setPolicies((rows) => [...rows.filter((row) => !(row.propertyId === selectedPropertyId && row.channel === channel)), body.policy]); setMessage("Política guardada.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "No se pudo guardar"); } finally { setSaving(false); }
  };

  const saveProfile = async () => {
    if (!selectedPropertyId || !profileDraft) return;
    setSavingProfile(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/policies", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "profile", propertyId: selectedPropertyId, profile: profileDraft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el perfil");
      setProfiles((rows) => [...rows.filter((row) => row.propertyId !== selectedPropertyId), body.profile]);
      setMessage("Base de conocimiento del alojamiento guardada.");
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "No se pudo guardar el perfil");
    } finally { setSavingProfile(false); }
  };

  const queueAutomation = async () => {
    setQueueingAutomation(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/automation/status", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo programar la sincronización");
      setMessage("Sincronización de Airbnb y Booking agregada a la cola del trabajador.");
      await load();
    } catch (automationError) {
      setError(automationError instanceof Error ? automationError.message : "No se pudo programar la sincronización");
    } finally { setQueueingAutomation(false); }
  };

  const runShadow = async () => {
    setRunning(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 90 }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo calcular");
      setMessage(`Modo sombra actualizado: ${body.recommendations} recomendaciones para ${body.properties} alojamientos; ${body.needsReview} requieren revisión.`);
    } catch (runError) { setError(runError instanceof Error ? runError.message : "No se pudo calcular"); } finally { setRunning(false); }
  };

  const syncSignals = async () => {
    setSyncingSignals(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/pricing/events", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron actualizar las señales");
      setEvents(body.events || []);
      setSourceStatuses(body.sources || []);
      const availableSources = (body.sources || []).filter((source: SourceStatus) => source.ok).length;
      const discovered = (body.sources || []).reduce((sum: number, source: SourceStatus) => sum + source.discovered, 0);
      setMessage(`Señales actualizadas: ${body.total} fechas recurrentes y ${discovered} eventos encontrados en ${availableSources} fuentes disponibles.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "No se pudieron actualizar las señales");
    } finally { setSyncingSignals(false); }
  };

  const saveEvent = async () => {
    setError("");
    try {
      const response = await fetch("/api/pricing/events", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: eventDraft.name, startsOn: eventDraft.startsOn, endsOn: eventDraft.endsOn, impactBps: Math.round(Number(eventDraft.impact) * 100), confidenceBps: Math.round(Number(eventDraft.confidence) * 100), status: eventDraft.status, eventType: eventDraft.type, sourceName: eventDraft.source }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo guardar el evento");
      setEvents((rows) => [...rows, body.event].sort((a, b) => a.startsOn.localeCompare(b.startsOn))); setEventDraft({ name: "", startsOn: "", endsOn: "", impact: "20", confidence: "50", status: "candidate", type: "other", source: "" });
    } catch (eventError) { setError(eventError instanceof Error ? eventError.message : "No se pudo guardar el evento"); }
  };

  const changeFloorCurrency = (next: "BOB" | "USD") => {
    if (next === floorCurrency) return;
    const current = Number(floor);
    if (officialRate && Number.isFinite(current) && current > 0) {
      setFloor((next === "USD" ? current / officialRate.bobPerUsd : current * officialRate.bobPerUsd).toFixed(2));
    }
    setFloorCurrency(next);
  };
  const selectedPromotions = promotions.filter((row) => row.propertyId === selectedPropertyId && row.channel === channel);
  const floorValue = Number(floor);
  const floorEquivalent = officialRate && Number.isFinite(floorValue) && floorValue > 0
    ? floorCurrency === "USD" ? floorValue * officialRate.bobPerUsd : floorValue / officialRate.bobPerUsd
    : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const upcomingEvents = events.filter((event) => event.status !== "cancelled" && event.endsOn >= today);
  const manualEvents = upcomingEvents.filter((event) => !AUTOMATIC_SOURCES.has(event.sourceName));
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold text-[var(--ink)]">Agente de precios · calibración automática</h2><p className="mt-1 text-sm text-[var(--ink-4)]">Define el piso neto y una referencia inicial. El agente puede subir sin techo cuando la demanda lo justifique y nunca vender por debajo del piso.</p></div><button type="button" onClick={runShadow} disabled={running || policies.length === 0} className="rounded-lg bg-[var(--brand-orange)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running ? "Calculando…" : "Recalcular próximos 90 días"}</button></div>
      {(message || error) && <div role={error ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${error ? "border-rose-500/30 bg-rose-500/5 text-rose-600" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"}`}>{error || message}</div>}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[var(--ink)]">Automatización de canales</h3><p className="mt-1 text-xs text-[var(--ink-4)]">El trabajador de Chrome lee cada plataforma, actualiza esta base de conocimiento, recibe el plan del motor y verifica los valores publicados.</p></div><button type="button" onClick={queueAutomation} disabled={queueingAutomation || !automation.workerConfigured} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-50">{queueingAutomation ? "Programando…" : "Sincronizar y recalcular ahora"}</button></div>
        <div className={`mt-3 rounded-lg border p-3 text-xs ${automation.workerConfigured ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700" : "border-amber-500/25 bg-amber-500/5 text-amber-700"}`}>{automation.workerConfigured ? "DeptosBO está preparado para autenticar al trabajador de precios." : "Falta configurar PRICING_WORKER_TOKEN o CRON_SECRET para conectar el trabajador."}</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">{["airbnb", "booking"].map((automationChannel) => {
          const connections = automation.connections.filter((row) => row.channel === automationChannel);
          const selectedConnection = connections.find((row) => row.propertyId === selectedPropertyId);
          const latestRun = automation.runs.find((row) => row.channel === automationChannel);
          const connected = connections.filter((row) => row.status === "connected").length;
          return <div key={automationChannel} className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3"><div className="flex items-center justify-between"><strong className="capitalize text-[var(--ink)]">{automationChannel}</strong><span className="text-[11px] text-[var(--ink-4)]">{connected}/{connections.length || properties.length} conectados</span></div><p className="mt-2 text-xs text-[var(--ink-3)]">Última ejecución: {latestRun ? `${latestRun.status} · ${latestRun.verifiedChanges}/${latestRun.plannedChanges} verificados` : "todavía no ejecutada"}</p><p className="mt-1 text-xs text-[var(--ink-4)]">Alojamiento seleccionado: {selectedConnection ? `${selectedConnection.status} · ${selectedConnection.lastCollectedAt ? new Date(selectedConnection.lastCollectedAt).toLocaleString("es-BO") : "sin lectura"}` : "pendiente de vincular"}</p>{selectedConnection?.lastError && <p className="mt-1 text-xs text-rose-600">{selectedConnection.lastError}</p>}</div>;
        })}</div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="text-xs text-[var(--ink-4)]">Alojamiento<select value={selectedPropertyId ?? ""} onChange={(event) => setSelectedPropertyId(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)]">{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <div className="flex items-end gap-1">{CHANNELS.map((item) => <button key={item.value} type="button" onClick={() => setChannel(item.value)} className={`h-10 rounded-lg px-3 text-sm font-medium ${channel === item.value ? "bg-[var(--brand-navy)] text-white" : "border border-[var(--line-2)] text-[var(--ink-2)]"}`}>{item.label}</button>)}</div>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--ink-3)]">
          <strong className="text-[var(--ink)]">Moneda del canal: {currency}</strong>
          <span className="ml-2">{channel === "direct" ? "Las reservas directas se administran en bolivianos." : `${CHANNELS.find((item) => item.value === channel)?.label} publica y recibe estos precios en dólares.`}</span>
          <span className="mt-1 block">{exchangeRateLoading ? "Cargando TC oficial…" : officialRate ? `TC oficial almacenado: USD 1 = Bs ${officialRate.bobPerUsd.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · vigente ${officialRate.effectiveDate}${officialRate.stale ? " · último dato disponible" : ""}.` : "TC oficial no disponible."}</span>
        </div>
        <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${channel === "direct" ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          <label className="text-xs font-medium text-[var(--ink-3)]">Piso neto mínimo ({floorCurrency})<div className="mt-1 flex gap-1"><input type="number" min="0" step="0.01" value={floor} onChange={(event) => setFloor(event.target.value)} className="h-9 min-w-0 flex-1 rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" />{channel === "booking" && <select aria-label="Moneda del piso" value={floorCurrency} onChange={(event) => changeFloorCurrency(event.target.value as "BOB" | "USD")} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg)] px-1 text-xs text-[var(--ink)]"><option value="BOB">Bs</option><option value="USD">USD</option></select>}</div>{floorEquivalent != null && <span className="mt-1 block text-[10px] font-normal text-[var(--ink-4)]">Equivalente: {floorCurrency === "USD" ? `Bs ${floorEquivalent.toFixed(2)}` : `USD ${floorEquivalent.toFixed(2)}`}</span>}</label>
          <label className="text-xs text-[var(--ink-4)]">Referencia inicial por noche · 1–2 huéspedes ({currency})<input type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /><span className="mt-1 block text-[10px]">Es el punto de partida, no un máximo.</span></label>
          {channel !== "direct" && <label className="text-xs text-[var(--ink-4)]">Comisión automática del canal<input type="number" value={String(channelCommissionBps(channel) / 100)} readOnly disabled className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg-3)] px-2 text-sm text-[var(--ink-3)] disabled:opacity-100" /><span className="mt-1 block text-[10px]">{channel === "airbnb" ? "Airbnb Bolivia: tarifa única del anfitrión 15,5%." : "Booking: comisión contractual RentHome 15%."}</span></label>}
        </div>
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--ink-3)]"><strong className="text-[var(--ink)]">Regla económica:</strong> {channel === "direct" ? "en reservas directas no existe comisión del canal. El agente puede subir tanto como la demanda lo justifique y nunca bajar del piso neto." : `el agente recalcula el precio bruto con la comisión de ${channelCommissionBps(channel) / 100}% y los descuentos realmente activos. No existe techo ni descuento máximo artificial; el neto final siempre debe ser igual o mayor al piso.`} <span className="mt-1 block">Si se habilita un hueco de una sola noche, el piso efectivo aumenta automáticamente Bs 50 por la limpieza adicional.</span></div>
        {channel === "airbnb" && <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-700">Airbnb calcula las promociones personalizadas sobre la mediana de precios de los últimos 60 días y puede limitarla al precio máximo reservado del último año. Antes de aplicar una promoción, el agente deberá verificar el precio promocional mostrado por Airbnb; cambiar hoy el calendario no modifica inmediatamente esa mediana.</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-[var(--ink-4)]">Base: 1–2 huéspedes · tercer huésped +20 % · mínimo normal 2 noches · huecos 1 noche.</p><p className="mt-1 text-[11px] text-[var(--ink-4)]">La referencia es el punto de partida por noche. No existe techo; el piso neto prevalece después de descuentos y comisión.</p></div><button type="button" onClick={savePolicy} disabled={saving || !floor || !target} className="rounded-lg bg-[var(--m-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar política"}</button></div>
      </section>

      {profileDraft && <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-[var(--ink)]">Base de conocimiento del alojamiento</h3><p className="mt-1 text-xs text-[var(--ink-4)]">Datos estables o semanales que el motor combina con reservas, anticipación, eventos y disponibilidad. Los ajustes son moderados y nunca pueden atravesar el piso neto.</p></div><button type="button" onClick={saveProfile} disabled={savingProfile} className="rounded-lg bg-[var(--m-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingProfile ? "Guardando…" : "Guardar perfil"}</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-[var(--ink-4)]">Edificio<input value={profileDraft.building} onChange={(event) => setProfileDraft({ ...profileDraft, building: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Segmento<select value={profileDraft.segment} onChange={(event) => setProfileDraft({ ...profileDraft, segment: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option value="value">Económico</option><option value="standard">Estándar</option><option value="premium">Premium</option></select></label>
          <label className="text-xs text-[var(--ink-4)]">Balcón<select value={profileDraft.balcony} onChange={(event) => setProfileDraft({ ...profileDraft, balcony: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option value="unknown">Por confirmar</option><option value="none">Sin balcón</option><option value="standard">Estándar</option><option value="premium">Diferencial</option></select></label>
          <label className="text-xs text-[var(--ink-4)]">Vista<select value={profileDraft.viewQuality} onChange={(event) => setProfileDraft({ ...profileDraft, viewQuality: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option value="unknown">Por confirmar</option><option value="none">Sin vista</option><option value="limited">Limitada</option><option value="standard">Estándar</option><option value="premium">Diferencial</option></select></label>
          <label className="text-xs text-[var(--ink-4)]">Historial Airbnb<select value={profileDraft.airbnbHistoryStrength} onChange={(event) => setProfileDraft({ ...profileDraft, airbnbHistoryStrength: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option value="unknown">Por confirmar</option><option value="new">Nuevo</option><option value="growing">En crecimiento</option><option value="established">Consolidado</option></select></label>
          <label className="text-xs text-[var(--ink-4)]">Reseñas Airbnb · automático<input readOnly value={profileDraft.airbnbReviewCount} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg-3)] px-2 text-sm text-[var(--ink-3)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Calificación Airbnb · automático<input readOnly value={profileDraft.airbnbRatingHundredths ? (profileDraft.airbnbRatingHundredths / 100).toFixed(2) : "Sin sincronizar"} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg-3)] px-2 text-sm text-[var(--ink-3)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Historial Booking<select value={profileDraft.bookingHistoryStrength} onChange={(event) => setProfileDraft({ ...profileDraft, bookingHistoryStrength: event.target.value })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]"><option value="unknown">Por confirmar</option><option value="new">Nuevo</option><option value="growing">En crecimiento</option><option value="established">Consolidado</option></select></label>
          <label className="text-xs text-[var(--ink-4)]">Reseñas Booking · automático<input readOnly value={profileDraft.bookingReviewCount} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg-3)] px-2 text-sm text-[var(--ink-3)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Calificación Booking · automático<input readOnly value={profileDraft.bookingRatingHundredths ? (profileDraft.bookingRatingHundredths / 100).toFixed(2) : "Sin sincronizar"} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg-3)] px-2 text-sm text-[var(--ink-3)]" /></label>
          <label className="text-xs text-[var(--ink-4)]">Ajuste de rotación %<input type="number" min="-50" max="50" step="0.5" value={profileDraft.sellThroughAdjustmentBps / 100} onChange={(event) => setProfileDraft({ ...profileDraft, sellThroughAdjustmentBps: Math.round((Number(event.target.value) || 0) * 100) })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /><span className="mt-1 block text-[10px]">Negativo ayuda a mover la unidad; positivo protege un diferencial.</span></label>
          <label className="text-xs text-[var(--ink-4)]">Grupo comparable<input value={profileDraft.interchangeableGroup || ""} onChange={(event) => setProfileDraft({ ...profileDraft, interchangeableGroup: event.target.value || null })} placeholder="Ej. luxe-sin-balcon" className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>
          <label className="flex items-center gap-2 self-center text-xs text-[var(--ink-3)]"><input type="checkbox" checked={profileDraft.bookingFlexibleInventory} onChange={(event) => setProfileDraft({ ...profileDraft, bookingFlexibleInventory: event.target.checked })} /> Inventario flexible en Booking</label>
          <label className="text-xs text-[var(--ink-4)]">Unidades vendibles en Booking<input type="number" min="1" max="20" value={profileDraft.bookingMaxSellableUnits} onChange={(event) => setProfileDraft({ ...profileDraft, bookingMaxSellableUnits: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 h-9 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 text-sm text-[var(--ink)]" /></label>
        </div>
        <label className="mt-3 block text-xs text-[var(--ink-4)]">Notas operativas<textarea value={profileDraft.notes} onChange={(event) => setProfileDraft({ ...profileDraft, notes: event.target.value })} rows={2} placeholder="Solo criterios estables; no guardar datos de huéspedes." className="mt-1 w-full rounded border border-[var(--line-2)] bg-[var(--bg)] px-2 py-2 text-sm text-[var(--ink)]" /></label>
      </section>}

      <section className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4"><div><h3 className="font-semibold text-[var(--ink)]">Promociones de {CHANNELS.find((item) => item.value === channel)?.label}</h3><p className="text-xs text-[var(--ink-4)]">El motor considera los descuentos realmente activos y eleva el precio bruto cuando sea necesario para respetar el piso neto después de comisión.</p></div>{policy ? (PROMOTIONS[channel] || []).map((definition) => <PromotionEditor key={`${selectedPropertyId}-${channel}-${definition.value}`} propertyId={selectedPropertyId!} channel={channel} definition={definition} saved={selectedPromotions.find((row) => row.promotionType === definition.value)} floorMinor={policy.floorMinor} floorCurrency={policy.floorCurrency} onSaved={(promotion) => setPromotions((rows) => [...rows.filter((row) => row.id !== promotion.id), promotion])} />) : <p className="rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--ink-4)]">Guarda primero la política de este canal.</p>}</section>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold text-[var(--ink)]">Señales automáticas de demanda · Santa Cruz</h3><p className="mt-1 max-w-3xl text-xs text-[var(--ink-4)]">El agente combina feriados bolivianos, fechas cívicas y eventos públicos de Santa Cruz de la Sierra. “Impacto potencial” es el aumento máximo estimado; la “confianza económica” mide la evidencia de que realmente genera noches de alojamiento.</p></div>
          <button type="button" onClick={syncSignals} disabled={syncingSignals} className="h-9 rounded-lg border border-[var(--line-2)] px-3 text-xs font-semibold text-[var(--ink)] disabled:opacity-50">{syncingSignals ? "Consultando fuentes…" : "Actualizar señales ahora"}</button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sourceStatuses.length > 0 ? sourceStatuses.map((source) => <a key={source.key} href={source.url} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 hover:border-[var(--line-2)]"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[var(--ink)]">{source.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${source.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>{source.ok ? "Disponible" : "Sin respuesta"}</span></div><p className="mt-1 text-[11px] text-[var(--ink-4)]">{source.ok ? `${source.discovered} eventos vigentes encontrados` : source.error || "Se reintentará automáticamente"}</p></a>) : <p className="col-span-full rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--ink-4)]">Pulsa “Actualizar señales ahora” para consultar las fuentes de eventos por primera vez.</p>}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {EVENT_GROUPS.map((group) => {
            const grouped = upcomingEvents.filter((event) => group.types.includes(event.eventType)).slice(0, 8);
            if (grouped.length === 0) return null;
            return <div key={group.key} className={`rounded-xl border p-3 ${group.accent}`}><h4 className="text-sm font-semibold text-[var(--ink)]">{group.title}</h4><div className="mt-2 space-y-2">{grouped.map((event) => <div key={event.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-2.5"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-medium text-[var(--ink)]">{event.name}</p><p className="mt-0.5 text-[11px] text-[var(--ink-4)]">{eventDate(event)} · {event.sourceName || "Registro manual"}</p></div><span className="rounded-full bg-[var(--bg-3)] px-2 py-1 text-[10px] text-[var(--ink-3)]">Impacto potencial {event.impactBps / 100}% · confianza económica {event.confidenceBps / 100}%</span></div>{event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] font-medium text-sky-600 hover:underline">Ver fuente</a>}</div>)}</div></div>;
          })}
          {upcomingEvents.length === 0 && <p className="col-span-full rounded-lg bg-[var(--bg)] p-3 text-sm text-[var(--ink-4)]">Todavía no hay señales futuras. La sincronización automática volverá a consultar las fuentes en la próxima ejecución.</p>}
        </div>

        <details className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3"><summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">Agregar corrección o evento especial</summary><p className="mb-3 mt-2 text-xs text-[var(--ink-4)]">Úsalo para una señal excepcional que aún no aparezca en las fuentes automáticas.</p><div className="grid gap-2 md:grid-cols-4"><input placeholder="Nombre del evento" value={eventDraft.name} onChange={(event) => setEventDraft((draft) => ({ ...draft, name: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-sm text-[var(--ink)]" /><input type="date" value={eventDraft.startsOn} onChange={(event) => setEventDraft((draft) => ({ ...draft, startsOn: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-sm text-[var(--ink)]" /><input type="date" value={eventDraft.endsOn} onChange={(event) => setEventDraft((draft) => ({ ...draft, endsOn: event.target.value }))} className="h-9 rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-sm text-[var(--ink)]" /><button type="button" onClick={saveEvent} className="h-9 rounded bg-[var(--brand-navy)] px-3 text-sm font-medium text-white">Agregar excepción</button><label className="text-[10px] text-[var(--ink-4)]">Impacto potencial %<input type="number" value={eventDraft.impact} onChange={(event) => setEventDraft((draft) => ({ ...draft, impact: event.target.value }))} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label><label className="text-[10px] text-[var(--ink-4)]">Confianza económica %<input type="number" value={eventDraft.confidence} onChange={(event) => setEventDraft((draft) => ({ ...draft, confidence: event.target.value }))} className="mt-1 h-8 w-full rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></label><select value={eventDraft.status} onChange={(event) => setEventDraft((draft) => ({ ...draft, status: event.target.value }))} className="h-8 self-end rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]"><option value="candidate">Tentativo</option><option value="confirmed">Confirmado</option></select><input placeholder="Fuente" value={eventDraft.source} onChange={(event) => setEventDraft((draft) => ({ ...draft, source: event.target.value }))} className="h-8 self-end rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-2 text-xs text-[var(--ink)]" /></div>{manualEvents.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{manualEvents.slice(0, 12).map((event) => <span key={event.id} className="rounded-full border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-1 text-xs text-[var(--ink-2)]">{event.name} · {event.startsOn} · {event.impactBps / 100}% × {event.confidenceBps / 100}%</span>)}</div>}</details>
      </section>
    </div>
  );
}
