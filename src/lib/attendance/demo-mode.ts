// ============================================================================
// DEMO LOCATION MODE — prototype presentations only.
//
// While ON, real GPS is NOT used for attendance decisions. Instead:
//   * every session uses the fixed DEMO_REFERENCE_POINT as the teacher location;
//   * each student gets a SIMULATED position placed relative to that point
//     (inside or outside the selected radius, chosen on the scan screen);
//   * the server computes the distance with the normal Haversine function and
//     still enforces the selected radius.
// All such values are labelled DEMO DATA in the UI and stored with
// location_valid = false. Real and simulated coordinates are never mixed.
//
// TO SWITCH BACK TO REAL GPS: set DEMO_LOCATION_MODE = false below.
// Production lock: ATTENDX_ENV (server) / VITE_ATTENDX_ENV (browser) set to
// "production" forces demo mode OFF even if the flag is left true.
// ============================================================================

import { EARTH_RADIUS_M, type LatLng } from "./geo";

export const DEMO_LOCATION_MODE = true;

/** Fixed, clearly fake reference point used for every demo session (DEMO DATA). */
export const DEMO_REFERENCE_POINT: LatLng = { lat: 22.5726, lng: 88.3639 };

export type DemoScenario = "inside" | "outside";

/** Simulated distance as a fraction of the selected radius. */
export const DEMO_DISTANCE_FACTOR: Record<DemoScenario, number> = { inside: 0.6, outside: 1.6 };

function envIsProduction(env: string | undefined) {
  return (env ?? "").trim().toLowerCase() === "production";
}

/** Server-side check. Call inside a server function handler. */
export function isDemoLocationServer(): boolean {
  if (!DEMO_LOCATION_MODE) return false;
  const env = typeof process !== "undefined" ? process.env?.["ATTENDX_ENV"] : undefined;
  return !envIsProduction(env);
}

/** Browser-side check (UI only; the server makes the decision). */
export function isDemoLocationClient(): boolean {
  if (!DEMO_LOCATION_MODE) return false;
  return !envIsProduction(import.meta.env["VITE_ATTENDX_ENV"] as string | undefined);
}

export function isDemoReference(p: { lat: number; lng: number }): boolean {
  return p.lat === DEMO_REFERENCE_POINT.lat && p.lng === DEMO_REFERENCE_POINT.lng;
}

/** Deterministic bearing (degrees) per student so positions differ but repeat. */
function bearingFor(studentId: string): number {
  let h = 2166136261;
  for (const c of studentId) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 360;
}

/** Point `meters` away from `from` along `bearingDeg` (great-circle). */
export function destinationPoint(from: LatLng, meters: number, bearingDeg: number): LatLng {
  const d = meters / EARTH_RADIUS_M;
  const b = (bearingDeg * Math.PI) / 180;
  const φ1 = (from.lat * Math.PI) / 180;
  const λ1 = (from.lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
  const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

/** Simulated student position (DEMO DATA) relative to the demo reference point. */
export function simulateStudentLocation(studentId: string, radius: number, scenario: DemoScenario): LatLng {
  return destinationPoint(DEMO_REFERENCE_POINT, radius * DEMO_DISTANCE_FACTOR[scenario], bearingFor(studentId));
}
