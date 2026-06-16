// Shared geometry + Iraqi governorate polygons for Deno edge functions.
// Mirrors src/lib/geo.ts + src/lib/governorates-iq.ts. Keep in sync.

export type LatLng = { lat: number; lng: number };

export function pointInPolygon(pt: LatLng, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  const x = pt.lng, y = pt.lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const GOVERNORATES: Record<string, { name_ar: string; polygon: [number, number][] }> = {
  baghdad:      { name_ar: "بغداد",       polygon: [[33.60,43.80],[33.60,44.80],[33.05,44.80],[33.05,43.80]] },
  basra:        { name_ar: "البصرة",      polygon: [[31.30,46.80],[31.30,48.60],[29.05,48.60],[29.05,46.80]] },
  nineveh:      { name_ar: "نينوى",       polygon: [[37.40,41.20],[37.40,44.10],[35.30,44.10],[35.30,41.20]] },
  erbil:        { name_ar: "أربيل",        polygon: [[37.20,43.40],[37.20,45.40],[35.40,45.40],[35.40,43.40]] },
  sulaymaniyah: { name_ar: "السليمانية", polygon: [[36.40,44.80],[36.40,46.30],[34.60,46.30],[34.60,44.80]] },
  duhok:        { name_ar: "دهوك",        polygon: [[37.40,42.30],[37.40,44.10],[36.40,44.10],[36.40,42.30]] },
  kirkuk:       { name_ar: "كركوك",       polygon: [[35.90,43.50],[35.90,44.90],[34.80,44.90],[34.80,43.50]] },
  anbar:        { name_ar: "الأنبار",     polygon: [[35.20,38.80],[35.20,43.60],[32.00,43.60],[32.00,38.80]] },
  najaf:        { name_ar: "النجف",        polygon: [[32.40,42.80],[32.40,44.80],[30.00,44.80],[30.00,42.80]] },
  karbala:      { name_ar: "كربلاء",      polygon: [[33.00,43.00],[33.00,44.40],[32.30,44.40],[32.30,43.00]] },
  babil:        { name_ar: "بابل",         polygon: [[33.10,44.10],[33.10,45.20],[32.20,45.20],[32.20,44.10]] },
  wasit:        { name_ar: "واسط",        polygon: [[33.40,44.80],[33.40,46.40],[32.10,46.40],[32.10,44.80]] },
  diyala:       { name_ar: "ديالى",        polygon: [[34.80,44.30],[34.80,46.10],[33.30,46.10],[33.30,44.30]] },
  salahaddin:   { name_ar: "صلاح الدين", polygon: [[35.60,42.90],[35.60,44.90],[33.70,44.90],[33.70,42.90]] },
  qadisiyyah:   { name_ar: "القادسية",   polygon: [[32.40,44.80],[32.40,45.90],[31.40,45.90],[31.40,44.80]] },
  muthanna:     { name_ar: "المثنى",       polygon: [[31.80,44.50],[31.80,46.80],[30.00,46.80],[30.00,44.50]] },
  thiqar:       { name_ar: "ذي قار",       polygon: [[32.10,45.70],[32.10,47.00],[30.70,47.00],[30.70,45.70]] },
  maysan:       { name_ar: "ميسان",        polygon: [[32.70,46.10],[32.70,47.70],[31.20,47.70],[31.20,46.10]] },
  halabja:      { name_ar: "حلبجة",        polygon: [[35.50,45.60],[35.50,46.30],[34.90,46.30],[34.90,45.60]] },
};

// Check whether a branch covers a given customer point.
// Returns { covered, mode, distance_km? }.
export function checkBranchCoverage(
  branch: any,
  customer: LatLng,
): { covered: boolean; mode: string; distance_km?: number; reason?: string } {
  const type = (branch?.coverage_type || "none") as string;
  if (type === "none") return { covered: true, mode: "none" };

  if (type === "polygon") {
    const poly = Array.isArray(branch.coverage_polygon)
      ? (branch.coverage_polygon as any[]).map((p) => [Number(p.lat ?? p[0]), Number(p.lng ?? p[1])] as [number, number])
      : [];
    if (poly.length < 3) return { covered: true, mode: "polygon", reason: "polygon_not_configured" };
    return { covered: pointInPolygon(customer, poly), mode: "polygon" };
  }

  if (type === "radius") {
    const r = Number(branch.coverage_radius_km);
    const c = { lat: Number(branch.latitude), lng: Number(branch.longitude) };
    if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
      return { covered: true, mode: "radius", reason: "radius_not_configured" };
    }
    const d = distanceKm(customer, c);
    return { covered: d <= r, mode: "radius", distance_km: Math.round(d * 10) / 10 };
  }

  if (type === "governorate") {
    const gov = GOVERNORATES[branch.coverage_governorate];
    if (!gov) return { covered: true, mode: "governorate", reason: "gov_not_configured" };
    return { covered: pointInPolygon(customer, gov.polygon), mode: "governorate" };
  }

  return { covered: true, mode: type };
}
