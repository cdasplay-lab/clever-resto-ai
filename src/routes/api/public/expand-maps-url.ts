// Public helper: expands short Google Maps links (maps.app.goo.gl / goo.gl/maps)
// and extracts lat/lng from the resolved URL. No auth needed — read-only,
// no PII, no writes.
import { createFileRoute } from "@tanstack/react-router";
import { parseMapsUrl } from "@/lib/parse-maps-url";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function follow(url: string, hops = 5): Promise<string> {
  let current = url;
  for (let i = 0; i < hops; i++) {
    const res = await fetch(current, { method: "GET", redirect: "manual" });
    const loc = res.headers.get("location");
    if (!loc) return current;
    current = new URL(loc, current).toString();
  }
  return current;
}

export const Route = createFileRoute("/api/public/expand-maps-url")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const raw = String(body?.url || "").trim();
          if (!raw || raw.length > 500) {
            return Response.json({ error: "bad_url" }, { status: 400, headers: CORS });
          }
          // Only allow http(s) URLs
          let parsed: URL;
          try { parsed = new URL(raw); } catch { return Response.json({ error: "bad_url" }, { status: 400, headers: CORS }); }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return Response.json({ error: "bad_scheme" }, { status: 400, headers: CORS });
          }
          // First, try direct parse — no network needed
          const direct = parseMapsUrl(raw);
          if (direct) {
            return Response.json({ lat: direct.lat, lng: direct.lng, resolved: raw }, { headers: CORS });
          }
          // Follow redirects (short links)
          const resolved = await follow(raw);
          const coords = parseMapsUrl(resolved);
          if (!coords) {
            return Response.json({ error: "no_coords", resolved }, { status: 422, headers: CORS });
          }
          return Response.json({ lat: coords.lat, lng: coords.lng, resolved }, { headers: CORS });
        } catch (e: any) {
          return Response.json({ error: "failed", detail: String(e?.message || e) }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
