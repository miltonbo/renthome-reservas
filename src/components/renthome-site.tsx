"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Grid2X2, MapPin, MessageCircle, Users, X } from "lucide-react";
import { RentHomeAmenities } from "./renthome-amenities";
import { RentHomeSearch, rentHomeDateLabel as dateLabel, type RentHomeDates as Dates } from "./renthome-search";
import { parseReservationDate, reservationNights } from "@/lib/reservation-dates";
import { rentHomePublicLocation, rentHomeServices, type RentHomeDetails } from "@/lib/renthome-listing-details";

type Listing = {
  id: number; details: RentHomeDetails; photos: string[];
  checkInTime: string; checkOutTime: string; totalMinor: number | null;
};
type StayRequest = Dates & { propertyId: number; totalMinor: number; guestName: FormDataEntryValue | null; phone: FormDataEntryValue | null };
const money = (amount: number) => `Bs ${(amount / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
const photoUrl = (id: number, photo: string) => `/api/renthome/photos/${id}/${photo}`;
const filters = ["Piscina", "Balcón", "Gimnasio", "Cowork", "Sauna"];
const RentHomeResultsMap = dynamic(() => import("./renthome-results-map"), {
  ssr: false,
  loading: () => <div className="h-[330px] rounded-2xl border border-[#dce2e2] bg-[#e7eeeb] lg:h-[420px]" role="status"><span className="sr-only">Cargando mapa…</span></div>,
});

function ListingCard({ listing, query }: { listing: Listing; query: Dates | null }) {
  const [index, setIndex] = useState(0);
  const url = `/renthome/${listing.id}${query ? `?${new URLSearchParams(query)}` : ""}`;
  const current = index % Math.max(listing.photos.length, 1);
  return (
    <article className="group min-w-0 overflow-hidden rounded-2xl border border-[#dce2e2] bg-white shadow-[0_8px_24px_#10272908] transition-shadow hover:shadow-[0_12px_32px_#10272916]">
      <div className="relative aspect-[4/3] bg-[#e7eeeb]">
        <Link href={url} className="absolute inset-0" aria-label={`Ver ${listing.details.title}`}>
          {listing.photos[current] && <Image fill unoptimized loading="lazy" sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 32vw" src={photoUrl(listing.id, listing.photos[current])}
            alt={`${listing.details.title}, foto ${current + 1}`} className="object-cover" />}
        </Link>
        {listing.photos.length > 1 && <>
          <button type="button" aria-label={`Foto anterior de ${listing.details.title}`} onClick={() => setIndex((current + listing.photos.length - 1) % listing.photos.length)} className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#132a34] shadow-sm hover:bg-white"><ChevronLeft size={19} aria-hidden /></button>
          <button type="button" aria-label={`Foto siguiente de ${listing.details.title}`} onClick={() => setIndex((current + 1) % listing.photos.length)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[#132a34] shadow-sm hover:bg-white"><ChevronRight size={19} aria-hidden /></button>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[#122a33]/85 px-2.5 py-1 text-xs font-semibold text-white">{current + 1} / {listing.photos.length}</span>
        </>}
      </div>
      <div className="space-y-3 p-5">
        <p className="flex items-center gap-1.5 text-sm text-[#466069]"><MapPin size={16} aria-hidden /> {rentHomePublicLocation(listing.details)}</p>
        <h3 className="text-xl font-bold leading-tight tracking-tight"><Link href={url} className="hover:underline">{listing.details.title}</Link></h3>
        <p className="flex items-center gap-2 text-sm text-[#466069]"><Users size={17} aria-hidden /> Hasta {listing.details.capacity} huéspedes</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Servicios destacados">
          {rentHomeServices(listing.details.services).slice(0, 4).map((service) => <li key={service} className="rounded-md bg-[#eef3f0] px-2 py-1 text-sm text-[#28433d]">{service}</li>)}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e0e7e6] pt-3">
          <span className="text-sm text-[#466069]">{listing.totalMinor != null ? <><strong className="text-lg text-[#132a34]">{money(listing.totalMinor)}</strong> total</> : "Consulta el precio por fechas"}</span>
          <Link href={url} className="font-semibold text-[#075749] hover:underline">Ver alojamiento</Link>
        </div>
      </div>
    </article>
  );
}

export function RentHomeSite({ propertyId, initialDates }: { propertyId?: number; initialDates?: Partial<Dates> }) {
  const [dates, setDates] = useState<Dates>(() => ({
    checkIn: parseReservationDate(initialDates?.checkIn)?.toISOString().slice(0, 10) ?? "",
    checkOut: parseReservationDate(initialDates?.checkOut)?.toISOString().slice(0, 10) ?? "",
    guests: /^(?:[1-9]|[1-4]\d|50)$/.test(initialDates?.guests ?? "") ? initialDates!.guests! : "2",
  }));
  const [query, setQuery] = useState<Dates | null>(dates.checkIn && dates.checkOut ? dates : null);
  const [catalog, setCatalog] = useState<Listing[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<{ request: StayRequest; message: string }>();
  const [receipt, setReceipt] = useState<{ code: string; whatsapp: string }>();
  const [filter, setFilter] = useState("");
  const [activePhoto, setActivePhoto] = useState(0);
  const gallery = useRef<HTMLDialogElement>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/renthome", { signal: controller.signal }),
          query ? fetch(`/api/renthome?${new URLSearchParams(query)}`, { signal: controller.signal }) : null,
        ]);
        const base = await responses[0].json();
        if (!responses[0].ok) throw new Error("No se pudo cargar el catálogo.");
        setCatalog(base.listings);
        if (responses[1]) {
          const options = await responses[1].json();
          if (!responses[1].ok) throw new Error(options.error ?? "No se pudo consultar la disponibilidad.");
          setResults(options.listings);
        }
      } catch (err) {
        if (!controller.signal.aborted) { setResults([]); setError((err as Error).message); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [query]);

  const property = catalog.find((item) => item.id === propertyId);
  const option = results.find((item) => item.id === propertyId);
  const allCards = query ? results : catalog;
  const cards = filter ? allCards.filter((item) => item.details.services.toLowerCase().includes(filter.toLowerCase())) : allCards;
  const featured = catalog.find((item) => item.details.title.includes("Sky Luxia") && item.photos.length) ?? catalog.find((item) => item.photos.length);
  const heroPhoto = featured ? photoUrl(featured.id, featured.photos[0]) : "/marketing/short-stay-rooftop-pool.webp";

  function requestStay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query || !option?.totalMinor || sending || confirmation) return;
    const form = new FormData(event.currentTarget);
    void sendRequest({ ...query, propertyId: option.id, totalMinor: option.totalMinor, guestName: form.get("guestName"), phone: form.get("phone") });
  }

  async function sendRequest(request: StayRequest, confirmAnother = false) {
    setSending(true);
    setError("");
    setConfirmation(undefined);
    try {
      const res = await fetch("/api/renthome", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, confirmAnother }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "active_request") {
        setConfirmation({ request, message: data.error });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar la solicitud.");
      setReceipt(data);
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); }
  }

  const input = "mt-1 block min-w-0 w-full rounded-lg border border-[#c6d3d1] bg-white px-3 py-2.5 text-[#132a34] focus-visible:outline-2 focus-visible:outline-[#075749]";
  const button = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#075749] px-4 py-3 font-semibold text-white hover:bg-[#063e35] disabled:opacity-60";
  const search = <RentHomeSearch dates={dates} today={today} loading={loading || sending} compact={!!propertyId}
    onChange={setDates} onSearch={() => { setConfirmation(undefined); setError(""); setFilter(""); setLoading(true); setQuery({ ...dates }); }} />;
  const reservationCard = property && <aside id="reserva-directa" aria-label="Reserva directa" className="min-w-0 scroll-mt-4 space-y-4 rounded-2xl border border-[#dce2e2] bg-white p-5 shadow-[0_12px_28px_#1027290e] lg:sticky lg:top-5">
    {receipt ? <section className="space-y-3" role="status">
      <h2 className="text-2xl font-bold">Solicitud recibida</h2>
      <p>Código <strong>{receipt.code}</strong></p>
      <p className="text-sm">Te contactaremos por WhatsApp. Las fechas quedan sujetas a disponibilidad hasta que RentHome confirme la reserva.</p>
      <a className={button + " w-full"} href={receipt.whatsapp} target="_blank" rel="noreferrer">Continuar por WhatsApp</a>
    </section> : <>
      <div>
        <h2 className="text-xl font-extrabold">{!loading && option?.totalMinor != null ? money(option.totalMinor) : "Reserva directa"}</h2>
        <p className="mt-1 text-sm text-[#466069]">{!loading && option?.totalMinor != null && query ? `Total por ${reservationNights(query.checkIn, query.checkOut)} noches` : "Elige fechas para ver el precio total."}</p>
      </div>
      {search}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!loading && query && !option && !error && <p role="status" className="text-sm text-[#466069]">No hay disponibilidad para las fechas y huéspedes seleccionados.</p>}
      {!loading && option?.totalMinor != null && <form onSubmit={requestStay} onInput={() => setConfirmation(undefined)} className="space-y-3 border-t border-[#dce2e2] pt-4">
        <h3 className="font-bold">Solicitar reserva</h3>
        {query && <p className="text-sm">{dateLabel(query.checkIn)} a {dateLabel(query.checkOut)} · {query.guests} huésped(es)</p>}
        <label className="block text-sm font-semibold">Nombre completo<input required disabled={sending} minLength={2} maxLength={120} name="guestName" autoComplete="name" className={input} /></label>
        <label className="block text-sm font-semibold">WhatsApp con código de país<input required disabled={sending} maxLength={24} name="phone" type="tel" autoComplete="tel" className={input} placeholder="+591" /></label>
        {confirmation ? <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p role="alert" className="text-sm text-amber-950">{confirmation.message}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} onClick={() => void sendRequest(confirmation.request, true)}>Enviar otra solicitud</button>
            <button type="button" className="rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-950" onClick={() => setConfirmation(undefined)}>Cancelar</button>
          </div>
        </div> : <button className={button + " w-full"} disabled={sending}>{sending ? "Enviando…" : "Enviar solicitud"}</button>}
      </form>}
      <p className="flex items-start gap-2 border-t border-[#dce2e2] pt-3 text-sm text-[#466069]"><MessageCircle size={17} className="mt-0.5 shrink-0 text-[#075749]" aria-hidden /> RentHome confirma tu solicitud por WhatsApp.</p>
    </>}
  </aside>;
  return (
    <main className="min-h-screen bg-[#f7f9f8] text-[#132a34]">
      <header className="border-b border-[#e2e8e6] bg-white">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-9">
          <Link href="/renthome" className="inline-flex items-center gap-2.5" aria-label="RentHome Departamentos, inicio">
            <Image src="/brand/renthome-mark.png" alt="" width={62} height={62} priority className="h-12 w-12 object-contain sm:h-[62px] sm:w-[62px]" />
            <span className="flex flex-col">
              <span className="text-[2rem] font-extrabold leading-none tracking-[-.055em] sm:text-[2.4rem]"><span className="text-[#a9520a]">Rent</span>Home</span>
              <span className="mt-1 text-xs font-bold uppercase tracking-[.17em] text-[#466069]">Departamentos</span>
            </span>
          </Link>
          <nav aria-label="Navegación de RentHome" className="flex items-center gap-4 text-sm font-semibold sm:gap-6">
            <Link href="/renthome#departamentos" className="hidden hover:underline sm:inline">Departamentos</Link>
            <a href="https://wa.me/59177175497" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#b9cbc5] px-3 py-2.5 text-[#075749] hover:bg-[#eef3f0]"><MessageCircle size={18} aria-hidden /> <span className="sr-only sm:not-sr-only">Contacto</span></a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-[1320px] px-5 pb-16 pt-5 sm:px-9 sm:pt-8">
        {!propertyId && <div className="grid overflow-hidden rounded-[1.6rem] bg-[#102a33] text-white md:grid-cols-[1fr_1.12fr]">
          <div className="flex flex-col justify-center px-6 pb-8 pt-9 sm:px-10 md:py-12 lg:px-13">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#f8c48d]"><MapPin size={18} aria-hidden /> Santa Cruz de la Sierra, Bolivia</p>
            <h1 className="max-w-xl text-[clamp(2.45rem,5vw,4.3rem)] font-extrabold leading-[1.03] tracking-[-.055em]">Tu próximo departamento <span className="text-[#f8c48d]">en Equipetrol.</span></h1>
            <p className="mt-5 max-w-[29rem] text-lg leading-relaxed text-[#e2eced]">Explora alojamientos amoblados, compara lo que ofrece cada uno y solicita tu reserva directamente con RentHome.</p>
          </div>
          <div className="relative min-h-[245px] bg-[#23404a] md:min-h-[392px]">
            <Image priority={!!featured} fill unoptimized={!!featured} sizes="(max-width: 767px) 95vw, 55vw" src={heroPhoto}
              alt={featured ? featured.details.title : ""} className="object-cover object-center" />
            {featured && <Link href={`/renthome/${featured.id}`} className="absolute bottom-4 right-4 max-w-[calc(100%_-_2rem)] rounded-lg bg-[#102a33]/90 px-3 py-2 text-sm font-semibold text-white hover:underline">{featured.details.title}</Link>}
          </div>
        </div>}
        {property && <>
          <Link href="/renthome#departamentos" className="mb-5 inline-block text-sm font-semibold text-[#075749] hover:underline">Todos los departamentos</Link>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight sm:text-5xl">{property.details.title}</h1>
          <p className="mb-4 flex items-center gap-2 text-[#466069]"><MapPin size={18} aria-hidden /> {rentHomePublicLocation(property.details)}</p>
          <a href="#reserva-directa" className="mb-5 inline-block font-semibold text-[#075749] underline lg:hidden">Consultar disponibilidad</a>
          {property.photos.length > 0 && <>
            <div className="relative mb-7 overflow-hidden rounded-[1.2rem] bg-[#e7eeeb]">
              <div className="grid h-[280px] grid-cols-2 gap-1.5 sm:h-[350px] sm:grid-cols-4 sm:grid-rows-2 lg:h-[430px]">
                {property.photos.length >= 5 ? property.photos.slice(0, 5).map((photo, index) => (
                  <button type="button" key={photo} onClick={() => { setActivePhoto(index); gallery.current?.showModal(); }}
                    aria-label={`Abrir foto ${index + 1}`}
                    className={`relative overflow-hidden focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-white ${index === 0 ? "col-span-2 sm:row-span-2" : "hidden sm:block"}`}>
                    <Image fill unoptimized priority={index === 0} sizes={index === 0 ? "(max-width: 640px) 90vw, 50vw" : "25vw"}
                      src={photoUrl(property.id, photo)} alt={`${property.details.title}, foto ${index + 1}`} className="object-cover transition-transform hover:scale-[1.025]" />
                  </button>
                )) : <button type="button" aria-label="Abrir galería" onClick={() => { setActivePhoto(0); gallery.current?.showModal(); }} className="relative col-span-full row-span-full">
                  <Image fill unoptimized priority sizes="95vw" src={photoUrl(property.id, property.photos[0])} alt={property.details.title} className="object-cover" />
                </button>}
              </div>
              <button type="button" onClick={() => { setActivePhoto(0); gallery.current?.showModal(); }}
                className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg bg-[#102a33] px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-[#075749] sm:bottom-4 sm:right-4">
                <Grid2X2 size={16} aria-hidden /> Ver las {property.photos.length} fotos
              </button>
            </div>
            <dialog ref={gallery} aria-label="Galería del alojamiento"
              onKeyDown={(event) => {
                const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
                if (direction) setActivePhoto((index) => (index + direction + property.photos.length) % property.photos.length);
              }}
              className="m-auto w-[min(94vw,900px)] max-w-none rounded-2xl border-0 bg-[#102a33] p-3 text-white backdrop:bg-[#09171c]/85 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-semibold">{property.details.title} · {activePhoto + 1} de {property.photos.length}</h2>
                <button type="button" aria-label="Cerrar galería" onClick={() => gallery.current?.close()} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/45 hover:bg-white/10"><X size={20} aria-hidden /></button>
              </div>
              <div className="relative h-[min(65vh,550px)]">
                <Image fill unoptimized sizes="90vw" src={photoUrl(property.id, property.photos[activePhoto % property.photos.length])}
                  alt={`${property.details.title}, foto ${activePhoto + 1}`} className="object-contain" />
                {property.photos.length > 1 && <>
                  <button type="button" aria-label="Foto anterior" onClick={() => setActivePhoto((activePhoto + property.photos.length - 1) % property.photos.length)}
                    className="absolute left-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#132a34]"><ChevronLeft aria-hidden /></button>
                  <button type="button" aria-label="Foto siguiente" onClick={() => setActivePhoto((activePhoto + 1) % property.photos.length)}
                    className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-[#132a34]"><ChevronRight aria-hidden /></button>
                </>}
              </div>
            </dialog>
          </>}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
            <div className="min-w-0 space-y-6">
              <section className="rounded-2xl border border-[#dce2e2] bg-white p-5 sm:p-7">
                <h2 className="text-xl font-extrabold">Departamento completo</h2>
                <p className="mt-2 flex items-start gap-2 text-sm text-[#466069]"><Users size={17} className="mt-0.5 shrink-0" aria-hidden /><span>Hasta {property.details.capacity} huéspedes{property.details.layout && ` · ${property.details.layout}`}</span></p>
                <p className="mt-5 max-w-3xl whitespace-pre-line leading-relaxed text-[#344d56]">{property.details.description}</p>
              </section>
              <RentHomeAmenities services={property.details.services} />
              <section className="rounded-2xl border border-[#dce2e2] bg-white p-5 sm:p-7">
                <h2 className="mb-3 text-xl font-extrabold">Ubicación</h2>
                <p className="flex items-start gap-2 text-[#344d56]"><MapPin size={18} className="mt-0.5 shrink-0 text-[#075749]" aria-hidden />{rentHomePublicLocation(property.details)}</p>
                {property.details.locationNotes && <p className="mt-3 whitespace-pre-line text-[#344d56]">{property.details.locationNotes}</p>}
              </section>
              <section className="rounded-2xl border border-[#dce2e2] bg-white p-5 sm:p-7">
                <h2 className="mb-3 text-xl font-extrabold">Antes de tu estadía</h2>
                <p className="text-[#344d56]">Ingreso desde {property.checkInTime} · Salida hasta {property.checkOutTime}</p>
                {property.details.rules && <p className="mt-3 whitespace-pre-line text-[#344d56]">{property.details.rules}</p>}
              </section>
            </div>
            {reservationCard}
          </div>
        </>}
        {!propertyId && <div className="relative z-10 mb-8 mt-4 rounded-2xl border border-[#dce2e2] bg-white p-4 shadow-[0_16px_32px_#10272910] sm:p-5 md:-mt-5 md:mx-6">{search}</div>}
        {!propertyId && error && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
        {loading && <p className="mt-4" role="status">Consultando alojamientos…</p>}
        {!loading && propertyId && !property && <p>Este departamento no está publicado.</p>}
        {!propertyId && !loading && <section id="departamentos" className="scroll-mt-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{query ? "Departamentos disponibles" : "Explora los departamentos"}</h2>
              <p className="mt-2 text-[#466069]">{query && !error ? `${dateLabel(query.checkIn)} a ${dateLabel(query.checkOut)} · ${query.guests} huésped(es)` : "Departamentos completos en Santa Cruz de la Sierra"}</p>
            </div>
            <span className="text-sm font-semibold text-[#466069]">{cards.length} {cards.length === 1 ? "alojamiento" : "alojamientos"}</span>
          </div>
          {allCards.length > 0 && <div className="mb-5 flex flex-wrap gap-2" aria-label="Filtrar por servicios">
            {["", ...filters.filter((option) => allCards.some((item) => item.details.services.toLowerCase().includes(option.toLowerCase())))].map((option) => <button key={option}
              type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}
              className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${filter === option ? "border-[#075749] bg-[#075749] text-white" : "border-[#cad8d4] bg-white text-[#25454a] hover:bg-[#eef3f0]"}`}>{option || "Todos"}</button>)}
          </div>}
          {!cards.length && !error && <p>{query ? "No encontramos departamentos para esas fechas y cantidad de huéspedes." : "El catálogo está en preparación."}</p>}
          {cards.length > 0 && <div className="grid items-start gap-5 lg:grid-cols-2">
            <RentHomeResultsMap listings={cards} search={query ? new URLSearchParams(query).toString() : ""} />
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:order-first lg:grid-cols-1 xl:grid-cols-2">
              {cards.map((listing) => <ListingCard key={listing.id} listing={listing} query={query} />)}
            </div>
          </div>}
        </section>}
      </div>
      <footer className="border-t border-[#dce2e2] bg-white"><div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-[#466069] sm:px-9">
        <p><strong className="text-[#132a34]">RentHome Departamentos</strong> · Santa Cruz de la Sierra</p>
        <a href="https://wa.me/59177175497" target="_blank" rel="noreferrer" className="font-semibold text-[#075749] hover:underline">Ayuda por WhatsApp</a>
      </div></footer>
    </main>
  );
}
