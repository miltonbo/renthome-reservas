"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { control, divIcon, DomEvent, layerGroup, map, marker, tileLayer, type LatLngTuple, type LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";

type MapListing = { id: number; details: RentHomeDetails; totalMinor: number | null };
const equipetrol: LatLngTuple = [-17.766, -63.196];
const bolivianos = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const price = (minor: number) => `Bs ${bolivianos.format(minor / 100)}`;
const pinWidth = 104;
const pinHeight = 38;

export default function RentHomeResultsMap({ listings, search }: { listings: MapListing[]; search: string }) {
  const container = useRef<HTMLDivElement>(null);
  const pins = useRef<LayerGroup | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const zoneListings = useMemo(() => listings.filter(({ details, totalMinor }) =>
    totalMinor !== null && /\bequipetrol\b/i.test(details.area) && (!details.city || /\bsanta cruz\b/i.test(details.city))
  ), [listings]);
  const unmapped = listings.length - zoneListings.length;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const view = map(node, {
      center: equipetrol,
      zoom: 14,
      minZoom: 11,
      maxZoom: 16,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    control.zoom({ position: "topright", zoomInTitle: "Acercar mapa", zoomOutTitle: "Alejar mapa" }).addTo(view);
    const tiles = tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      referrerPolicy: "strict-origin-when-cross-origin",
      noWrap: true,
    });
    let hasTiles = false;
    tiles.on("tileload", () => { hasTiles = true; setMapUnavailable(false); });
    tiles.on("load", () => { if (!hasTiles) setMapUnavailable(true); });
    tiles.addTo(view);
    pins.current = layerGroup().addTo(view);
    const resize = new ResizeObserver(() => view.invalidateSize({ pan: false }));
    resize.observe(node);
    return () => {
      resize.disconnect();
      pins.current = null;
      view.remove();
    };
  }, []);

  useEffect(() => {
    const layer = pins.current;
    if (!layer) return;
    layer.clearLayers();
    // Listings share a neighborhood location. Offset the labels on screen without inventing coordinates.
    for (const [index, listing] of zoneListings.entries()) {
      if (listing.totalMinor === null) continue;
      const label = price(listing.totalMinor);
      const link = document.createElement("a");
      link.href = `/renthome/${listing.id}${search ? `?${search}` : ""}`;
      link.className = "pointer-events-auto grid h-full place-items-center whitespace-nowrap rounded-full bg-white px-2 text-sm font-extrabold text-[var(--rh-brand)]! tabular-nums shadow-md hover:bg-[var(--rh-tint)] focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)]";
      link.textContent = label;
      link.setAttribute("aria-label", `${listing.details.title}, ${label} por la estadía`);
      DomEvent.disableClickPropagation(link);
      const row = Math.floor(index / 2);
      const columns = Math.min(2, zoneListings.length - row * 2);
      const x = (index % 2 - (columns - 1) / 2) * (pinWidth + 12);
      const y = (row - (Math.ceil(zoneListings.length / 2) - 1) / 2) * (pinHeight + 12);
      marker(equipetrol, {
        icon: divIcon({
          html: link, className: "pointer-events-none", iconSize: [pinWidth, pinHeight],
          iconAnchor: [pinWidth / 2 - x, pinHeight / 2 - y],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }
  }, [zoneListings, search]);

  return (
    <aside aria-label="Mapa de alojamientos" className="overflow-hidden rounded-2xl border border-[var(--rh-line)] bg-white">
      <div className="border-b border-[var(--rh-line)] px-4 py-3">
        <h3 className="font-bold">Mapa de alojamientos</h3>
        <p className="text-sm text-[var(--rh-muted)]">Ubicación aproximada · Totales en Bs por estadía</p>
      </div>
      <div className="relative isolate bg-[var(--rh-tint)]">
        <div ref={container} className="h-[330px] w-full bg-[var(--rh-tint)] lg:h-[clamp(420px,65vh,660px)]" />
        {mapUnavailable && <p role="status" className="absolute bottom-7 left-3 z-[500] rounded-lg bg-white px-3 py-2 text-sm shadow">No se pudo cargar el mapa base. Puedes consultar los alojamientos de la lista.</p>}
      </div>
      {unmapped > 0 && <p className="border-t border-[var(--rh-line)] px-4 py-3 text-xs text-[var(--rh-muted)]">{unmapped === 1 ? "Un alojamiento solo aparece en la lista." : `${unmapped} alojamientos solo aparecen en la lista.`}</p>}
    </aside>
  );
}
