import { afterEach, describe, expect, it } from "vitest";
import { DEMO_MODE, isDemoModeServer } from "./demo-mode";

describe("demo mode production lock", () => {
  afterEach(() => { delete process.env["ATTENDX_ENV"]; });
  it("is forced off when ATTENDX_ENV=production", () => {
    process.env["ATTENDX_ENV"] = "production";
    expect(isDemoModeServer()).toBe(false);
  });
  it("follows the DEMO_MODE flag otherwise", () => {
    expect(isDemoModeServer()).toBe(DEMO_MODE);
  });
});
