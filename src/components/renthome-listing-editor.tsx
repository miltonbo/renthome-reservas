"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { ChevronDown, X } from "lucide-react";
import { rentHomeServices, type RentHomeDetails } from "@/lib/renthome-listing-details";

type Listing = { details: RentHomeDetails; photos: string[]; published: boolean };
const empty: Listing = {
  details: { title: "", description: "", area: "", city: "", locationNotes: "", layout: "", services: "", rules: "", capacity: 2 },
  photos: [],
  published: false,
};
const input = "w-full rounded-lg border border-[var(--line-2)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--ink)]";
const button = "rounded-lg border border-[var(--line-2)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg-3)] disabled:opacity-50";
const label = "grid content-start gap-1.5 text-sm font-medium";
const section = "space-y-3 border-t border-[var(--line)] py-4";
const suggestions = ["Wifi", "Cocina", "Aire acondicionado", "Lavadora", "Secadora", "Balcón", "Piscina compartida", "Gimnasio compartido", "Cowork", "Sauna"];

export function RentHomeListingEditor({ propertyId }: { propertyId: number }) {
  const [listing, setListing] = useState<Listing>();
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean }>();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const response = await fetch(`/api/renthome-staff/listings/${propertyId}`, { signal: controller.signal });
      if (response.status === 404) return;
      if (!response.ok) throw new Error("No se pudo abrir la ficha pública.");
      const data = await response.json();
      if (controller.signal.aborted) return;
      const current: Listing = data.listing ?? empty;
      setListing(current);
      setServices(rentHomeServices(current.details.services));
    }
    void load().catch(() => {
      if (!controller.signal.aborted) setStatus({ text: "No se pudo abrir la ficha pública.", error: true });
    });
    return () => controller.abort();
  }, [propertyId]);

  function addService() {
    setServices((items) => rentHomeServices([...items, service].join("\n")));
    setService("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listing || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("services", rentHomeServices([...services, service].join("\n")).join("\n"));
    listing.photos.forEach((photo) => data.append("retain", photo));
    setBusy(true);
    setStatus(undefined);
    try {
      const response = await fetch(`/api/renthome-staff/listings/${propertyId}`, { method: "PUT", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar la ficha.");
      setListing(result.listing);
      setServices(rentHomeServices(result.listing.details.services));
      setService("");
      const photosInput = form.elements.namedItem("photos") as HTMLInputElement | null;
      if (photosInput) photosInput.value = "";
      setStatus({ text: result.listing.published ? "Ficha publicada." : "Borrador guardado." });
    } catch (error) {
      setStatus({ text: (error as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!listing) return status ? <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{status.text}</p> : null;
  const { details } = listing;

  return (
    <details className="group rounded-xl border border-[var(--line)] bg-[var(--bg)]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden sm:px-5">
        <span>
          <span className="block font-semibold text-[var(--ink)]">Ficha pública de RentHome</span>
          <span className="block text-sm text-[var(--ink-3)]">Edita la información que verán los huéspedes en la web de reservas.</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-[var(--bg-3)] px-2.5 py-1">{listing.published ? "Publicada" : "Borrador"}</span>
          <ChevronDown size={18} className="group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <form onSubmit={save} className="px-4 pb-4 sm:px-5">
        <fieldset disabled={busy}>
          <section className={section} aria-labelledby="renthome-overview">
            <h2 id="renthome-overview" className="font-semibold">Información del alojamiento</h2>
            <label className={label}>Título comercial<input className={input} name="title" maxLength={160} defaultValue={details.title} /></label>
            <label className={label}>Descripción<textarea className={input} name="description" rows={4} maxLength={8000} defaultValue={details.description} /></label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className={label}>Distribución, dormitorios, camas y baños<input className={input} name="layout" maxLength={8000} defaultValue={details.layout} /></label>
              <label className={label}>Capacidad máxima<input className={input} required type="number" name="capacity" min={1} max={50} defaultValue={details.capacity} /></label>
            </div>
            <label className={label}>Reglas, garantía y cancelación<textarea className={input} name="rules" rows={3} maxLength={8000} defaultValue={details.rules} /></label>
          </section>
          <section className={section} aria-labelledby="renthome-location">
            <h2 id="renthome-location" className="font-semibold">Ubicación pública</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Ciudad<input className={input} name="city" maxLength={160} defaultValue={details.city} placeholder="Santa Cruz de la Sierra" /></label>
              <label className={label}>Zona o barrio<input className={input} name="area" maxLength={8000} defaultValue={details.area} placeholder="Equipetrol" /></label>
            </div>
            <label className={label}>Referencias de la zona<textarea className={input} name="locationNotes" rows={2} maxLength={8000} defaultValue={details.locationNotes} placeholder="Describe lo que hay cerca. Usa referencias generales para mantener privada la dirección exacta." /></label>
          </section>
          <section className={section} aria-labelledby="renthome-services">
            <h2 id="renthome-services" className="font-semibold">Servicios y áreas compartidas</h2>
            {services.length > 0 && <ul className="flex flex-wrap gap-2">
              {services.map((item) => (
                <li key={item} className="flex max-w-full items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-3)] pl-3 text-sm">
                  <span className="break-words">{item}</span>
                  <button type="button" aria-label={`Quitar ${item}`} className="grid size-8 shrink-0 place-items-center" onClick={() => setServices((items) => items.filter((entry) => entry !== item))}><X size={15} aria-hidden /></button>
                </li>
              ))}
            </ul>}
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${label} min-w-[min(12rem,100%)] max-w-md flex-1`}>Nuevo servicio
                <input className={input} list="renthome-service-suggestions" placeholder="Ej. Piscina compartida" value={service} maxLength={160} onChange={(event) => setService(event.target.value)} onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  addService();
                }} />
                <datalist id="renthome-service-suggestions">{suggestions.filter((item) => !services.includes(item)).map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <button type="button" className={button} disabled={!service.trim()} onClick={addService}>Agregar servicio</button>
            </div>
          </section>
          <section className={section} aria-labelledby="renthome-publishing">
            <h2 id="renthome-publishing" className="font-semibold">Fotos y publicación</h2>
            <label className={label}>Agregar fotos<input className={input} name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heif" multiple /></label>
            <div className="flex flex-wrap gap-3">
              {listing.photos.map((name, index) => <div key={name} className="space-y-1">
                <Image unoptimized width={130} height={90} alt={`Foto ${index + 1}`} className="h-[90px] rounded-lg object-cover" src={`/api/renthome/photos/${propertyId}/${name}`} />
                <div className="flex flex-wrap gap-2 text-xs">
                  {index === 0 ? <span>Portada</span> : <button type="button" className="underline" aria-label={`Adelantar foto ${index + 1}`} onClick={() => {
                    const photos = [...listing.photos];
                    [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
                    setListing({ ...listing, photos });
                  }}>Adelantar</button>}
                  <button type="button" className="underline" aria-label={`Quitar foto ${index + 1}`} onClick={() => setListing({ ...listing, photos: listing.photos.filter((photo) => photo !== name) })}>Quitar</button>
                </div>
              </div>)}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" value="yes" defaultChecked={listing.published} /> Publicar en la web de RentHome</label>
          </section>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={button}>{busy ? "Guardando…" : "Guardar ficha"}</button>
            {listing.published && <a className="text-sm underline" href={`/renthome/${propertyId}`}>Ver ficha pública</a>}
          </div>
        </fieldset>
        {status && <p role={status.error ? "alert" : "status"} className={`mt-3 text-sm ${status.error ? "text-amber-700 dark:text-amber-300" : ""}`}>{status.text}</p>}
      </form>
    </details>
  );
}
