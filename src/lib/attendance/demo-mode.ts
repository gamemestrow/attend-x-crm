// ============================================================================
// TEMPORARY DEMO MODE — prototype demonstration only.
//
// While active, attendance is NOT rejected for location distance or location
// accuracy. QR expiry, session status, class, login and duplicate checks are
// still enforced. Records accepted this way are stored with location_valid =
// false, so nobody can mistake them for geographically verified attendance.
//
// TO DISABLE (restore strict radius + accuracy enforcement):
//   set DEMO_MODE = false below.  No other code changes are needed.
//
// Production safety lock: if the environment variable ATTENDX_ENV (server) or
// VITE_ATTENDX_ENV (browser) is "production", Demo Mode is forced OFF even if
// DEMO_MODE is left true by mistake.
// ============================================================================

export const DEMO_MODE = true;

function envIsProduction(env: string | undefined) {
  return (env ?? "").trim().toLowerCase() === "production";
}

/** Server-side check. Call inside a server function handler. */
export function isDemoModeServer(): boolean {
  if (!DEMO_MODE) return false;
  const env = typeof process !== "undefined" ? process.env?.["ATTENDX_ENV"] : undefined;
  return !envIsProduction(env);
}

/** Browser-side check (UI behaviour + labels only; the server decides acceptance). */
export function isDemoModeClient(): boolean {
  if (!DEMO_MODE) return false;
  return !envIsProduction(import.meta.env["VITE_ATTENDX_ENV"] as string | undefined);
}
