import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, AlertCircle } from "lucide-react";
import { parseMapsUrl, isShortMapsLink } from "@/lib/parse-maps-url";

type Props = {
  url: string | null;
  lat: number | null;
  lng: number | null;
  onChange: (url: string | null, lat: number | null, lng: number | null) => void;
};

export function MapsLocationField({ url, lat, lng, onChange }: Props) {
  const [value, setValue] = useState<string>(url ?? "");
  const [error, setError] = useState<string | null>(null);

  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

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
    setError(null);
    onChange(null, null, null);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          dir="ltr"
          placeholder="https://maps.google.com/?q=33.31,44.36"
          value={value}
          onChange={(e) => tryParse(e.target.value)}
        />
        {(value || hasCoords) && (
          <Button type="button" variant="outline" onClick={clear}>مسح</Button>
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
