"use client";

import { ArrowLeft, CircleCheck, Download, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { rentHomeBackToResults, rentHomeReceiptKey, type RentHomeReceipt } from "@/lib/renthome-booking-links";
import type { RentHomeGroupUnit } from "@/lib/renthome-group";
import { downloadRentHomeReceipt } from "@/lib/reservation-receipt";
import { rentHomeDateLabel, type RentHomeDates } from "./renthome-search";
import { RentHomeStaySavings } from "./renthome-stay-savings";

const button = "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--rh-brand)] px-4 font-bold text-white hover:bg-[var(--rh-deep)] disabled:opacity-60";
const input = "mt-1.5 block min-h-12 w-full rounded-lg border border-[var(--rh-line)] bg-[var(--rh-bg)] px-3 text-base";
const format = (amount: number) => `Bs ${(amount / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
let latestReceipt: string | null = null;

function saveReceipt(receipt: RentHomeReceipt) {
  latestReceipt = JSON.stringify(receipt);
  try { sessionStorage.setItem(rentHomeReceiptKey, latestReceipt); } catch { /* Continue with the in-memory receipt. */ }
}

type Contact = { guestName: string; phone: string; displayPhone: string };

export function RentHomeCheckout({ dates, units, building }: {
  dates: RentHomeDates; units: (RentHomeGroupUnit & { photos: string[] })[]; building?: string;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const inFlight = useRef(false);
  const phoneDialog = useRef<HTMLDialogElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const totalMinor = units.reduce((total, unit) => total + unit.totalMinor, 0);

  async function submit(confirmedContact: Contact, confirmAnother = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    setWarning("");
    let accepted = false;
    try {
      const selected = units.length === 1 ? { propertyId: units[0].propertyId }
        : { units: units.map(({ propertyId, totalMinor }) => ({ propertyId, totalMinor })) };
      const res = await fetch("/api/renthome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dates, ...selected, totalMinor, guestName: confirmedContact.guestName, phone: confirmedContact.phone, confirmAnother }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "active_request") {
        setWarning(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar tu solicitud.");
      const receipt: RentHomeReceipt = {
        code: data.code, whatsapp: data.whatsapp,
        stay: { ...dates, guestName: confirmedContact.guestName, propertyTitles: units.map((unit) => unit.title) },
      };
      accepted = true;
      saveReceipt(receipt);
      router.replace("/renthome/confirmacion");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!accepted) {
        inFlight.current = false;
        setSending(false);
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || warning) return;
    const fields = new FormData(event.currentTarget);
    const guestName = String(fields.get("guestName")).trim();
    const code = String(fields.get("countryCode")).trim().replace(/^\+/, "");
    const number = String(fields.get("phone")).replace(/[\s().-]/g, "");
    const phone = `+${code}${number}`;
    if (guestName.length < 2 || !/^[1-9]\d{0,2}$/.test(code) || !/^\d{4,14}$/.test(number) || !/^\+\d{8,15}$/.test(phone)) {
      setError("Revisa tu nombre, el código de país y el número de WhatsApp.");
      return;
    }
    setError("");
    setContact({ guestName, phone, displayPhone: `+${code} ${number}` });
    phoneDialog.current?.showModal();
  }

  return <main className="mx-auto max-w-2xl px-4 pb-16 pt-7 sm:pt-12">
    <Link href={rentHomeBackToResults(dates)} className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--rh-brand)] hover:underline"><ArrowLeft size={16} aria-hidden /> Volver a las opciones</Link>
    <div className="space-y-6 rounded-2xl border border-[var(--rh-line)] bg-white p-5 sm:p-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Completa tu reserva</h1>
        <p className="mt-2 text-sm text-[var(--rh-muted)]">{rentHomeDateLabel(dates.checkIn)} al {rentHomeDateLabel(dates.checkOut)} · {dates.guests} {dates.guests === "1" ? "huésped" : "huéspedes"}{building && ` · ${building}`}</p>
      </div>
      <div className="rounded-xl bg-[var(--rh-tint)] px-4 py-2">
        <ul className="divide-y divide-[var(--rh-line)]">
          {units.map((unit) => <li key={unit.propertyId} className="space-y-2.5 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span>{unit.title}</span><strong className="shrink-0 tabular-nums">{format(unit.totalMinor)}</strong>
            </div>
            {unit.photos.length > 0 && <div className="grid grid-cols-3 gap-2">
              {unit.photos.map((photo, index) => <Image key={photo} unoptimized
                src={`/api/renthome/photos/${unit.propertyId}/${photo}`} alt={`${unit.title}, foto ${index + 1}`} width={240} height={160}
                className="aspect-[3/2] w-full rounded-lg object-cover" />)}
            </div>}
          </li>)}
        </ul>
        <p className="flex justify-between gap-3 border-t border-[var(--rh-line)] py-2.5 font-extrabold">Total de la estadía <span className="tabular-nums">{format(totalMinor)}</span></p>
        <RentHomeStaySavings dates={dates} savingsMinor={units.reduce((sum, unit) => sum + unit.savingsMinor, 0)} />
      </div>
      <form onSubmit={handleSubmit} onInput={() => { setWarning(""); setError(""); }} className="space-y-4">
        <label className="block text-sm font-bold">Nombre completo<input className={input} name="guestName" autoComplete="name" minLength={2} maxLength={120} required disabled={sending} /></label>
        <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
          <label className="block text-sm font-bold">Código de país<input className={input} name="countryCode" type="tel" autoComplete="tel-country-code" defaultValue="+591" maxLength={4} required disabled={sending} /></label>
          <label className="block text-sm font-bold">Número de WhatsApp<input ref={phoneInput} className={input} name="phone" type="tel" autoComplete="tel-national" maxLength={24} required disabled={sending} /></label>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {warning ? <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p role="alert" className="text-sm text-amber-950">{warning}</p>
          <button type="button" className={button} disabled={sending} onClick={() => { if (contact) void submit(contact, true); }}>Enviar otra solicitud</button>
        </div> : <button type="submit" className={button + " w-full"} disabled={sending}>{sending ? "Enviando…" : "Enviar solicitud"}</button>}
      </form>
      <dialog ref={phoneDialog} aria-labelledby="renthome-confirm-phone" className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-[var(--rh-line)] bg-white p-6 text-[var(--rh-ink)] backdrop:bg-[var(--rh-deep)]/50">
        <h2 id="renthome-confirm-phone" className="text-xl font-extrabold">Confirma tu número de WhatsApp</h2>
        <p className="mt-2 text-sm text-[var(--rh-muted)]">Te contactaremos para confirmar la reserva.</p>
        <p className="mt-3 text-lg font-extrabold tabular-nums">{contact?.displayPhone}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" className="min-h-12 px-2 text-sm font-bold text-[var(--rh-brand)] hover:underline" onClick={() => { phoneDialog.current?.close(); phoneInput.current?.focus(); }}>Editar número</button>
          <button type="button" className={button} onClick={() => { phoneDialog.current?.close(); if (contact) void submit(contact); }}>Confirmar y enviar</button>
        </div>
      </dialog>
      <p className="text-sm text-[var(--rh-muted)]">RentHome confirma la disponibilidad final por WhatsApp.</p>
    </div>
  </main>;
}

const subscribe = () => () => {};
const serverReceipt = () => undefined;
function readReceipt() {
  try { return sessionStorage.getItem(rentHomeReceiptKey) ?? latestReceipt; } catch { return latestReceipt; }
}

function parseReceipt(stored: string | null | undefined): RentHomeReceipt | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return typeof parsed?.code === "string" && typeof parsed.whatsapp === "string" &&
      parsed.whatsapp.startsWith("https://wa.me/") ? parsed : null;
  } catch { return null; }
}

export function RentHomeConfirmation() {
  const stored = useSyncExternalStore(subscribe, readReceipt, serverReceipt);
  const receipt = parseReceipt(stored);
  const [downloadError, setDownloadError] = useState("");
  return <main className="mx-auto max-w-xl px-4 py-12 sm:py-20">
    <section className="space-y-5 rounded-2xl border border-[var(--rh-line)] bg-white p-6 sm:p-9">
      {stored === undefined ? <p role="status">Cargando comprobante…</p> : receipt ? <>
        <CircleCheck size={38} className="text-[var(--rh-brand)]" aria-hidden />
        <div>
          <h1 className="text-3xl font-extrabold">Solicitud de reserva registrada</h1>
          <p className="mt-2 text-[var(--rh-muted)]">{receipt.stay ? `${receipt.stay.guestName.split(/\s+/)[0]}, tu` : "Tu"} reserva está <strong className="font-bold text-[var(--rh-ink)]">preconfirmada</strong>.</p>
        </div>
        <div className="rounded-xl bg-[var(--rh-tint)] p-4">
          <p className="text-sm font-bold text-[var(--rh-muted)]">Número de reserva</p>
          <p className="mt-1 break-words text-xl font-extrabold tabular-nums">{receipt.code}</p>
        </div>
        <ul className="list-none space-y-1 text-sm leading-relaxed text-[var(--rh-muted)]">
          <li className="flex gap-2"><span aria-hidden="true">–</span><span>Para confirmar su reserva, te enviaremos los métodos de pago por Whatsapp para pagar una noche por adelantado.</span></li>
          <li className="flex gap-2"><span aria-hidden="true">–</span><span>Pagarás el saldo a tu llegada.</span></li>
        </ul>
        <div className="grid gap-3">
          <a href={receipt.whatsapp} target="_blank" rel="noreferrer" className={button + " w-full"}><MessageCircle size={18} aria-hidden /> Confirmar la reserva</a>
          {receipt.stay && <button type="button" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[var(--rh-line)] px-4 font-bold text-[var(--rh-brand)] hover:bg-[var(--rh-tint)]"
            onClick={() => {
              setDownloadError("");
              void downloadRentHomeReceipt(receipt.code, receipt.stay!).catch(() => setDownloadError("No se pudo descargar el comprobante. Intenta nuevamente."));
            }}><Download size={18} aria-hidden /> Descargar comprobante de reserva</button>}
          {downloadError && <p role="alert" className="text-sm text-red-800">{downloadError}</p>}
        </div>
      </> : <h1 className="text-2xl font-extrabold">Comprobante no disponible</h1>}
      <Link href="/renthome" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--rh-brand)] hover:underline"><ArrowLeft size={16} aria-hidden /> Volver a RentHome</Link>
    </section>
  </main>;
}
