import { lazy, Suspense, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, AlertCircle, LocateFixed, Search, Loader2 } from "lucide-react";
import { parseMapsUrl, isShortMapsLink } from "@/lib/parse-maps-url";

const LocationPickerMap = lazy(() =>
  import("@/components/location-picker-map").then((m) => ({ default: m.LocationPickerMap })),
);

type Props = {
  url: string | null;
  lat: number | null;
  lng: number | null;
  onChange: (url: string | null, lat: number | null, lng: number | null) => void;
};

/*
 * Location field, easiest path first:
 *  1. drag the pin on the map (or tap the map)
 *  2. "استخدم موقعي الحالي" via browser geolocation
 *  3. search by place name (Nominatim, free)
 *  4. paste a Google Maps link (kept as fallback for owners used to it)
 */
export function MapsLocationField({ url, lat, lng, onChange }: Props) {
  const [value, setValue] = useState<string>(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"locate" | "search" | null>(null);

  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  function pick(la: number, ln: number) {
    setError(null);
    const link = `https://maps.google.com/?q=${la},${ln}`;
    setValue(link);
    onChange(link, la, ln);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setError("متصفحك ما يدعم تحديد الموقع.");
      return;
    }
    setBusy("locate");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        pick(Math.round(pos.coords.latitude * 1e6) / 1e6, Math.round(pos.coords.longitude * 1e6) / 1e6);
      },
      () => {
        setBusy(null);
        setError("ما گدرنا نوصل لموقعك — تأكد من السماح للمتصفح بالوصول للموقع.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function searchPlace() {
    const q = query.trim();
    if (!q) return;
    setBusy("search");
    setError(null);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=iq&accept-language=ar&q=${encodeURIComponent(q)}`,
      );
      const arr = (await r.json()) as Array<{ lat: string; lon: string }>;
      if (arr[0]) pick(Number(arr[0].lat), Number(arr[0].lon));
      else setError("ما لگينا هذا المكان — جرّب اسم أوضح أو حدد الموقع بالخريطة.");
    } catch {
      setError("فشل البحث — جرّب مرة ثانية أو حدد الموقع بالخريطة مباشرة.");
    } finally {
      setBusy(null);
    }
  }

  function tryParse(next: string) {
    setValue(next);
    setError(null);
    const trimmed = next.trim();
    if (!trimmed) {
      onChange(null, null, null);
      return;
    }
    const parsed = parseMapsUrl(trimmed);
    if (parsed) {
      onChange(trimmed, parsed.lat, parsed.lng);
      return;
    }
    // Couldn't parse — still save the URL so the customer gets a link,
    // but warn about short links and missing coordinates.
    if (isShortMapsLink(trimmed)) {
      setError("هذا رابط مختصر. افتحه بالمتصفح ثم انسخ الرابط الكامل (اللي يحتوي إحداثيات) والصقه هنا.");
    } else {
      setError("ما كدرنا نستخرج الإحداثيات. تأكد إنه رابط Google Maps يحتوي موقع.");
    }
    onChange(trimmed, null, null);
  }

  function clear() {
    setValue("");
    setQuery("");
    setError(null);
    onChange(null, null, null);
  }

  return (
    <div className="space-y-2">
      <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />}>
        <LocationPickerMap lat={lat} lng={lng} onPick={pick} />
      </Suspense>
      <p className="text-xs text-muted-foreground">اضغط على الخريطة أو اسحب الدبوس لتحديد الموقع بدقة.</p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={busy !== null}>
          {busy === "locate" ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="ml-1 h-3.5 w-3.5" />}
          استخدم موقعي الحالي
        </Button>
        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            className="h-8 text-sm"
            placeholder="ابحث: مثلاً مطعم بيت بغداد، الكرادة"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchPlace();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={searchPlace} disabled={busy !== null}>
            {busy === "search" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          dir="ltr"
          className="h-8 text-xs"
          placeholder="أو الصق رابط Google Maps هنا"
          value={value}
          onChange={(e) => tryParse(e.target.value)}
        />
        {(value || hasCoords) && (
          <Button type="button" variant="outline" size="sm" onClick={clear}>مسح</Button>
        )}
      </div>

      {hasCoords && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            <span dir="ltr">{lat!.toFixed(6)}, {lng!.toFixed(6)}</span>
          </Badge>
          <a
            href={`https://maps.google.com/?q=${lat},${lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <MapPin className="h-3 w-3" /> افتح بالخريطة
          </a>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
