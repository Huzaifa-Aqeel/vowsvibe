export type MobileConfig = {
  mode: "demo" | "live";
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  inviteBaseUrl: string;
  cameraKitEnabled: boolean;
  revenueCatKey: string;
  revenueCatEntitlement: string;
  revenueCatOffering: string;
  errors: string[];
};

type Environment = Record<string, unknown>;
function publicUrl(value: string, name: string, errors: string[]) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) throw new Error();
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    errors.push(`${name} must be an HTTPS URL (HTTP is allowed for localhost).`);
    return "";
  }
}

export function readMobileConfig(env: Environment): MobileConfig {
  const get = (key: string) => typeof env[key] === "string" ? (env[key] as string).trim() : "";
  const errors: string[] = [];
  const rawMode = get("VITE_APP_MODE") || "demo";
  if (!["demo", "live"].includes(rawMode)) errors.push("VITE_APP_MODE must be demo or live.");
  const mode = rawMode === "demo" ? "demo" : "live";
  const apiBaseUrl = mode === "live" ? publicUrl(get("VITE_API_BASE_URL"), "VITE_API_BASE_URL", errors) : "";
  const supabaseUrl = mode === "live" ? publicUrl(get("VITE_SUPABASE_URL"), "VITE_SUPABASE_URL", errors) : "";
  const supabaseKey = get("VITE_SUPABASE_ANON_KEY");
  if (mode === "live") {
    if (!supabaseKey) errors.push("VITE_SUPABASE_ANON_KEY is required for live mode.");
    if (supabaseKey.startsWith("sb_secret_")) errors.push("Use a Supabase public key, never a secret key.");
    try {
      const payload = JSON.parse(atob((supabaseKey.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "service_role") errors.push("A service-role key cannot be bundled in the mobile app.");
    } catch { /* New public keys are not JWTs. Supabase validates credentials. */ }
  }
  const inviteBaseUrl = get("VITE_INVITE_BASE_URL")
    ? publicUrl(get("VITE_INVITE_BASE_URL"), "VITE_INVITE_BASE_URL", errors) : apiBaseUrl;
  const revenueCatKey = get("VITE_REVENUECAT_API_KEY") || get("VITE_REVENUECAT_TEST_API_KEY");
  if (revenueCatKey && !(revenueCatKey.startsWith("test_") || (mode === "live" && revenueCatKey.startsWith("goog_")))) {
    errors.push("Use a RevenueCat Test Store public key, or an Android public key in live mode.");
  }
  return { mode, apiBaseUrl, supabaseUrl, supabaseKey, inviteBaseUrl,
    cameraKitEnabled: mode === "live" && get("VITE_CAMERA_KIT_ENABLED") === "true",
    revenueCatKey, revenueCatEntitlement: get("VITE_REVENUECAT_ENTITLEMENT") || "vows_vibes_pro",
    revenueCatOffering: get("VITE_REVENUECAT_OFFERING"), errors };
}

// Refer to individual public values so unrelated VITE_* variables cannot enter the bundle.
export const mobileConfig = readMobileConfig({
  VITE_APP_MODE: import.meta.env.VITE_APP_MODE,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_INVITE_BASE_URL: import.meta.env.VITE_INVITE_BASE_URL,
  VITE_CAMERA_KIT_ENABLED: import.meta.env.VITE_CAMERA_KIT_ENABLED,
  VITE_REVENUECAT_API_KEY: import.meta.env.VITE_REVENUECAT_API_KEY,
  VITE_REVENUECAT_TEST_API_KEY: import.meta.env.VITE_REVENUECAT_TEST_API_KEY,
  VITE_REVENUECAT_ENTITLEMENT: import.meta.env.VITE_REVENUECAT_ENTITLEMENT,
  VITE_REVENUECAT_OFFERING: import.meta.env.VITE_REVENUECAT_OFFERING,
});
