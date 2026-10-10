import { describe, expect, it } from "vitest";
import { assessFix, decideRadius, teacherMaxAccuracy, haversineMeters, LOCATION_QUALITY } from "./geo";

const NOW = 1_800_000_000_000;
const fix = (lat: number, lng: number, accuracy = 10, timestamp = NOW) => ({ lat, lng, accuracy, timestamp });
// 1e-5 deg latitude ≈ 1.112 m
const metersNorth = (m: number) => m / 111_195;

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters({ lat: 22.5726, lng: 88.3639 }, { lat: 22.5726, lng: 88.3639 })).toBe(0);
  });
  it("matches known distance Kolkata -> Delhi (~1305 km)", () => {
    const d = haversineMeters({ lat: 22.5726, lng: 88.3639 }, { lat: 28.6139, lng: 77.209 });
    expect(d / 1000).toBeGreaterThan(1300);
    expect(d / 1000).toBeLessThan(1310);
  });
  it("returns meters: 1 degree of latitude ≈ 111.2 km", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeCloseTo(111_195, -1);
  });
  it("50 m north is ~50 m", () => {
    const d = haversineMeters({ lat: 22.5726, lng: 88.3639 }, { lat: 22.5726 + metersNorth(50), lng: 88.3639 });
    expect(d).toBeCloseTo(50, 1);
  });
  it("handles antipodal points without NaN", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(d)).toBe(true);
  });
  it("rejects out-of-range and malformed coordinates", () => {
    expect(() => haversineMeters({ lat: 91, lng: 0 }, { lat: 0, lng: 0 })).toThrow();
    expect(() => haversineMeters({ lat: 0, lng: 181 }, { lat: 0, lng: 0 })).toThrow();
    expect(() => haversineMeters({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 })).toThrow();
  });
});

describe("decideRadius (50 m radius)", () => {
  const teacher = fix(22.5726, 88.3639, 12);
  it("accepts a reliable reading 40 m away", () => {
    expect(decideRadius(teacher, fix(22.5726 + metersNorth(40), 88.3639, 15), 50, NOW).kind).toBe("INSIDE");
  });
  it("rejects a reliable reading 57 m away (no hidden buffer)", () => {
    const r = decideRadius(teacher, fix(22.5726 + metersNorth(57), 88.3639, 10), 50, NOW);
    expect(r.kind).toBe("OUTSIDE");
  });
  it("accepts exactly-on-boundary using unrounded distance", () => {
    const r = decideRadius(teacher, fix(22.5726 + metersNorth(49.9), 88.3639, 10), 50, NOW);
    expect(r.kind).toBe("INSIDE");
  });
  it("asks for retry instead of rejecting when student accuracy is poor", () => {
    const r = decideRadius(teacher, fix(22.5726 + metersNorth(57), 88.3639, 120), 50, NOW);
    expect(r).toMatchObject({ kind: "UNCERTAIN", who: "student", quality: "LOW_ACCURACY" });
  });
  it("flags poor teacher accuracy", () => {
    const r = decideRadius(fix(22.5726, 88.3639, 300), fix(22.5726, 88.3639, 5), 50, NOW);
    expect(r).toMatchObject({ kind: "UNCERTAIN", who: "teacher" });
  });
  it("flags stale student readings", () => {
    expect(assessFix(fix(22.5, 88.3, 5, NOW - LOCATION_QUALITY.maxAgeMs - 1), NOW)).toBe("STALE");
  });
});

describe("teacherMaxAccuracy (radius is never changed)", () => {
  it("50 m radius keeps ±50 m", () => expect(teacherMaxAccuracy(50)).toBe(50));
  it("200 m radius accepts a ±100 m laptop reference", () => expect(teacherMaxAccuracy(200)).toBe(100));
  it("caps at ±150 m", () => expect(teacherMaxAccuracy(1000)).toBe(150));
  it("±105 m teacher with 300 m radius is usable server-side", () => {
    const t = fix(22.5726, 88.3639, 105);
    expect(decideRadius(t, fix(22.5726 + metersNorth(40), 88.3639, 10), 300, NOW).kind).toBe("INSIDE");
  });
});
