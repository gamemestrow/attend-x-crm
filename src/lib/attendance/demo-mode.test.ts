import { afterEach, describe, expect, it } from "vitest";
import { DEMO_LOCATION_MODE, DEMO_REFERENCE_POINT, isDemoLocationServer, simulateStudentLocation } from "./demo-mode";
import { haversineMeters } from "./geo";

describe("demo location mode", () => {
  afterEach(() => { delete process.env["ATTENDX_ENV"]; });
  it("is forced off when ATTENDX_ENV=production", () => {
    process.env["ATTENDX_ENV"] = "production";
    expect(isDemoLocationServer()).toBe(false);
  });
  it("follows the flag otherwise", () => {
    expect(isDemoLocationServer()).toBe(DEMO_LOCATION_MODE);
  });
  for (const r of [50, 100, 200, 300, 75]) {
    it(`inside scenario is within ${r} m, outside is beyond it`, () => {
      const inD = haversineMeters(DEMO_REFERENCE_POINT, simulateStudentLocation("STU001", r, "inside"));
      const outD = haversineMeters(DEMO_REFERENCE_POINT, simulateStudentLocation("STU001", r, "outside"));
      expect(inD).toBeLessThanOrEqual(r);
      expect(Math.abs(inD - 0.6 * r)).toBeLessThan(0.5);
      expect(outD).toBeGreaterThan(r);
    });
  }
});
