import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5174", launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] } },
  projects: [
    { name: "phone", testMatch: "workflows.spec.ts", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "small-phone", testMatch: "workflows.spec.ts", use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    { name: "landscape", testMatch: "workflows.spec.ts", use: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: "live-phone", testMatch: "live.spec.ts", use: { baseURL: "http://127.0.0.1:5176", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "live-small-phone", testMatch: "live.spec.ts", use: { baseURL: "http://127.0.0.1:5176", viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    { name: "live-landscape", testMatch: "live.spec.ts", use: { baseURL: "http://127.0.0.1:5176", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: "npm run dev", url: "http://127.0.0.1:5174", reuseExistingServer: false, env: { VITE_APP_MODE: "demo" } },
    { command: "npm run dev -- --port 5176", url: "http://127.0.0.1:5176", reuseExistingServer: false,
      env: { VITE_APP_MODE: "live", VITE_API_BASE_URL: "http://127.0.0.1:3006", VITE_SUPABASE_URL: "https://mobile-test.supabase.co", VITE_SUPABASE_ANON_KEY: "public-test-key", VITE_REVENUECAT_API_KEY: "", VITE_REVENUECAT_TEST_API_KEY: "", VITE_CAMERA_KIT_ENABLED: "false" } },
  ],
});
