import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LocateFixed, Search, X } from "lucide-react";
import { toast } from "sonner";

// Global loader promise so we init the Maps JS SDK only once per page
declare global {
  interface Window {
    google?: any;
    __lovableMapsInit?: () => void;
    __lovableMapsPromise?: Promise<void>;
  }
}

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.maps) return Promise.resolve();
  if (window.__lovableMapsPromise) return window.__lovableMapsPromise;
  if (!BROWSER_KEY) return Promise.reject(new Error("no_key"));
  window.__lovableMapsPromise = new Promise<void>((resolve, reject) => {
    window.__lovableMapsInit = () => resolve();
    const s = document.createElement("script");
    const channel = TRACKING_ID ? `&channel=${TRACKING_ID}` : "";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&callback=__lovableMapsInit&libraries=places${channel}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("script_error"));
    document.head.appendChild(s);
  });
  return window.__lovableMapsPromise;
}

type Props = {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
};

// Default center: Baghdad
const DEFAULT_CENTER = { lat: 33.3152, lng: 44.3661 };

export function MapsLocationPicker({ lat, lng, onChange, height = 320 }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const searchEl = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !mapEl.current || !window.google?.maps) return;
        const center = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          ? { lat, lng }
          : DEFAULT_CENTER;
        const map = new window.google.maps.Map(mapEl.current, {
          center,
          zoom: lat != null && lng != null ? 16 : 12,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        });
        const marker = new window.google.maps.Marker({
          position: center,
          map,
          draggable: true,
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) onChange(p.lat(), p.lng());
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          onChange(e.latLng.lat(), e.latLng.lng());
        });
        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      })
      .catch((e) => {
        console.error("maps load failed", e);
        setError("ما كدرنا نحمّل الخريطة. استخدم لصق رابط Google Maps بالأسفل.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external lat/lng changes to the marker
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    markerRef.current.setPosition(pos);
    mapRef.current.panTo(pos);
  }, [lat, lng, ready]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("المتصفح ما يدعم تحديد الموقع");
      return;
    }
    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoadingGeo(false);
        const la = pos.coords.latitude;
        const ln = pos.coords.longitude;
        onChange(la, ln);
        if (mapRef.current) mapRef.current.setZoom(17);
        toast.success("تم تحديد موقعك الحالي");
      },
      (err) => {
        setLoadingGeo(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "رفضت المتصفح صلاحية الموقع. فعّلها من إعدادات المتصفح."
            : "ما كدرنا نجيب موقعك. تأكد من تفعيل GPS."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = searchTerm.trim();
    if (!q || !ready || !window.google?.maps) return;
    setSearchBusy(true);
    try {
      // Use Geocoder (Maps JS built-in) — biases to Iraq
      const geocoder = new window.google.maps.Geocoder();
      const { results } = await geocoder.geocode({
        address: q,
        componentRestrictions: { country: "IQ" },
      });
      if (results && results[0]) {
        const loc = results[0].geometry.location;
        onChange(loc.lat(), loc.lng());
        if (mapRef.current) {
          mapRef.current.panTo(loc);
          mapRef.current.setZoom(16);
        }
      } else {
        toast.error("ما لكينا نتيجة. جرب تنقر على الخريطة بنفسك.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("خطأ بالبحث. جرب تنقر على الخريطة بنفسك.");
    } finally {
      setSearchBusy(false);
    }
  }

  if (!BROWSER_KEY) {
    return (
      <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
        الخريطة التفاعلية غير مفعّلة (Google Maps key مفقود). استخدم اللصق بالأسفل.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <form onSubmit={runSearch} className="flex gap-2">
        <Input
          ref={searchEl}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ابحث بالاسم أو العنوان (مثلاً: مطعم النخيل، الكرادة)"
        />
        <Button type="submit" size="icon" variant="outline" disabled={searchBusy || !ready}>
          {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={loadingGeo}>
          {loadingGeo ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <LocateFixed className="ml-1 h-4 w-4" />}
          موقعي
        </Button>
      </form>
      <div
        ref={mapEl}
        style={{ height, width: "100%" }}
        className="rounded border bg-muted"
      >
        {!ready && !error && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري تحميل الخريطة…
          </div>
        )}
      </div>
      {error && (
        <div className="flex items-start gap-1 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        نصيحة: افتح لوحة التحكم من جوالك وأنت داخل الفرع، اضغط "موقعي" لتحديد أدق نقطة.
      </p>
    </div>
  );
}
