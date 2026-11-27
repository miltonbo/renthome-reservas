"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { circleMarker, control, divIcon, DomEvent, layerGroup, map, marker, point, polyline, tileLayer, type LatLngTuple, type LayerGroup, type Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RentHomeDetails } from "@/lib/renthome-listing-details";

type MapListing = { id: number; details: RentHomeDetails; totalMinor: number | null; mapLocation: LatLngTuple | null };
const equipetrol: LatLngTuple = [-17.766, -63.196];
const bolivianos = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });
const price = (minor: number) => `Bs ${bolivianos.format(minor / 100)}`;
const pinWidth = 104;
const pinHeight = 38;

export default function RentHomeResultsMap({ listings, search }: { listings: MapListing[]; search: string }) {
  const container = useRef<HTMLDivElement>(null);
  const pins = useRef<LayerGroup | null>(null);
  const mapView = useRef<LeafletMap | null>(null);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [layout, setLayout] = useState({ columns: 2, rows: 5 });
  const [page, setPage] = useState(0);
  const zoneListings = useMemo(() => listings.flatMap((listing) => listing.mapLocation && listing.totalMinor !== null
    ? [{ ...listing, mapLocation: listing.mapLocation, totalMinor: listing.totalMinor }] : []), [listings]);
  const unmapped = listings.length - zoneListings.length;
  const pageSize = layout.columns * layout.rows;
  const pageCount = Math.ceil(zoneListings.length / pageSize);
  const activePage = Math.min(page, Math.max(0, pageCount - 1));

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const view = map(node, {
      center: equipetrol,
      zoom: 14,
      minZoom: 11,
      maxZoom: 18,
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
    const resize = new ResizeObserver(([entry]) => {
      view.invalidateSize({ pan: false });
      const { width, height } = entry.contentRect;
      const columns = Math.max(1, Math.floor((width - 40) / (pinWidth + 12)));
      const rows = Math.max(1, Math.floor((height - 72) / (pinHeight + 12)));
      setLayout((current) => current.columns === columns && current.rows === rows ? current : { columns, rows });
    });
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
    if (!view || !zoneListings.length) return;
    view.fitBounds(zoneListings.map((listing) => listing.mapLocation), { padding: [56, 40], maxZoom: 16, animate: false });
  }, [zoneListings]);

  useEffect(() => {
    const view = mapView.current;
    const layer = pins.current;
    if (!view || !layer) return;
    const visibleListings = zoneListings.slice(activePage * pageSize, (activePage + 1) * pageSize);
    function renderPrices() {
      if (!view || !layer) return;
      layer.clearLayers();
      const size = view.getSize();
      const slots = Array.from({ length: pageSize }, (_, index) => point(
        size.x / 2 + (index % layout.columns - (layout.columns - 1) / 2) * (pinWidth + 12),
        size.y / 2 + (Math.floor(index / layout.columns) - (layout.rows - 1) / 2) * (pinHeight + 12),
      ));
      const locations = new Map(visibleListings.map(({ mapLocation }) => [mapLocation.join(","), mapLocation]));
      for (const location of locations.values()) {
        circleMarker(location, { interactive: false, radius: 4, weight: 2, color: "#fff", fillColor: "#153c5d", fillOpacity: 1 }).addTo(layer);
      }
      for (const listing of visibleListings) {
        const anchor = view.latLngToContainerPoint(listing.mapLocation);
        // Place each price in the closest free slot, linked to its building point.
        slots.sort((a, b) => a.distanceTo(anchor) - b.distanceTo(anchor));
        const labelPoint = slots.shift() ?? anchor;
        const offset = labelPoint.subtract(anchor);
        if (offset.distanceTo(point(0, 0)) > 15) {
          polyline([listing.mapLocation, view.containerPointToLatLng(labelPoint)], { interactive: false, color: "#153c5d", weight: 1.5, opacity: 0.65 }).addTo(layer);
        }
        const label = price(listing.totalMinor);
        const link = document.createElement("a");
        link.href = `/renthome/${listing.id}${search ? `?${search}` : ""}`;
        link.className = "pointer-events-auto grid h-full place-items-center whitespace-nowrap rounded-full bg-white px-2 text-sm font-extrabold text-[var(--rh-brand)]! tabular-nums shadow-md hover:bg-[var(--rh-tint)] focus-visible:outline-2 focus-visible:outline-[var(--rh-brand)]";
        link.textContent = label;
        link.setAttribute("aria-label", `${listing.details.title}, ${label} por la estadía`);
        DomEvent.disableClickPropagation(link);
        marker(listing.mapLocation, {
          icon: divIcon({
            html: link, className: "pointer-events-none", iconSize: [pinWidth, pinHeight],
            iconAnchor: [pinWidth / 2 - offset.x, pinHeight / 2 - offset.y],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(layer);
      }
    }
    renderPrices();
    view.on("zoomend resize", renderPrices);
    return () => { view.off("zoomend resize", renderPrices); };
  }, [zoneListings, search, activePage, pageSize, layout.columns, layout.rows]);

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
      {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rh-line)] px-3 py-2 text-xs">
        <button type="button" disabled={activePage === 0} onClick={() => setPage(activePage - 1)} className="min-h-9 rounded-lg px-2 font-bold text-[var(--rh-brand)] enabled:hover:bg-[var(--rh-tint)] disabled:opacity-50">Anterior</button>
        <span role="status" className="text-[var(--rh-muted)]">Precios {activePage * pageSize + 1}–{Math.min((activePage + 1) * pageSize, zoneListings.length)} de {zoneListings.length}</span>
        <button type="button" disabled={activePage >= pageCount - 1} onClick={() => setPage(activePage + 1)} className="min-h-9 rounded-lg px-2 font-bold text-[var(--rh-brand)] enabled:hover:bg-[var(--rh-tint)] disabled:opacity-50">Siguiente</button>
      </div>}
      {unmapped > 0 && <p className="border-t border-[var(--rh-line)] px-4 py-3 text-xs text-[var(--rh-muted)]">{unmapped === 1 ? "Un alojamiento solo aparece en la lista." : `${unmapped} alojamientos solo aparecen en la lista.`}</p>}
    </aside>
  );
}
