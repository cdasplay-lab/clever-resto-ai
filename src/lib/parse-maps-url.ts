// Tiny client-side parser for Google Maps URLs.
// Returns { lat, lng } if the URL embeds coordinates, otherwise null.
// Cannot resolve short links (maps.app.goo.gl) — those need to be expanded first.

export type LatLng = { lat: number; lng: number };

const PATTERNS: RegExp[] = [
  // ?q=lat,lng  or  ?ll=lat,lng  or  &destination=lat,lng
  /[?&](?:q|ll|destination|center|sll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  // /@lat,lng,zoom
  /[@/](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,\d+(?:\.\d+)?z)?/,
  // !3dlat!4dlng (place URLs)
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
];

export function parseMapsUrl(input: string | null | undefined): LatLng | null {
  if (!input) return null;
  let url = String(input).trim();
  if (!url) return null;
  try { url = decodeURIComponent(url); } catch { /* keep as-is */ }
  for (const p of PATTERNS) {
    const m = url.match(p);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export function isShortMapsLink(url: string | null | undefined): boolean {
  if (!url) return false;
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)/i.test(url);
}
