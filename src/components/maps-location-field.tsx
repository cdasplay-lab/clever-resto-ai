import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, AlertCircle, Loader2, Map as MapIcon } from "lucide-react";
import { parseMapsUrl, isShortMapsLink } from "@/lib/parse-maps-url";
import { MapsLocationPicker } from "@/components/maps-location-picker";
import { toast } from "sonner";

type Props = {
  url: string | null;
  lat: number | null;
  lng: number | null;
  onChange: (url: string | null, lat: number | null, lng: number | null) => void;
};

export function MapsLocationField({ url, lat, lng, onChange }: Props) {
  const [value, setValue] = useState<string>(url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState<boolean>(lat == null || lng == null);
  const [expanding, setExpanding] = useState(false);

  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001);


  function commit(nextUrl: string | null, la: number | null, ln: number | null) {
    onChange(nextUrl, la, ln);
  }

  async function tryParse(next: string) {
    setValue(next);
    setError(null);
    const trimmed = next.trim();
    if (!trimmed) {
      commit(null, null, null);
      return;
    }
    const parsed = parseMapsUrl(trimmed);
    if (parsed) {
      commit(trimmed, parsed.lat, parsed.lng);
      return;
    }
    // Short link → ask server to expand it
    if (isShortMapsLink(trimmed)) {
      setExpanding(true);
      try {
        const r = await fetch("/api/public/expand-maps-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
        const j = await r.json();
        if (r.ok && Number.isFinite(j.lat) && Number.isFinite(j.lng)) {
          commit(j.resolved || trimmed, j.lat, j.lng);
          toast.success("تم استخراج الإحداثيات من الرابط المختصر");
          return;
        }
        setError("ما كدرنا نفك الرابط المختصر. افتحه بالمتصفح ثم انسخ الرابط الكامل من شريط العنوان.");
      } catch {
        setError("خطأ اتصال بفك الرابط المختصر.");
      } finally {
        setExpanding(false);
      }
      commit(trimmed, null, null);
      return;
    }
    setError("ما كدرنا نستخرج الإحداثيات. تأكد إنه رابط Google Maps يحتوي موقع، أو استخدم الخريطة بالأعلى.");
    commit(trimmed, null, null);
  }

  function clear() {
    setValue("");
    setError(null);
    commit(null, null, null);
  }

  function onMapChange(la: number, ln: number) {
    const generated = `https://www.google.com/maps/search/?api=1&query=${la.toFixed(6)},${ln.toFixed(6)}`;
    setValue(generated);
    setError(null);
    commit(generated, la, ln);
  }

  return (
    <div className="space-y-3">
      {/* Interactive map (primary UX) */}
      {showMap ? (
        <MapsLocationPicker lat={lat} lng={lng} onChange={onMapChange} height={280} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowMap(true)} className="gap-1">
          <MapIcon className="h-4 w-4" /> عدّل من الخريطة
        </Button>
      )}

      {/* Manual URL paste (secondary) */}
      <details className="rounded border p-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">أو الصق رابط Google Maps يدوياً</summary>
        <div className="mt-2 flex gap-2">
          <Input
            dir="ltr"
            placeholder="https://maps.app.goo.gl/... أو https://www.google.com/maps/search/?api=1&query=lat,lng"
            value={value}
            onChange={(e) => tryParse(e.target.value)}
            disabled={expanding}
          />
          {(value || hasCoords) && (
            <Button type="button" variant="outline" size="sm" onClick={clear}>مسح</Button>
          )}
          {expanding && <Loader2 className="h-4 w-4 animate-spin self-center" />}
        </div>
      </details>

      {/* Confirmation / status */}
      {hasCoords ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            الموقع محفوظ <span dir="ltr" className="font-mono">{lat!.toFixed(5)}, {lng!.toFixed(5)}</span>
          </Badge>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <MapPin className="h-3 w-3" /> افتح بالخريطة للتأكد
          </a>
        </div>
      ) : (
        <div className="flex items-start gap-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>بدون تحديد موقع دقيق، الوكيل ما يقدر يرسل موقعك للزبون على الخريطة.</span>
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
