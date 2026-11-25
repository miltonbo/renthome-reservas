"use client";

import { useEffect, useState } from "react";

type Property = { id: number; name: string };
type RequestRow = {
  id: number; code: string; state: string; requestedPropertyId: number; assignedPropertyId: number | null;
  reservationId: number | null; checkIn: string; checkOut: string; guestName: string; phone: string;
  guests: number; totalMinor: number;
};
type StaffData = { configured: boolean; requests: RequestRow[]; properties: Property[] };
const control = "rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm";
const button = control + " font-semibold hover:bg-[var(--bg-3)] disabled:opacity-50";

export function RentHomeStaffPanel({ onOpen, onConfirmed }: { onOpen: (id: number) => void; onConfirmed?: () => void | Promise<void> }) {
  const [data, setData] = useState<StaffData>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<number>();
  const [selected, setSelected] = useState<Record<number, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchStaffData(controller.signal).then(setData).catch((error) => {
      if (!controller.signal.aborted) setMessage(error.message);
    });
    return () => controller.abort();
  }, []);
  async function act(row: RequestRow, action: string) {
    setBusy(row.id); setMessage("");
    try {
      const response = await fetch("/api/renthome-staff", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, action, propertyId: Number(selected[row.id] ?? row.assignedPropertyId ?? row.requestedPropertyId) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(await fetchStaffData());
      if (result.reservationId) await onConfirmed?.();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(undefined); }
  }
  if (!data) return <p className="text-sm" role="status">{message || "Cargando solicitudes directas…"}</p>;
  if (!data.configured) return null;
  const propertyName = (id: number | null) => data.properties.find((property) => property.id === id)?.name ?? "Sin asignar";
  const stateLabels: Record<string, string> = { pending: "Preconfirmada", confirmed: "Confirmada", discarded: "Descartada" };
  return <section className="space-y-3 rounded-xl border border-[var(--line)] p-4">
    <h2 className="font-semibold">Directas web</h2>
    {message && <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">{message}</p>}
    {!data.requests.length && <p className="text-sm text-[var(--ink-3)]">Aún no hay solicitudes de la web de RentHome.</p>}
    <div className="space-y-2">
      {data.requests.map((row) => <details key={row.id} className="rounded-lg border border-[var(--line)] p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {row.code} · {row.guestName} · {row.checkIn} a {row.checkOut} · {stateLabels[row.state] ?? row.state}
          <span className="ml-2 font-normal underline">Ver reserva</span>
        </summary>
        <div className="mt-3 grid gap-2 text-sm">
          <p>{row.guests} huésped(es) · Bs {(row.totalMinor / 100).toLocaleString("es-BO")} · {" "}
            <a className="underline" target="_blank" rel="noreferrer" href={`https://wa.me/${row.phone.startsWith("+") ? row.phone.slice(1) : row.phone.length === 8 ? "591" + row.phone : row.phone}`}>WhatsApp {row.phone}</a>
          </p>
          <p>Solicitado: {propertyName(row.requestedPropertyId)} · Asignado: {propertyName(row.assignedPropertyId)}</p>
          {row.state === "pending" && <div className="flex flex-wrap gap-2">
            <select className={control} aria-label="Departamento para asignar" value={selected[row.id] ?? String(row.assignedPropertyId ?? row.requestedPropertyId)}
              onChange={(event) => setSelected({ ...selected, [row.id]: event.target.value })}>
              {data.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
            </select>
            <button className={button} type="button" disabled={busy !== undefined} onClick={() => void act(row, "assign")}>Asignar departamento</button>
            <button className={button} type="button" disabled={busy !== undefined || !row.assignedPropertyId || (selected[row.id] !== undefined && selected[row.id] !== String(row.assignedPropertyId))} onClick={() => void act(row, "confirm")}>Confirmar {row.assignedPropertyId ? propertyName(row.assignedPropertyId) : ""}</button>
            <button className={button} type="button" disabled={busy !== undefined} onClick={() => void act(row, "discard")}>Descartar</button>
          </div>}
          {row.reservationId && <button type="button" className={button + " justify-self-start"} onClick={() => onOpen(row.reservationId!)}>Abrir reserva confirmada</button>}
        </div>
      </details>)}
    </div>
  </section>;
}

async function fetchStaffData(signal?: AbortSignal): Promise<StaffData> {
  const response = await fetch("/api/renthome-staff", { signal });
  if (!response.ok) throw new Error("No se pudieron cargar las solicitudes.");
  return response.json();
}
