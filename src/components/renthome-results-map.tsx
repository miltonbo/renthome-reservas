"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { control, divIcon, DomEvent, layerGroup, map, marker, tileLayer, type LatLngTuple, type LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";

type MapListing = { id: number; details: RentHomeDetails; totalMinor: number | null };
const equipetrol: LatLngTuple = [-17.766, -63.196];
const bolivianos = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const price = (minor: number) => `Bs ${bolivianos.format(minor / 100)}`;

export default function RentHomeResultsMap({ listings, search }: { listings: MapListing[]; search: string }) {
  const container = useRef<HTMLDivElement>(null);
  const pins = useRef<LayerGroup | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const zoneListings = useMemo(() => listings.filter(({ details }) =>
    /\bequipetrol\b/i.test(details.area) && (!details.city || /\bsanta cruz\b/i.test(details.city))
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
    if (!zoneListings.length) return;
    const content = document.createElement("section");
    content.setAttribute("aria-label", "Alojamientos en Equipetrol");
    content.className = "pointer-events-auto font-sans";
    DomEvent.disableClickPropagation(content);
    DomEvent.disableScrollPropagation(content);
    const title = document.createElement("strong");
    title.className = "mx-auto mb-2 block w-fit rounded-full bg-white px-3 py-1 text-xs text-[#132a34] shadow-sm";
    title.textContent = "Equipetrol";
    content.append(title);
    const list = document.createElement("ul");
    list.className = "grid max-h-40 grid-cols-2 items-start gap-2 overflow-y-auto overscroll-contain px-1 pb-1";
    for (const listing of zoneListings) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `/renthome/${listing.id}${search ? `?${search}` : ""}`;
      link.className = "block rounded-xl border border-[#d5e2de] bg-white px-2 py-1.5 text-center text-[#132a34]! shadow-md hover:border-[#075749] hover:bg-[#eef6f3] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#075749]";
      if (listing.totalMinor !== null) {
        const cost = document.createElement("strong");
        cost.className = "block whitespace-nowrap text-sm leading-tight text-[#075749]";
        cost.textContent = price(listing.totalMinor);
        link.append(cost);
      }
      const name = document.createElement("span");
      name.className = "block break-words text-[11px] font-medium leading-tight";
      name.textContent = listing.details.title;
      link.append(name);
      item.append(link);
      list.append(item);
    }
    content.append(list);
    marker(equipetrol, {
      icon: divIcon({ html: content, className: "renthome-map-price", iconSize: [240, 28], iconAnchor: [120, 14] }),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
  }, [zoneListings, search]);

  return (
    <aside aria-label="Mapa de alojamientos" className="overflow-hidden rounded-2xl border border-[#dce2e2] bg-white lg:sticky lg:top-5">
      <div className="border-b border-[#dce2e2] px-4 py-3">
        <h3 className="font-bold">Mapa de alojamientos</h3>
        <p className="text-sm text-[#466069]">{search ? "Ubicación por barrio · Totales en Bs por estadía" : "Ubicación por barrio · Elige fechas para ver precios"}</p>
      </div>
      <div className="relative isolate bg-[#e7eeeb]">
        <div ref={container} className="h-[330px] w-full bg-[#e7eeeb] lg:h-[clamp(420px,65vh,660px)]" />
        {mapUnavailable && <p role="status" className="absolute bottom-7 left-3 z-[500] rounded-lg bg-white px-3 py-2 text-sm shadow">No se pudo cargar el mapa base. Puedes consultar los alojamientos de la lista.</p>}
      </div>
      {unmapped > 0 && <p className="border-t border-[#dce2e2] px-4 py-3 text-xs text-[#466069]">{unmapped === 1 ? "Un alojamiento solo aparece en la lista." : `${unmapped} alojamientos solo aparecen en la lista.`}</p>}
    </aside>
  );
}
