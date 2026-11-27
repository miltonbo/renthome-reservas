"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { control, divIcon, DomEvent, layerGroup, map, marker, point, popup, tileLayer, type LatLngTuple, type LayerGroup, type Map as LeafletMap, type Popup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";

type MapListing = { id: number; details: RentHomeDetails; totalMinor: number | null; mapLocation: LatLngTuple | null };
type PricedListing = MapListing & { totalMinor: number; mapLocation: LatLngTuple };
const equipetrol: LatLngTuple = [-17.766, -63.196];
const bolivianos = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const price = (minor: number) => `Bs ${bolivianos.format(minor / 100)}`;
const pinWidth = 104;
const pinHeight = 36;
const pinTip = 5;
const pinClass = "pointer-events-auto relative grid h-full w-full place-items-center whitespace-nowrap rounded-full bg-white px-2 text-sm font-extrabold text-[var(--rh-brand)]! tabular-nums shadow-md hover:bg-[var(--rh-tint)] focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)] after:absolute after:bottom-[-3px] after:left-1/2 after:size-2 after:-translate-x-1/2 after:rotate-45 after:bg-inherit after:content-['']";

function buildingOptions(listings: PricedListing[], search: string) {
  const content = document.createElement("div");
  const heading = document.createElement("p");
  heading.className = "mb-2 font-bold text-[var(--rh-ink)]";
  heading.textContent = `${listings.length} departamentos en esta ubicación`;
  content.append(heading);
  const list = document.createElement("ul");
  list.className = "list-none divide-y divide-[var(--rh-line)]";
  for (const item of listings) {
    const entry = document.createElement("li");
    const link = document.createElement("a");
    link.href = `/renthome/${item.id}${search ? `?${search}` : ""}`;
    link.className = "block py-2 text-[var(--rh-brand)]! hover:underline";
    link.textContent = `${price(item.totalMinor)} · ${item.details.title}`;
    entry.append(link);
    list.append(entry);
  }
  content.append(list);
  return content;
}

export default function RentHomeResultsMap({ listings, search }: { listings: MapListing[]; search: string }) {
  const container = useRef<HTMLDivElement>(null);
  const pins = useRef<LayerGroup | null>(null);
  const mapView = useRef<LeafletMap | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const locations = useMemo(() => {
    const grouped = new Map<string, PricedListing[]>();
    const priced = listings.flatMap((listing) => listing.mapLocation && listing.totalMinor !== null
      ? [{ ...listing, mapLocation: listing.mapLocation, totalMinor: listing.totalMinor }] : []);
    priced.sort((a, b) => a.totalMinor - b.totalMinor || a.id - b.id);
    for (const listing of priced) {
      const key = listing.mapLocation.join(",");
      const options = grouped.get(key) ?? [];
      options.push(listing);
      grouped.set(key, options);
    }
    return [...grouped.values()];
  }, [listings]);
  const unmapped = listings.length - locations.reduce((count, options) => count + options.length, 0);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const view = map(node, {
      center: equipetrol,
      zoom: 14,
      minZoom: 11,
      maxZoom: 19,
      scrollWheelZoom: false,
      zoomControl: false,
    });
    mapView.current = view;
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
      mapView.current = null;
      view.remove();
    };
  }, []);

  useEffect(() => {
    const view = mapView.current;
    if (!view || !locations.length) return;
    view.fitBounds(locations.map(([listing]) => listing.mapLocation), { padding: [58, 48], maxZoom: 16, animate: false });
  }, [locations]);

  useEffect(() => {
    const view = mapView.current;
    const layer = pins.current;
    if (!view || !layer) return;
    let openOptions: Popup | null = null;
    let popupTrigger: HTMLElement | null = null;
    function renderPrices() {
      if (!view || !layer || (openOptions && view.hasLayer(openOptions))) return;
      layer.clearLayers();
      const zoom = view.getZoom();
      const limit = zoom <= 14 ? 1 : zoom === 15 ? 2 : Infinity;
      const size = view.getSize();
      const visible: { x: number; y: number }[] = [];
      for (const options of locations) {
        const [cheapest] = options;
        const location = cheapest.mapLocation;
        const anchor = view.latLngToContainerPoint(location);
        if (anchor.x < pinWidth / 2 || anchor.x > size.x - pinWidth / 2 ||
          anchor.y < pinHeight + pinTip || anchor.y > size.y - pinTip ||
          visible.some((other) => Math.abs(anchor.x - other.x) < pinWidth + 8 && Math.abs(anchor.y - other.y) < pinHeight + 8)) continue;

        const label = price(cheapest.totalMinor);
        const pin = options.length === 1 ? document.createElement("a") : document.createElement("button");
        pin.className = pinClass;
        pin.textContent = label;
        if (pin instanceof HTMLAnchorElement) {
          pin.href = `/renthome/${cheapest.id}${search ? `?${search}` : ""}`;
          pin.setAttribute("aria-label", `${cheapest.details.title}, ${label} por la estadía`);
        } else {
          pin.type = "button";
          pin.setAttribute("aria-expanded", "false");
          pin.setAttribute("aria-label", `Desde ${label} por la estadía. Ver ${options.length} departamentos en esta ubicación.`);
          pin.addEventListener("click", () => {
            const content = buildingOptions(options, search);
            const optionsPopup = popup({
              offset: point(0, -(pinHeight + pinTip)), maxWidth: 260, maxHeight: 220,
              autoPanPaddingTopLeft: point(12, 12), autoPanPaddingBottomRight: point(12, 36),
            }).setLatLng(location).setContent(content);
            optionsPopup.openOn(view);
            openOptions = optionsPopup;
            popupTrigger = pin;
            pin.setAttribute("aria-expanded", "true");
            content.querySelector("a")?.focus({ preventScroll: true });
          });
        }
        DomEvent.disableClickPropagation(pin);
        marker(location, {
          icon: divIcon({ html: pin, className: "pointer-events-none", iconSize: [pinWidth, pinHeight], iconAnchor: [pinWidth / 2, pinHeight + pinTip] }),
          interactive: false,
          keyboard: false,
        }).addTo(layer);
        visible.push(anchor);
        if (visible.length === limit) break;
      }
    }
    renderPrices();
    view.on("moveend resize", renderPrices);
    function restoreFocus() {
      popupTrigger?.setAttribute("aria-expanded", "false");
      popupTrigger?.focus({ preventScroll: true });
      popupTrigger = null;
    }
    view.on("popupclose", restoreFocus);
    return () => {
      view.off("moveend resize", renderPrices);
      view.off("popupclose", restoreFocus);
      if (openOptions) view.closePopup(openOptions);
    };
  }, [locations, search]);

  return (
    <aside aria-label="Mapa de alojamientos" className="overflow-hidden rounded-2xl border border-[var(--rh-line)] bg-white">
      <div className="border-b border-[var(--rh-line)] px-4 py-3">
        <h3 className="font-bold">Mapa de alojamientos</h3>
        <p className="text-sm text-[var(--rh-muted)]">Totales en Bs por estadía · Acerca el mapa para ver más opciones.</p>
      </div>
      <div className="relative isolate bg-[var(--rh-tint)]">
        <div ref={container} className="h-[330px] w-full bg-[var(--rh-tint)] lg:h-[clamp(420px,65vh,660px)]" />
        {mapUnavailable && <p role="status" className="absolute bottom-7 left-3 z-[500] rounded-lg bg-white px-3 py-2 text-sm shadow">No se pudo cargar el mapa base. Puedes consultar los alojamientos de la lista.</p>}
      </div>
      {unmapped > 0 && <p className="border-t border-[var(--rh-line)] px-4 py-3 text-xs text-[var(--rh-muted)]">{unmapped === 1 ? "Un alojamiento solo aparece en la lista." : `${unmapped} alojamientos solo aparecen en la lista.`}</p>}
    </aside>
  );
}
