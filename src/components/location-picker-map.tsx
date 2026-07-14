import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker, Polygon } from "leaflet";

/*
 * Client-only Leaflet map (OpenStreetMap tiles — no API key needed).
 * - Draggable brand-colored pin; clicking the map moves it too.
 * - Optional governorate/coverage boundary drawn as a polygon.
 * Leaflet touches `window`, so everything runs inside useEffect and the
 * library is imported dynamically — safe under SSR.
 */

type Props = {
  lat?: number | null;
  lng?: number | null;
  onPick?: (lat: number, lng: number) => void;
  boundary?: [number, number][] | null;
  className?: string;
};

const IRAQ_CENTER: [number, number] = [33.31, 44.36];

export function LocationPickerMap({ lat, lng, onPick, boundary, className }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const polyRef = useRef<Polygon | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  // Keep the latest callback without re-creating the map.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // Latest props for the async init to read.
  const latestRef = useRef({ lat, lng, boundary });
  latestRef.current = { lat, lng, boundary };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !divRef.current || mapRef.current) return;
      LRef.current = L;

      const { lat: la, lng: ln } = latestRef.current;
      const hasPin = la != null && ln != null && Number.isFinite(la) && Number.isFinite(ln);
      const map = L.map(divRef.current, {
        center: hasPin ? [la!, ln!] : IRAQ_CENTER,
        zoom: hasPin ? 15 : 6,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;

      if (onPickRef.current) {
        map.on("click", (e) => {
          placePin(e.latlng.lat, e.latlng.lng);
          onPickRef.current?.(round6(e.latlng.lat), round6(e.latlng.lng));
        });
      }
      if (hasPin) placePin(la!, ln!);
      syncBoundary(latestRef.current.boundary ?? null);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      polyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function round6(n: number) {
    return Math.round(n * 1e6) / 1e6;
  }

  function pinIcon() {
    const L = LRef.current!;
    return L.divIcon({
      className: "",
      html:
        '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);' +
        "background:linear-gradient(135deg,#D6A85F,#2F7D5A);border:2px solid #fff;" +
        'box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
  }

  function placePin(la: number, ln: number) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const m = L.marker([la, ln], { draggable: !!onPickRef.current, icon: pinIcon() }).addTo(map);
      m.on("dragend", () => {
        const p = m.getLatLng();
        onPickRef.current?.(round6(p.lat), round6(p.lng));
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
  }

  function syncBoundary(b: [number, number][] | null) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    polyRef.current?.remove();
    polyRef.current = null;
    if (b && b.length >= 3) {
      const poly = L.polygon(b, { color: "#2F7D5A", weight: 2, fillColor: "#2F7D5A", fillOpacity: 0.08 }).addTo(map);
      polyRef.current = poly;
      map.fitBounds(poly.getBounds(), { padding: [16, 16] });
    }
  }

  // React to pin coordinate changes from outside (URL paste, geolocation, search).
  useEffect(() => {
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && mapRef.current) {
      placePin(lat, lng);
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 14));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // React to boundary changes (governorate selection).
  useEffect(() => {
    syncBoundary(boundary ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundary]);

  return <div ref={divRef} dir="ltr" className={className ?? "h-64 w-full rounded-lg border z-0"} />;
}
