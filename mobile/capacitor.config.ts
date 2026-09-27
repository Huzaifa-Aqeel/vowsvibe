import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "com.vowsvibe.mobile",
  appName: "Vows & Vibe",
  webDir: "dist",
  backgroundColor: "#fbf9f5",
  loggingBehavior: "none",
  // Bundle the frontend, not a remote production WebView URL.
  android: { allowMixedContent: false },
};
export default config;
