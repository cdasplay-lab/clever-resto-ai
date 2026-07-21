// Pure unit tests for delivery-coverage geometry. No secrets, no network —
// safe to run on every CI push. Run: deno test supabase/functions/_shared/
import assert from "node:assert/strict";
const assertEquals = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected);
import { pointInPolygon, distanceKm, checkBranchCoverage, GOVERNORATES } from "./geo.ts";

const BAGHDAD_CENTER = { lat: 33.31, lng: 44.36 };

Deno.test("pointInPolygon: inside vs outside a square", () => {
  const square: [number, number][] = [
    [0, 0],
    [0, 2],
    [2, 2],
    [2, 0],
  ];
  assert(pointInPolygon({ lat: 1, lng: 1 }, square), "center is inside");
  assert(!pointInPolygon({ lat: 5, lng: 5 }, square), "far point is outside");
});

Deno.test("pointInPolygon: degenerate polygon is never inside", () => {
  assertEquals(
    pointInPolygon({ lat: 1, lng: 1 }, [
      [0, 0],
      [1, 1],
    ]),
    false,
  );
  assertEquals(pointInPolygon({ lat: 1, lng: 1 }, []), false);
});

Deno.test("distanceKm: known distance is ~0 for same point, positive otherwise", () => {
  assertEquals(Math.round(distanceKm(BAGHDAD_CENTER, BAGHDAD_CENTER)), 0);
  const d = distanceKm({ lat: 33.31, lng: 44.36 }, { lat: 33.41, lng: 44.36 });
  assert(d > 10 && d < 13, `~11km expected, got ${d}`);
});

Deno.test("checkBranchCoverage: type=none always covers", () => {
  assertEquals(checkBranchCoverage({ coverage_type: "none" }, BAGHDAD_CENTER).covered, true);
  assertEquals(checkBranchCoverage({}, BAGHDAD_CENTER).covered, true);
});

Deno.test("checkBranchCoverage: radius accept + reject", () => {
  const branch = {
    coverage_type: "radius",
    coverage_radius_km: 8,
    latitude: 33.31,
    longitude: 44.36,
  };
  assert(checkBranchCoverage(branch, { lat: 33.33, lng: 44.36 }).covered, "2km away within 8km");
  assert(!checkBranchCoverage(branch, { lat: 33.6, lng: 44.36 }).covered, "32km away outside 8km");
});

Deno.test("checkBranchCoverage: misconfigured radius fails open (covered)", () => {
  const r = checkBranchCoverage({ coverage_type: "radius", coverage_radius_km: 0 }, BAGHDAD_CENTER);
  assertEquals(r.covered, true);
  assertEquals(r.reason, "radius_not_configured");
});

Deno.test("checkBranchCoverage: governorate inside its own polygon", () => {
  const r = checkBranchCoverage(
    { coverage_type: "governorate", coverage_governorate: "baghdad" },
    BAGHDAD_CENTER,
  );
  assertEquals(r.covered, true);
});

Deno.test("checkBranchCoverage: governorate rejects a far point", () => {
  // Basra center should NOT be covered by Baghdad's polygon.
  const r = checkBranchCoverage(
    { coverage_type: "governorate", coverage_governorate: "baghdad" },
    { lat: 30.5, lng: 47.8 },
  );
  assertEquals(r.covered, false);
});

Deno.test("checkBranchCoverage: unknown governorate fails open", () => {
  const r = checkBranchCoverage(
    { coverage_type: "governorate", coverage_governorate: "atlantis" },
    BAGHDAD_CENTER,
  );
  assertEquals(r.covered, true);
  assertEquals(r.reason, "gov_not_configured");
});

Deno.test("GOVERNORATES: all 19 provinces present with valid polygons", () => {
  // Iraq has 19 governorates since Halabja was split out in 2014.
  assertEquals(Object.keys(GOVERNORATES).length, 19);
  for (const [code, g] of Object.entries(GOVERNORATES)) {
    assert(g.polygon.length >= 3, `${code} needs >=3 points`);
    assert(g.name_ar.length > 0, `${code} needs an Arabic name`);
  }
});
