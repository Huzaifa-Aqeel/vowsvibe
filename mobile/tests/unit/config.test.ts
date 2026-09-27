import { describe, expect, it } from "vitest";
import { readMobileConfig } from "../../src/config";

const live = { VITE_APP_MODE: "live", VITE_API_BASE_URL: "https://api.example.com", VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_test" };
describe("mobile service configuration", () => {
  it("keeps the demo explicit and never silently downgrades an invalid live build", () => {
    expect(readMobileConfig({}).mode).toBe("demo");
    const config = readMobileConfig({ VITE_APP_MODE: "live" });
    expect(config.mode).toBe("live"); expect(config.errors.length).toBeGreaterThan(0);
  });
  it("accepts a complete public configuration and localhost development", () => {
    expect(readMobileConfig(live).errors).toEqual([]);
    expect(readMobileConfig({ ...live, VITE_API_BASE_URL: "http://localhost:3000" }).errors).toEqual([]);
  });
  it("rejects remote HTTP, URL credentials, and server-only Supabase keys", () => {
    for (const url of ["http://api.example.com", "https://user:secret@api.example.com", "https://api.example.com?secret=x"]) {
      expect(readMobileConfig({ ...live, VITE_API_BASE_URL: url }).errors.length).toBeGreaterThan(0);
    }
    const jwt = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
    for (const key of [jwt, "sb_secret_private"]) expect(readMobileConfig({ ...live, VITE_SUPABASE_ANON_KEY: key }).errors.length).toBeGreaterThan(0);
  });
  it("accepts Android store keys only in live mode", () => {
    const config = readMobileConfig({ ...live, VITE_REVENUECAT_API_KEY: "goog_public" });
    expect(config.errors).toEqual([]);
    expect(config.revenueCatEntitlement).toBe("vows_vibes_pro");
    expect(readMobileConfig({ VITE_REVENUECAT_API_KEY: "goog_public" }).errors.length).toBeGreaterThan(0);
    expect(readMobileConfig({ ...live, VITE_REVENUECAT_API_KEY: "sk_private" }).errors.length).toBeGreaterThan(0);
  });
});
