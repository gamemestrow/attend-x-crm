// Geographic helpers — validated Haversine distance + browser geolocation.
// Location is verified with the browser Geolocation API only (no Bluetooth).

export interface LatLng {
  lat: number;
  lng: number;
}

/** A single browser location reading. accuracy is the browser's *estimated* 68% radius in meters. */
export interface LocationFix extends LatLng {
  accuracy: number;
  timestamp: number;
}

/** Mean Earth radius (IUGG) in meters — used everywhere for consistency. */
export const EARTH_RADIUS_M = 6371008.8;

/**
 * Location-quality policy. Separate from the attendance radius: it only
 * decides whether a reading is good enough to evaluate, never widens the area.
 */
export const LOCATION_QUALITY = {
  /** A reading whose reported accuracy is worse than this cannot be evaluated. */
  maxAccuracyMeters: 50,
  /** Readings older than this are considered stale. */
  maxAgeMs: 30_000,
  /** Geolocation request timeout. */
  timeoutMs: 20_000,
  /** watchPosition attempts before giving up on a better reading. */
  watchWindowMs: 12_000,
} as const;

/**
 * Accuracy a *teacher reference* reading needs for a given radius. Laptops
 * have no GPS (Wi-Fi positioning is typically ±60-150 m), so a fixed ±50 m
 * blocked every laptop. The reference only needs to be small relative to the
 * area: at most half the radius, never looser than ±150 m, never stricter
 * than the student limit. The radius itself is never changed.
 */
export function teacherMaxAccuracy(radiusMeters: number): number {
  return Math.min(150, Math.max(LOCATION_QUALITY.maxAccuracyMeters, radiusMeters / 2));
}

export function isValidLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Great-circle distance in meters (unrounded). Throws on invalid coordinates. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  if (!isValidLatLng(a) || !isValidLatLng(b)) throw new Error("invalid-coordinates");
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  // Clamp guards against floating-point drift slightly above 1.
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(Math.max(0, s))));
}

export type QualityVerdict = "OK" | "LOW_ACCURACY" | "STALE" | "INVALID";

export function assessFix(fix: unknown, now: number = Date.now()): QualityVerdict {
  if (!isValidLatLng(fix)) return "INVALID";
  const { accuracy, timestamp } = fix as Partial<LocationFix>;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0) return "INVALID";
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return "INVALID";
  if (timestamp > now + 60_000) return "INVALID";
  if (now - timestamp > LOCATION_QUALITY.maxAgeMs) return "STALE";
  if (accuracy > LOCATION_QUALITY.maxAccuracyMeters) return "LOW_ACCURACY";
  return "OK";
}

export type RadiusDecision =
  | { kind: "INSIDE"; distance: number }
  | { kind: "OUTSIDE"; distance: number }
  | { kind: "UNCERTAIN"; distance: number | null; quality: QualityVerdict; who: "teacher" | "student" };

/**
 * Case A: quality OK & distance <= radius  -> INSIDE
 * Case B: either reading not usable          -> UNCERTAIN (retry; never "too far")
 * Case C: quality OK & distance > radius     -> OUTSIDE
 * The radius is never enlarged and accuracy is never subtracted from distance.
 */
export function decideRadius(
  teacher: LocationFix,
  student: LocationFix,
  radiusMeters: number,
  now: number = Date.now(),
  teacherMaxAgeMs = Number.POSITIVE_INFINITY,
): RadiusDecision {
  const tq = isValidLatLng(teacher) && Number.isFinite(teacher.accuracy)
    ? teacher.accuracy > teacherMaxAccuracy(radiusMeters)
      ? "LOW_ACCURACY"
      : now - teacher.timestamp > teacherMaxAgeMs
        ? "STALE"
        : "OK"
    : "INVALID";
  const sq = assessFix(student, now);
  if (tq !== "OK") return { kind: "UNCERTAIN", distance: null, quality: tq, who: "teacher" };
  const distance = haversineMeters(teacher, student);
  if (sq !== "OK") return { kind: "UNCERTAIN", distance: sq === "INVALID" ? null : distance, quality: sq, who: "student" };
  return distance <= radiusMeters ? { kind: "INSIDE", distance } : { kind: "OUTSIDE", distance };
}

export type GeoErrorCode = "UNSUPPORTED" | "INSECURE" | "DENIED" | "UNAVAILABLE" | "TIMEOUT";

export class GeoError extends Error {
  constructor(public code: GeoErrorCode) {
    super(code);
  }
}

function mapError(err: GeolocationPositionError): GeoError {
  if (err.code === 1) return new GeoError("DENIED");
  if (err.code === 3) return new GeoError("TIMEOUT");
  return new GeoError("UNAVAILABLE");
}

function precheck() {
  if (typeof window !== "undefined" && window.isSecureContext === false) throw new GeoError("INSECURE");
  if (typeof navigator === "undefined" || !navigator.geolocation) throw new GeoError("UNSUPPORTED");
}

const toFix = (p: GeolocationPosition): LocationFix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: p.coords.accuracy,
  timestamp: p.timestamp,
});

/**
 * Fresh high-accuracy reading. Starts with getCurrentPosition, then keeps a
 * watchPosition open for a short window and returns the reading with the best
 * reported accuracy (no coordinate averaging). Resolves early once a reading
 * meets the quality threshold.
 */
export function getFreshFix(opts?: { timeoutMs?: number; windowMs?: number; targetAccuracy?: number }): Promise<LocationFix> {
  const target = opts?.targetAccuracy ?? LOCATION_QUALITY.maxAccuracyMeters;
  const timeout = opts?.timeoutMs ?? LOCATION_QUALITY.timeoutMs;
  const windowMs = opts?.windowMs ?? LOCATION_QUALITY.watchWindowMs;
  return new Promise((resolve, reject) => {
    try {
      precheck();
    } catch (e) {
      reject(e);
      return;
    }
    const geo = navigator.geolocation;
    const options: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout };
    let best: LocationFix | null = null;
    let watchId: number | null = null;
    let done = false;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (watchId != null) geo.clearWatch(watchId);
      if (windowTimer) clearTimeout(windowTimer);
      if (pollTimer) clearInterval(pollTimer);
      fn();
    };
    const consider = (p: GeolocationPosition) => {
      const fix = toFix(p);
      if (!best || fix.accuracy < best.accuracy) best = fix;
      if (fix.accuracy <= target) finish(() => resolve(fix));
    };
    const onErr = (err: GeolocationPositionError) => {
      if (best) finish(() => resolve(best!));
      else finish(() => reject(mapError(err)));
    };
    geo.getCurrentPosition(
      (p) => {
        consider(p);
        if (done) return;
        watchId = geo.watchPosition(consider, onErr, options);
        // Desktop Chrome often never fires watchPosition again on a stationary
        // laptop; re-request a fresh reading every 3 s within the same window.
        pollTimer = setInterval(() => {
          if (!done) geo.getCurrentPosition(consider, () => {}, options);
        }, 3000);
        windowTimer = setTimeout(() => finish(() => resolve(best!)), windowMs);
      },
      onErr,
      options,
    );
  });
}

export const GEO_ERROR_COPY: Record<GeoErrorCode, string> = {
  UNSUPPORTED: "This browser does not support location access. Use a current version of Chrome.",
  INSECURE: "Location only works on a secure (https://) page. Open the app from its https link.",
  DENIED: "Location permission was denied. Allow location for this site in your browser settings and retry.",
  UNAVAILABLE: "Your device could not determine a location. Turn on device location / Wi-Fi and retry.",
  TIMEOUT: "Getting your location took too long. Move near a window or open area and retry.",
};
