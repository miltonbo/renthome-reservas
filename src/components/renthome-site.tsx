"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Grid2X2, List, Map, MapPin, MessageCircle, Tag, Users, X } from "lucide-react";
import heroPhoto from "@/app/renthome/sky-elite-rooftop.webp";
import styles from "@/app/renthome/storefront.module.css";
import { rentHomeBookingLink } from "@/lib/renthome-booking-links";
import type { RentHomeGroup } from "@/lib/renthome-group";
import { RentHomeAmenities } from "./renthome-amenities";
import { RentHomePhoto } from "./renthome-photo";
import { RentHomeStaySavings } from "./renthome-stay-savings";
import { RentHomeSearch, rentHomeDateLabel as dateLabel, type RentHomeDates as Dates } from "./renthome-search";
import { parseReservationDate, reservationNights } from "@/lib/reservation-dates";
import { rentHomePublicLocation, rentHomeServices, type RentHomeDetails } from "@/lib/renthome-listing-details";

type Listing = {
  id: number; details: RentHomeDetails; photos: string[];
  mapLocation: [number, number] | null;
  checkInTime: string; checkOutTime: string; totalMinor: number | null; savingsMinor: number;
};
const money = (amount: number) => `Bs ${(amount / 100).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
const photoUrl = (id: number, photo: string) => `/api/renthome/photos/${id}/${photo}`;
const filters = ["Piscina", "Balcón", "Gimnasio", "Cowork", "Sauna"];
const launchNoticeKey = "renthome-launch-discount-seen";
const launchDiscount = "10 % de descuento";
let launchNoticeShown = false;
const RentHomeResultsMap = dynamic(() => import("./renthome-results-map"), {
  ssr: false,
  loading: () => <div className="h-[330px] rounded-2xl border border-[var(--rh-line)] bg-[var(--rh-tint)] lg:h-[420px]" role="status"><span className="sr-only">Cargando mapa…</span></div>,
});

function shuffleListings(listings: Listing[]) {
  const shuffled = [...listings];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function shuffleCatalog(listings: Listing[]) {
  const shuffled = shuffleListings(listings);
  if (shuffled.length < 2) return shuffled;
  try {
    const key = "renthome-previous-first-listing";
    if (sessionStorage.getItem(key) === String(shuffled[0].id)) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    }
    sessionStorage.setItem(key, String(shuffled[0].id));
  } catch {
    // The catalog still shuffles if browser storage is unavailable.
  }
  return shuffled;
}

function LaunchRibbon() {
  return <span className={styles.launchRibbon}>{launchDiscount}</span>;
}

function LaunchNotice() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const notice = dialog.current;
    if (!notice || launchNoticeShown) return;
    try {
      if (window.localStorage.getItem(launchNoticeKey)) return;
    } catch {
      // The notice can still be shown when browser storage is unavailable.
    }

    notice.showModal();
    launchNoticeShown = true;
    try {
      window.localStorage.setItem(launchNoticeKey, "1");
    } catch {
      // Keep the in-page flag for navigation without browser storage.
    }
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="renthome-launch-title" aria-describedby="renthome-launch-description"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),34rem)] max-w-none overflow-y-auto rounded-2xl border-0 bg-white p-0 text-[var(--rh-ink)] shadow-2xl backdrop:bg-[#0b233c]/80">
      <form method="dialog">
        <div className="relative bg-[var(--rh-promo)] px-6 pb-7 pt-11 text-white sm:px-9 sm:pb-9">
          <button aria-label="Cerrar promoción" className="absolute right-3 top-3 grid size-11 place-items-center rounded-lg hover:bg-white/15 focus-visible:outline-white">
            <X size={22} aria-hidden />
          </button>
          <h2 id="renthome-launch-title" className="max-w-[16ch] text-balance text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            {launchDiscount} por lanzamiento
          </h2>
        </div>
        <div className="space-y-5 px-6 py-6 sm:px-9">
          <p id="renthome-launch-description" className="text-pretty text-[var(--rh-muted)]">El descuento ya está incluido en los precios de todos nuestros departamentos.</p>
          <button className="min-h-12 w-full rounded-lg bg-[var(--rh-brand)] px-5 font-bold text-white hover:bg-[var(--rh-deep)]">Seguir explorando</button>
        </div>
      </form>
    </dialog>
  );
}

function ListingCard({ listing, query }: { listing: Listing; query: Dates | null }) {
  const [index, setIndex] = useState(0);
  const url = `/renthome/${listing.id}${query ? `?${new URLSearchParams(query)}` : ""}`;
  const current = index % Math.max(listing.photos.length, 1);
  const firstService = rentHomeServices(listing.details.services)[0];
  return (
    <article className="group min-w-0 overflow-hidden rounded-2xl border border-[var(--rh-line)] bg-white">
      <div className="relative aspect-[16/11] bg-[var(--rh-tint)]">
        <Link href={url} className="absolute inset-0" aria-label={`Ver ${listing.details.title}`}>
          {listing.photos[current] && <RentHomePhoto fill loading="lazy" sizes="(max-width: 639px) 92vw, (max-width: 1279px) 45vw, 33vw" src={photoUrl(listing.id, listing.photos[current])}
            alt={`${listing.details.title}, foto ${current + 1}`} className="object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.025]" />}
        </Link>
        <LaunchRibbon />
        {listing.photos.length > 1 && <>
          <button type="button" aria-label={`Foto anterior de ${listing.details.title}`} onClick={() => setIndex((current + listing.photos.length - 1) % listing.photos.length)} className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[var(--rh-ink)] shadow-sm hover:bg-white"><ChevronLeft size={19} aria-hidden /></button>
          <button type="button" aria-label={`Foto siguiente de ${listing.details.title}`} onClick={() => setIndex((current + 1) % listing.photos.length)} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[var(--rh-ink)] shadow-sm hover:bg-white"><ChevronRight size={19} aria-hidden /></button>
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-[#122a33]/85 px-2.5 py-1 text-xs font-semibold text-white">{current + 1} / {listing.photos.length}</span>
        </>}
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <h3 className="text-pretty text-lg font-extrabold leading-snug tracking-tight"><Link href={url} className="hover:underline">{listing.details.title}</Link></h3>
        <p className="flex items-start gap-2 text-sm text-[var(--rh-muted)]"><MapPin size={16} aria-hidden className="mt-0.5 shrink-0" /> {rentHomePublicLocation(listing.details)}</p>
        <p className="flex items-start gap-2 text-sm text-[var(--rh-muted)]"><Users size={16} aria-hidden className="mt-0.5 shrink-0" /> <span>Hasta {listing.details.capacity} huéspedes{firstService && ` · ${firstService}`}</span></p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rh-line)] pt-3">
          <span className="text-sm text-[var(--rh-muted)]">{listing.totalMinor != null ? <><strong className="text-lg tabular-nums text-[var(--rh-ink)]">{money(listing.totalMinor)}</strong> total</> : "Precio según fechas"}</span>
          {query && listing.totalMinor !== null ? <Link href={rentHomeBookingLink(query,[listing.id])} className="inline-flex min-h-10 items-center rounded-lg bg-[var(--rh-brand)] px-3 text-sm font-extrabold text-white hover:bg-[var(--rh-deep)]">Reservar</Link> : <Link href={url} aria-label={`Ver ficha de ${listing.details.title}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-extrabold text-[var(--rh-brand)] hover:underline">Ver <ArrowRight size={15} aria-hidden /></Link>}
        </div>
        <RentHomeStaySavings dates={query} savingsMinor={listing.savingsMinor} />
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
  const initialCatalogView = useRef(!propertyId && !query);
  const [catalog, setCatalog] = useState<Listing[]>([]);
  const [results, setResults] = useState<Listing[]>([]);
  const [groups, setGroups] = useState<RentHomeGroup[]>([]);
  const [groupCount, setGroupCount] = useState(0);
  const [groupLimit, setGroupLimit] = useState(3);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(Boolean(query));
  const [catalogError, setCatalogError] = useState("");
  const [groupsError, setGroupsError] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(false);
  const groupsRequest = useRef<AbortController | null>(null);
  const loading = query ? quoteLoading || (Boolean(propertyId) && catalogLoading) : catalogLoading;
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [showMap, setShowMap] = useState(Boolean(query));
  const gallery = useRef<HTMLDialogElement>(null);
  const galleryScroll = useRef<HTMLDivElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const jumpToResults = useRef(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/renthome", { signal: controller.signal });
        if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
        const base = await response.json();
        if (!controller.signal.aborted) setCatalog(initialCatalogView.current ? shuffleCatalog(base.listings) : base.listings);
      } catch {
        if (!controller.signal.aborted) setCatalogError("No se pudo cargar el catálogo.");
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    async function load(dates: Dates) {
      try {
        const response = await fetch(`/api/renthome?${new URLSearchParams(dates)}`, { signal: controller.signal });
        const options = await response.json();
        if (!response.ok) throw new Error(options.error ?? "No se pudo consultar la disponibilidad.");
        if (controller.signal.aborted) return;
        setResults(shuffleListings(options.listings));
        setGroups(options.groups);
        setGroupCount(options.groupCount);
      } catch (err) {
        if (!controller.signal.aborted) { setResults([]); setGroups([]); setGroupCount(0); setError((err as Error).message); }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }
    void load(query);
    return () => { controller.abort(); groupsRequest.current?.abort(); };
  }, [query]);

  async function showMoreGroups() {
    if (!query || groupsRequest.current) return;
    if (groups.length === groupCount) {
      setGroupLimit((limit) => limit + 12);
      return;
    }
    const controller = new AbortController();
    groupsRequest.current = controller;
    setGroupsError("");
    setGroupsLoading(true);
    try {
      const response = await fetch(`/api/renthome?${new URLSearchParams({ ...query, groups: "all" })}`, { signal: controller.signal });
      if (!response.ok) throw new Error("No se pudieron cargar más alternativas.");
      const options = await response.json();
      if (controller.signal.aborted) return;
      setGroups(options.groups);
      setGroupCount(options.groupCount);
      setGroupLimit((limit) => limit + 12);
    } catch {
      if (!controller.signal.aborted) setGroupsError("No se pudieron cargar más alternativas. Intenta de nuevo.");
    } finally {
      if (groupsRequest.current === controller) {
        groupsRequest.current = null;
        setGroupsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (loading || !jumpToResults.current) return;
    jumpToResults.current = false;
    resultsHeading.current?.focus();
  }, [loading]);

  const property = catalog.find((item) => item.id === propertyId);
  function openGallery(index = 0) {
    gallery.current?.showModal();
    const scroller = galleryScroll.current;
    const photo = scroller?.querySelector<HTMLElement>(`[data-gallery-photo="${index}"]`);
    if (scroller) scroller.scrollTop = index > 0 ? Math.max(0, (photo?.offsetTop ?? 0) - 16) : 0;
  }
  const option = results.find((item) => item.id === propertyId);
  const quotedTotal = option?.totalMinor;
  const hasQuote = !!query && !loading && option && quotedTotal != null &&
    dates.checkIn === query.checkIn && dates.checkOut === query.checkOut && dates.guests === query.guests;
  const allCards = query ? results : catalog;
  const cards = filter ? allCards.filter((item) => item.details.services.toLowerCase().includes(filter.toLowerCase())) : allCards;
  const queryString = query ? new URLSearchParams(query).toString() : "";
  const catalogHref = `/renthome${queryString ? `?${queryString}` : ""}#departamentos`;

  const button = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--rh-brand)] px-4 py-3 font-semibold text-white hover:bg-[var(--rh-deep)] disabled:opacity-60";
  const search = <RentHomeSearch dates={dates} today={today} loading={loading} compact={!!propertyId} hasQuote={hasQuote}
    onChange={setDates} onSearch={() => {
      if (!propertyId) {
        jumpToResults.current = true;
        setShowMap(true);
      }
      window.history.replaceState(null, "", `${window.location.pathname}?${new URLSearchParams(dates)}`);
      groupsRequest.current?.abort();
      setGroupsError(""); setError(""); setFilter(""); setGroupLimit(3); setQuoteLoading(true); setQuery({ ...dates });
    }} />;
  const reservationCard = property && <aside id="reserva-directa" aria-label="Reserva directa" className="min-w-0 scroll-mt-4 space-y-4 rounded-2xl border border-[var(--rh-line)] bg-white p-5 shadow-[0_12px_28px_#1027290e] lg:sticky lg:top-5">
      <div>
        <h2 className="text-2xl font-extrabold tabular-nums">{hasQuote ? money(quotedTotal) : "Reserva directa"}</h2>
        <p className="mt-1 text-sm text-[var(--rh-muted)]">{hasQuote ? `Total por ${reservationNights(query.checkIn, query.checkOut)} noches` : "Consulta tus fechas para ver el precio total."}</p>
      </div>
      {hasQuote && <RentHomeStaySavings dates={query} savingsMinor={option.savingsMinor} />}
      {search}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!loading && query && !option && !error && <p role="status" className="text-sm text-[var(--rh-muted)]">No hay disponibilidad para las fechas y huéspedes seleccionados.</p>}
      {hasQuote && <Link href={rentHomeBookingLink(query,[option.id])} className={button + " w-full"}>Reservar</Link>}
      <p className="flex items-start gap-2 border-t border-[var(--rh-line)] pt-3 text-sm text-[var(--rh-muted)]"><MessageCircle size={17} className="mt-0.5 shrink-0 text-[var(--rh-brand)]" aria-hidden /> RentHome confirma tu solicitud por WhatsApp.</p>
  </aside>;
  return (
    <div className="min-h-screen">
      <a href="#renthome-main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Saltar al contenido</a>
      <header className="border-b border-[var(--rh-line)] bg-white">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href="/renthome" className="inline-flex shrink-0 items-center gap-2" aria-label="RentHome Departamentos, inicio">
            <Image src="/brand/renthome-mark.png" alt="" width={44} height={44} unoptimized className="size-10 rounded-lg sm:size-11" />
            <span className="flex flex-col">
              <span className="text-[1.58rem] font-extrabold leading-none tracking-[-.04em]">Rent<span className="text-[#985313]">Home</span></span>
              <span className="mt-1 text-[10px] font-extrabold uppercase tracking-[.13em] text-[var(--rh-muted)]">Departamentos</span>
            </span>
          </Link>
          <nav aria-label="Navegación de RentHome" className="flex items-center gap-3 text-sm font-bold sm:gap-6">
            <Link href={catalogHref} className="hidden hover:underline sm:inline">Alojamientos</Link>
            <a href="https://wa.me/59177175497" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--rh-line)] px-3 text-[var(--rh-brand)] hover:bg-[var(--rh-tint)]"><MessageCircle size={17} aria-hidden /> WhatsApp</a>
          </nav>
        </div>
      </header>
      <LaunchNotice />
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-[var(--rh-promo)] px-4 py-3 text-center text-white">
        <strong className="inline-flex items-center gap-2 font-extrabold"><Tag size={17} aria-hidden /> {launchDiscount} por lanzamiento</strong>
        <span className="text-sm">Incluido en los precios.</span>
      </p>
      <main id="renthome-main" className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 sm:px-8 sm:pt-6">
        {!propertyId && <>
          <div className="relative isolate flex min-h-[300px] items-end overflow-hidden rounded-2xl bg-[var(--rh-deep)] text-white sm:min-h-[390px] sm:items-center lg:min-h-[445px]">
            <Image preload fill sizes="(max-width: 1400px) 100vw, 1340px" src={heroPhoto}
              alt="Piscina en la terraza de Sky Elite al atardecer" className="object-cover object-[62%_52%] sm:object-[center_49%]" />
            <div className={"absolute inset-0 " + styles.heroShade} aria-hidden />
            <div className="relative z-10 px-5 pb-12 pt-32 sm:max-w-2xl sm:px-12 sm:pb-20 sm:pt-12 lg:px-17">
              <h1 className="max-w-[12ch] text-balance text-[clamp(2.3rem,5vw,4.75rem)] font-extrabold leading-[1.04] tracking-[-.04em]">Tu estadía en Equipetrol</h1>
              <p className="mt-3 max-w-[38ch] text-pretty text-sm leading-relaxed text-[#edf5ff] sm:mt-5 sm:text-lg">Departamentos amoblados en Santa Cruz de la Sierra. Elige tus fechas y solicita tu reserva con RentHome.</p>
            </div>
            <span className="absolute bottom-5 right-6 hidden rounded-md bg-[var(--rh-deep)]/90 px-3 py-1.5 text-xs font-semibold text-white lg:block">Terraza de Sky Elite</span>
          </div>
          <div id="buscar-estadia" className="relative z-10 mx-auto -mt-6 max-w-5xl scroll-mt-5 rounded-xl bg-white p-3 shadow-[0_10px_32px_#0b233c1e] sm:-mt-10 sm:p-4">
            {search}
          </div>
        </>}
        {property && <>
          <Link href={catalogHref} className="mb-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--rh-brand)] hover:underline"><ArrowLeft size={16} aria-hidden /> Volver a alojamientos</Link>
          <h1 className="mb-3 max-w-5xl text-balance text-3xl font-extrabold leading-tight tracking-[-.035em] sm:text-5xl">{property.details.title}</h1>
          <p className="mb-4 flex items-center gap-2 text-[var(--rh-muted)]"><MapPin size={18} aria-hidden /> {rentHomePublicLocation(property.details)}</p>
          <a href="#reserva-directa" className="mb-5 inline-flex min-h-10 items-center gap-2 font-extrabold text-[var(--rh-brand)] underline lg:hidden"><CalendarDays size={17} aria-hidden /> Consultar disponibilidad</a>
          {property.photos.length > 0 && <>
            <div className="relative mb-7 overflow-hidden rounded-[1.2rem] bg-[var(--rh-tint)]">
              <div className="grid h-[300px] grid-cols-4 grid-rows-[minmax(0,1fr)_4.5rem] gap-1.5 sm:h-[350px] sm:grid-rows-2 lg:h-[430px]">
                {property.photos.length >= 5 ? property.photos.slice(0, 5).map((photo, index) => (
                  <button type="button" key={photo} onClick={() => openGallery(index)}
                    aria-label={`Abrir foto ${index + 1}`}
                    className={`relative overflow-hidden focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-white ${index === 0 ? "col-span-4 sm:col-span-2 sm:row-span-2" : ""}`}>
                    <RentHomePhoto fill preload={index === 0} sizes={index === 0 ? "(max-width: 639px) 92vw, (max-width: 1400px) 48vw, 670px" : "(max-width: 1400px) 24vw, 330px"}
                      src={photoUrl(property.id, photo)} alt={`${property.details.title}, foto ${index + 1}`} className="object-cover transition-transform hover:scale-[1.025]" />
                  </button>
                )) : <button type="button" aria-label="Abrir galería" onClick={() => openGallery()} className="relative col-span-full row-span-full">
                  <RentHomePhoto fill preload sizes="(max-width: 1400px) 95vw, 1336px" src={photoUrl(property.id, property.photos[0])} alt={property.details.title} className="object-cover" />
                </button>}
              </div>
              <LaunchRibbon />
              <button type="button" onClick={() => openGallery()}
                className={`absolute right-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--rh-deep)] px-3 py-2 text-sm font-semibold text-white shadow-lg hover:bg-[var(--rh-brand)] sm:bottom-4 sm:right-4 ${property.photos.length >= 5 ? "bottom-[5.5rem]" : "bottom-3"}`}>
                <Grid2X2 size={16} aria-hidden /> Ver todas las fotos
              </button>
            </div>
            <dialog ref={gallery} aria-labelledby="renthome-gallery-title"
              className="m-auto h-dvh max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-white text-[var(--rh-ink)] backdrop:bg-[#09171c]/75 open:flex sm:h-[92dvh] sm:w-[min(94vw,960px)] sm:rounded-2xl">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rh-line)] px-4 py-3 sm:px-6">
                <div className="min-w-0">
                  <h2 id="renthome-gallery-title" className="text-lg font-extrabold">Galería del alojamiento</h2>
                  <p className="text-sm text-[var(--rh-muted)]">{property.details.title} · {property.photos.length} {property.photos.length === 1 ? "foto" : "fotos"}</p>
                </div>
                <button type="button" aria-label="Cerrar galería" onClick={() => gallery.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--rh-line)] hover:bg-[var(--rh-tint)] focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)]"><X size={20} aria-hidden /></button>
              </div>
              <div ref={galleryScroll} tabIndex={0} aria-label="Fotos del alojamiento"
                className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--rh-brand)] sm:space-y-4 sm:px-6">
                {property.photos.map((photo, index) => <div key={photo} data-gallery-photo={index}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[var(--rh-bg)] sm:aspect-video">
                  <RentHomePhoto fill loading="lazy" sizes="(max-width: 639px) 94vw, (max-width: 1023px) 90vw, 900px" src={photoUrl(property.id, photo)}
                    alt={`${property.details.title}, foto ${index + 1} de ${property.photos.length}`} className="object-contain" />
                </div>)}
              </div>
            </dialog>
          </>}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-10">
            <div className="min-w-0 space-y-6">
              <section className="border-b border-[var(--rh-line)] pb-6 pt-2 sm:pb-7">
                <h2 className="text-xl font-extrabold">Departamento completo</h2>
                <p className="mt-2 flex items-start gap-2 text-sm text-[var(--rh-muted)]"><Users size={17} className="mt-0.5 shrink-0" aria-hidden /><span>Hasta {property.details.capacity} huéspedes{property.details.layout && ` · ${property.details.layout}`}</span></p>
                <p className="mt-5 max-w-3xl whitespace-pre-line leading-relaxed text-[var(--rh-muted)]">{property.details.description}</p>
              </section>
              <RentHomeAmenities services={property.details.services} />
              <section className="border-b border-[var(--rh-line)] pb-6 sm:pb-7">
                <h2 className="mb-3 text-xl font-extrabold">Ubicación</h2>
                <p className="flex items-start gap-2 text-[var(--rh-muted)]"><MapPin size={18} className="mt-0.5 shrink-0 text-[var(--rh-brand)]" aria-hidden />{rentHomePublicLocation(property.details)}</p>
                {property.details.locationNotes && <p className="mt-3 whitespace-pre-line text-[var(--rh-muted)]">{property.details.locationNotes}</p>}
              </section>
              <section className="pb-4">
                <h2 className="mb-3 text-xl font-extrabold">Antes de tu estadía</h2>
                <dl className="grid max-w-md grid-cols-2 gap-3 rounded-xl bg-[var(--rh-tint)] p-4">
                  <div><dt className="text-sm text-[var(--rh-muted)]">Ingreso desde</dt><dd className="font-bold tabular-nums">{property.checkInTime}</dd></div>
                  <div><dt className="text-sm text-[var(--rh-muted)]">Salida hasta</dt><dd className="font-bold tabular-nums">{property.checkOutTime}</dd></div>
                </dl>
                {property.details.rules && <p className="mt-3 whitespace-pre-line text-[var(--rh-muted)]">{property.details.rules}</p>}
              </section>
            </div>
            {reservationCard}
          </div>
        </>}
        {((!propertyId && error) || ((!query || propertyId) && catalogError)) && <p role="alert" className="my-4 rounded-lg bg-red-50 p-3 text-red-800">{error || catalogError}</p>}
        {loading && <p className="mt-8 text-sm font-semibold text-[var(--rh-muted)]" role="status">Consultando alojamientos…</p>}
        {!loading && propertyId && !property && <p>Este departamento no está publicado.</p>}
        {!propertyId && !loading && <section id="departamentos" className="mt-9 scroll-mt-5 sm:mt-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 ref={resultsHeading} tabIndex={-1} className="scroll-mt-5 text-balance text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">{query ? "Departamentos disponibles" : "Encuentra tu departamento"}</h2>
              <p className="mt-1.5 text-sm text-[var(--rh-muted)]">{query && !error ? `${dateLabel(query.checkIn)} a ${dateLabel(query.checkOut)} · ${query.guests} ${query.guests === "1" ? "huésped" : "huéspedes"}` : "Alojamientos amoblados en Santa Cruz de la Sierra"}</p>
            </div>
            <span role="status" className="text-sm font-bold text-[var(--rh-muted)]">{cards.length} {cards.length === 1 ? "alojamiento individual" : "alojamientos individuales"}{groupCount > 0 && ` · ${groupCount} ${groupCount === 1 ? "opción grupal" : "opciones grupales"}`}</span>
          </div>
          {allCards.length > 0 && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-[var(--rh-line)] py-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por servicios">
            {["", ...filters.filter((option) => allCards.some((item) => item.details.services.toLowerCase().includes(option.toLowerCase())))].map((option) => <button key={option}
              type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}
              className={`min-h-10 rounded-full border px-3.5 text-sm font-bold ${filter === option ? "border-[var(--rh-brand)] bg-[var(--rh-brand)] text-white" : "border-[var(--rh-line)] bg-white text-[var(--rh-ink)] hover:bg-[var(--rh-tint)]"}`}>{option || "Todos"}</button>)}
            </div>
            {query && cards.length > 0 && <button type="button" aria-expanded={showMap} aria-controls={showMap ? "renthome-results-map" : undefined} onClick={() => setShowMap(!showMap)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--rh-line)] bg-white px-3 text-sm font-extrabold text-[var(--rh-brand)] hover:bg-[var(--rh-tint)]">
              {showMap ? <List size={17} aria-hidden /> : <Map size={17} aria-hidden />} {showMap ? "Solo lista" : "Mostrar mapa"}
            </button>}
          </div>}
          {!cards.length && !groups.length && !error && <div className="rounded-xl border border-[var(--rh-line)] bg-white px-5 py-8">
            <p className="font-bold">{query ? "No hay alojamientos disponibles para esa búsqueda." : "El catálogo está en preparación."}</p>
            {query && <a href="#buscar-estadia" className="mt-3 inline-block text-sm font-bold text-[var(--rh-brand)] underline">Cambiar fechas o huéspedes</a>}
          </div>}
          {cards.length > 0 && <div className={`grid items-start gap-5 ${showMap ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}>
            {showMap && <div id="renthome-results-map" className="min-w-0 lg:sticky lg:top-5"><RentHomeResultsMap listings={cards} search={queryString} /></div>}
            <div className={`grid min-w-0 gap-4 sm:grid-cols-2 ${showMap ? "lg:order-first lg:grid-cols-1 xl:grid-cols-2" : "lg:grid-cols-3"}`}>
              {cards.map((listing) => <ListingCard key={listing.id} listing={listing} query={query} />)}
            </div>
          </div>}
          {groups.length > 0 && <section aria-labelledby="renthome-groups" className="mt-8 space-y-4">
            <div>
              <h3 id="renthome-groups" className="text-xl font-extrabold">Departamentos para grupos</h3>
              <p className="mt-1 text-sm text-[var(--rh-muted)]">{groups[0].distanceMeters === 0
                ? "Aloja a tu grupo en el mismo edificio con una sola solicitud. Los importes corresponden a toda la estadía."
                : "Opciones en edificios distintos, ordenadas por cercanía. Puedes solicitarlas juntas."}</p>
            </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {groups.slice(0, groupLimit).map((group) => (
                  <article key={group.units.map((unit) => unit.propertyId).join("-")} className="flex flex-col gap-3 rounded-xl border border-[var(--rh-line)] bg-white p-4 sm:p-5">
                    <div>
                      <h4 className="font-extrabold">{group.units.length} departamentos {group.distanceMeters === 0 ? `en ${group.building}` : "en edificios distintos"}</h4>
                      {group.distanceMeters > 0 && <p className="mt-1 text-sm text-[var(--rh-muted)]">
                        Hasta {group.distanceMeters.toLocaleString("es-BO")} m entre edificios, en línea recta
                      </p>}
                    </div>
                    <ul aria-label="Distribución y precios por departamento" className="divide-y divide-[var(--rh-line)] text-sm">
                      {group.units.map((unit) => {
                        const photo = catalog.find((listing) => listing.id === unit.propertyId)?.photos[0];
                        return <li key={unit.propertyId} className="flex items-center gap-3 py-2.5">
                          {photo && <RentHomePhoto width={112} height={75} loading="lazy" src={photoUrl(unit.propertyId, photo)} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover sm:h-[75px] sm:w-28" />}
                          <span className="min-w-0 flex-1">
                            <Link href={`/renthome/${unit.propertyId}`} className="font-semibold hover:underline">{unit.title}</Link>
                            {group.distanceMeters > 0 && <span className="block text-[var(--rh-muted)]">{unit.building}</span>}
                            <span className="block text-[var(--rh-muted)]">{unit.guests} {unit.guests === 1 ? "huésped" : "huéspedes"}</span>
                          </span>
                          <strong className="shrink-0 tabular-nums">{money(unit.totalMinor)}</strong>
                        </li>;
                      })}
                    </ul>
                    <RentHomeStaySavings dates={query} savingsMinor={group.savingsMinor} />
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rh-line)] pt-3">
                      <p className="text-sm">Total <strong className="text-lg tabular-nums">{money(group.totalMinor)}</strong></p>
                      {query && <Link className={button} href={rentHomeBookingLink(query,group.units.map((unit) => unit.propertyId))}>Reservar</Link>}
                    </div>
                  </article>
                ))}
              </div>
              {groupCount > 3 && <div className="flex flex-wrap items-center gap-3">
                <span role="status" className="text-sm text-[var(--rh-muted)]">{Math.min(groupLimit, groups.length)} de {groupCount} alternativas</span>
                {groupLimit < groupCount && <button type="button" disabled={groupsLoading} className="min-h-11 rounded-lg border border-[var(--rh-line)] bg-white px-4 text-sm font-bold text-[var(--rh-brand)] hover:bg-[var(--rh-tint)] disabled:opacity-60"
                  onClick={showMoreGroups}>{groupsLoading ? "Cargando alternativas…" : groupLimit === 3 ? "Ver todas las alternativas" : "Ver más alternativas"}</button>}
              </div>}
              {groupsError && <p role="alert" className="text-sm text-red-800">{groupsError}</p>}
          </section>}
        </section>}
      </main>
      <footer className="bg-[var(--rh-deep)] text-white"><div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 py-7 text-sm sm:px-8">
        <p><strong className="block text-base">RentHome Departamentos</strong><span className="text-[#c8dceb]">Santa Cruz de la Sierra, Bolivia</span></p>
        <a href="https://wa.me/59177175497" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 font-bold text-[var(--rh-gold)] hover:underline"><MessageCircle size={17} aria-hidden /> Ayuda por WhatsApp</a>
      </div></footer>
    </div>
  );
}
