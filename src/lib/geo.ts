// Geometry helpers for delivery coverage checks (client + server-safe, pure functions).

export type LatLng = { lat: number; lng: number };

// Standard ray-casting point-in-polygon. Polygon as [[lat,lng], ...] (closed or open).
export function pointInPolygon(pt: LatLng, polygon: [number, number][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  const x = pt.lng;
  const y = pt.lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Haversine distance in km.
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function pointInRadius(pt: LatLng, center: LatLng, radiusKm: number): boolean {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return false;
  return distanceKm(pt, center) <= radiusKm;
}
