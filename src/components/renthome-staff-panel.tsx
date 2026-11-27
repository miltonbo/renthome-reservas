"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseReservationDate, reservationNights } from "@/lib/reservation-dates";
import { ReservationFormDialog, ReservationFormTotal, reservationFieldControl, reservationFieldLabel } from "@/components/reservation-form-dialog";

type Property = { id: number; name: string };
type RequestRow = {
  id: number; code: string; state: string; requestedPropertyId: number; assignedPropertyId: number | null;
  reservationId: number | null; checkIn: string; checkOut: string; guestName: string; phone: string;
  guests: number; totalMinor: number;
  units: { propertyId: number; guests: number; totalMinor: number; reservationId: number | null }[];
};
type StaffData = { configured: boolean; requests: RequestRow[]; properties: Property[] };
const control = "rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm";
const button = control + " font-semibold hover:bg-[var(--bg-3)] disabled:opacity-50";
const moneyFormatter = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const price = (minor: number) => `Bs ${moneyFormatter.format(minor / 100)}`;
const stateLabels: Record<string, string> = { pending: "Preconfirmada", confirmed: "Confirmada", discarded: "Descartada" };
const stateColors: Record<string, string> = {
  pending: "border-amber-500/40 bg-amber-400/15 text-amber-900 dark:text-amber-200",
  confirmed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
};
const stayDateFormatter = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeZone: "UTC" });
const stayDate = (value: string) => {
  const date = parseReservationDate(value);
  return date ? stayDateFormatter.format(date) : value;
};

function RequestField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0">
    <dt className="inline font-bold">{label}: </dt>
    <dd className="inline break-words font-normal">{children}</dd>
  </div>;
}

export function RentHomeStaffPanel({ onOpen, onConfirmed }: { onOpen: (id: number) => void; onConfirmed?: () => void | Promise<void> }) {
  const [data, setData] = useState<StaffData>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number>();
  const [assignment, setAssignment] = useState<{ row: RequestRow; propertyId: number } | null>(null);
  const [assignmentError, setAssignmentError] = useState("");
  const assignmentTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStaffData(controller.signal).then(setData).catch((error) => {
      if (!controller.signal.aborted) setMessage(error.message);
    });
    return () => controller.abort();
  }, []);
  function closeAssignment() {
    setAssignment(null);
    setAssignmentError("");
    const trigger = assignmentTrigger.current;
    assignmentTrigger.current = null;
    requestAnimationFrame(() => trigger?.focus());
  }

  async function act(row: RequestRow, action: "confirm" | "discard", propertyId?: number) {
    if (busy !== undefined) return;
    setBusy(row.id); setMessage("");
    setAssignmentError("");
    try {
      const response = await fetch("/api/renthome-staff", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action, propertyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (propertyId !== undefined) {
        setData((current) => current && ({
          ...current,
          requests: current.requests.map((request) => request.id === row.id
            ? { ...request, state: "confirmed", assignedPropertyId: propertyId, reservationId: result.reservationId }
            : request),
        }));
        closeAssignment();
      } else {
        setData(await fetchStaffData());
      }
      if (result.reservationId) await onConfirmed?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar la solicitud.";
      if (propertyId !== undefined && assignmentTrigger.current) setAssignmentError(message);
      else setMessage(message);
    }
    finally { setBusy(undefined); }
  }
  if (!data) return <p className="text-sm" role="status">{message || "Cargando solicitudes directas…"}</p>;
  if (!data.configured) return null;
  const propertyName = (id: number | null) => data.properties.find((property) => property.id === id)?.name ?? "Sin asignar";
  return <section className="space-y-3 rounded-xl border border-[var(--line)] p-4">
    <h2 className="font-semibold">Directas web</h2>
    {message && <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">{message}</p>}
    {!data.requests.length && <p className="text-sm text-[var(--ink-3)]">Aún no hay solicitudes de la web de RentHome.</p>}
    <div className="space-y-2">
      {data.requests.map((row) => {
        const nights = reservationNights(row.checkIn, row.checkOut);
        const group = row.units.length > 0;
        const requested = group ? row.units.map((unit) => propertyName(unit.propertyId)).join(", ") : propertyName(row.requestedPropertyId);
        const assigned = group ? row.units.filter((unit) => unit.reservationId !== null).map((unit) => propertyName(unit.propertyId)).join(", ") || "Sin asignar"
          : propertyName(row.assignedPropertyId);
        return <details key={row.id} className="rounded-lg border border-[var(--line)] p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {row.code} · {row.guestName} · {row.checkIn} a {row.checkOut}{" "}
            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${stateColors[row.state] ?? "border-[var(--line)] bg-[var(--bg-3)] text-[var(--ink-3)]"}`}>{stateLabels[row.state] ?? row.state}</span>
            <span className="ml-2 font-normal underline">Ver reserva</span>
          </summary>
          <div className="mt-3 grid gap-3 border-t border-[var(--line)] pt-3 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              <RequestField label="Cantidad de huéspedes">{row.guests}</RequestField>
              <RequestField label="Cantidad de noches">{nights || "—"}</RequestField>
              <RequestField label="Precio total">{price(row.totalMinor)}</RequestField>
              <RequestField label="Precio promedio por noche">{nights ? price(row.totalMinor / nights) : "—"}</RequestField>
              <RequestField label="Solicitado">{requested}</RequestField>
              <RequestField label="Asignado">{assigned}</RequestField>
              <RequestField label="WhatsApp">
                <a className="underline" target="_blank" rel="noreferrer" href={`https://wa.me/${row.phone.startsWith("+") ? row.phone.slice(1) : row.phone.length === 8 ? "591" + row.phone : row.phone}`}>{row.phone}</a>
              </RequestField>
            </dl>
            {group && <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] px-3" aria-label="Departamentos de la solicitud grupal">
              {row.units.map((unit) => <li key={unit.propertyId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <dl className="flex flex-wrap gap-x-5 gap-y-1">
                  <RequestField label="Departamento">{propertyName(unit.propertyId)}</RequestField>
                  <RequestField label="Huéspedes">{unit.guests}</RequestField>
                  <RequestField label="Precio total">{price(unit.totalMinor)}</RequestField>
                  <RequestField label="Promedio por noche">{nights ? price(unit.totalMinor / nights) : "—"}</RequestField>
                </dl>
                {unit.reservationId && <button type="button" className={button} onClick={() => onOpen(unit.reservationId!)}>Abrir reserva</button>}
              </li>)}
            </ul>}
            {row.state === "pending" && row.units.length > 0 && <div className="flex flex-wrap gap-2">
              <button className={button} type="button" disabled={busy !== undefined} onClick={() => void act(row, "confirm")}>Confirmar los {row.units.length} departamentos</button>
              <button className={button} type="button" disabled={busy !== undefined} onClick={() => void act(row, "discard")}>Descartar</button>
            </div>}
            {row.state === "pending" && !row.units.length && <div className="flex flex-wrap gap-2">
              <button className={button} type="button" disabled={busy !== undefined} onClick={(event) => {
                assignmentTrigger.current = event.currentTarget;
                setAssignment({ row, propertyId: row.assignedPropertyId ?? row.requestedPropertyId });
              }}>Asignar departamento</button>
              <button className={button} type="button" disabled={busy !== undefined} onClick={() => void act(row, "discard")}>Descartar</button>
            </div>}
            {row.reservationId && !row.units.length && <button type="button" className={button + " justify-self-start"} onClick={() => onOpen(row.reservationId!)}>Abrir reserva confirmada</button>}
          </div>
        </details>;
      })}
    </div>
    {assignment && <RentHomeAssignmentDialog
      row={assignment.row}
      propertyId={assignment.propertyId}
      properties={data.properties}
      requestedProperty={propertyName(assignment.row.requestedPropertyId)}
      error={assignmentError}
      saving={busy === assignment.row.id}
      onChange={(propertyId) => { setAssignment({ ...assignment, propertyId }); setAssignmentError(""); }}
      onClose={closeAssignment}
      onSubmit={() => void act(assignment.row, "confirm", assignment.propertyId)}
    />}
  </section>;
}

function RentHomeAssignmentDialog({ row, propertyId, properties, requestedProperty, error, saving, onChange, onClose, onSubmit }: {
  row: RequestRow; propertyId: number; properties: Property[]; requestedProperty: string;
  error: string; saving: boolean; onChange: (propertyId: number) => void; onClose: () => void; onSubmit: () => void;
}) {
  const nights = reservationNights(row.checkIn, row.checkOut);
  const canAssign = properties.some((property) => property.id === propertyId);
  return <ReservationFormDialog title="Asignar departamento"
    description={`Solicitud web ${row.code}. Al guardar, se confirmará la reserva en el departamento seleccionado.`}
    error={error} saving={saving} disabled={!canAssign} submitLabel="Asignar y confirmar" onClose={onClose}
    onSubmit={(event) => { event.preventDefault(); if (canAssign) onSubmit(); }}>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={reservationFieldLabel}>Departamento físico</span>
        <select autoFocus disabled={saving} required value={canAssign ? propertyId : ""} onChange={(event) => onChange(Number(event.target.value))} className={reservationFieldControl}>
          {!canAssign && <option value="">Seleccionar departamento</option>}
          {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
        </select>
      </label>
      <AssignmentValue label="Nombre del huésped" value={row.guestName} />
      <AssignmentValue label="WhatsApp" value={row.phone} />
      <AssignmentValue label="Canal" value="Directo · Web RentHome" />
      <AssignmentValue label="Departamento solicitado" value={requestedProperty} />
      <AssignmentValue label="Estadía" value={`${stayDate(row.checkIn)} — ${stayDate(row.checkOut)}`} />
      <AssignmentValue label="Cantidad de noches" value={nights ? String(nights) : "—"} />
      <AssignmentValue label="Cantidad de huéspedes" value={String(row.guests)} />
      <AssignmentValue label="Precio promedio por noche" value={nights ? price(row.totalMinor / nights) : "—"} />
      <ReservationFormTotal description="Hospedaje · Precio de la solicitud">{price(row.totalMinor)}</ReservationFormTotal>
    </div>
  </ReservationFormDialog>;
}

function AssignmentValue({ label, value }: { label: string; value: string }) {
  return <label className="min-w-0">
    <span className={reservationFieldLabel}>{label}</span>
    <input className={reservationFieldControl} readOnly value={value} />
  </label>;
}

async function fetchStaffData(signal?: AbortSignal): Promise<StaffData> {
  const response = await fetch("/api/renthome-staff", { signal });
  if (!response.ok) throw new Error("No se pudieron cargar las solicitudes.");
  return response.json();
}
