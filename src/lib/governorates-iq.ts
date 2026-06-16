// Simplified bounding-polygon approximations for the 18 Iraqi governorates.
// Each polygon is a closed-ish loop of [lat, lng] points.
// For precise coverage, owners should switch to "polygon" (draw on map) or "radius" mode.
// Sources: approximate from public boundary references; intentionally simplified to keep payload small.

export type GovernorateCode =
  | "baghdad" | "basra" | "nineveh" | "erbil" | "sulaymaniyah" | "duhok"
  | "kirkuk" | "anbar" | "najaf" | "karbala" | "babil" | "wasit"
  | "diyala" | "salahaddin" | "qadisiyyah" | "muthanna" | "thiqar" | "maysan"
  | "halabja";

export type Gov = { code: GovernorateCode; name_ar: string; name_en: string; polygon: [number, number][] };

// Rough bounding polygons (NW, NE, SE, SW corners) — good enough as a default coarse filter.
export const GOVERNORATES: Gov[] = [
  { code: "baghdad",      name_ar: "بغداد",         name_en: "Baghdad",      polygon: [[33.60,43.80],[33.60,44.80],[33.05,44.80],[33.05,43.80]] },
  { code: "basra",        name_ar: "البصرة",        name_en: "Basra",        polygon: [[31.30,46.80],[31.30,48.60],[29.05,48.60],[29.05,46.80]] },
  { code: "nineveh",      name_ar: "نينوى",         name_en: "Nineveh",      polygon: [[37.40,41.20],[37.40,44.10],[35.30,44.10],[35.30,41.20]] },
  { code: "erbil",        name_ar: "أربيل",          name_en: "Erbil",        polygon: [[37.20,43.40],[37.20,45.40],[35.40,45.40],[35.40,43.40]] },
  { code: "sulaymaniyah", name_ar: "السليمانية",   name_en: "Sulaymaniyah", polygon: [[36.40,44.80],[36.40,46.30],[34.60,46.30],[34.60,44.80]] },
  { code: "duhok",        name_ar: "دهوك",          name_en: "Duhok",        polygon: [[37.40,42.30],[37.40,44.10],[36.40,44.10],[36.40,42.30]] },
  { code: "kirkuk",       name_ar: "كركوك",         name_en: "Kirkuk",       polygon: [[35.90,43.50],[35.90,44.90],[34.80,44.90],[34.80,43.50]] },
  { code: "anbar",        name_ar: "الأنبار",       name_en: "Anbar",        polygon: [[35.20,38.80],[35.20,43.60],[32.00,43.60],[32.00,38.80]] },
  { code: "najaf",        name_ar: "النجف",          name_en: "Najaf",        polygon: [[32.40,42.80],[32.40,44.80],[30.00,44.80],[30.00,42.80]] },
  { code: "karbala",      name_ar: "كربلاء",        name_en: "Karbala",      polygon: [[33.00,43.00],[33.00,44.40],[32.30,44.40],[32.30,43.00]] },
  { code: "babil",        name_ar: "بابل",           name_en: "Babil",        polygon: [[33.10,44.10],[33.10,45.20],[32.20,45.20],[32.20,44.10]] },
  { code: "wasit",        name_ar: "واسط",          name_en: "Wasit",        polygon: [[33.40,44.80],[33.40,46.40],[32.10,46.40],[32.10,44.80]] },
  { code: "diyala",       name_ar: "ديالى",          name_en: "Diyala",       polygon: [[34.80,44.30],[34.80,46.10],[33.30,46.10],[33.30,44.30]] },
  { code: "salahaddin",   name_ar: "صلاح الدين",   name_en: "Salahaddin",   polygon: [[35.60,42.90],[35.60,44.90],[33.70,44.90],[33.70,42.90]] },
  { code: "qadisiyyah",   name_ar: "القادسية",     name_en: "Qadisiyyah",   polygon: [[32.40,44.80],[32.40,45.90],[31.40,45.90],[31.40,44.80]] },
  { code: "muthanna",     name_ar: "المثنى",         name_en: "Muthanna",     polygon: [[31.80,44.50],[31.80,46.80],[30.00,46.80],[30.00,44.50]] },
  { code: "thiqar",       name_ar: "ذي قار",         name_en: "Dhi Qar",      polygon: [[32.10,45.70],[32.10,47.00],[30.70,47.00],[30.70,45.70]] },
  { code: "maysan",       name_ar: "ميسان",          name_en: "Maysan",       polygon: [[32.70,46.10],[32.70,47.70],[31.20,47.70],[31.20,46.10]] },
  { code: "halabja",      name_ar: "حلبجة",          name_en: "Halabja",      polygon: [[35.50,45.60],[35.50,46.30],[34.90,46.30],[34.90,45.60]] },
];

export function getGovernorate(code: string | null | undefined): Gov | null {
  if (!code) return null;
  return GOVERNORATES.find((g) => g.code === code) ?? null;
}
