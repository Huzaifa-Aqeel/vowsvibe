import { App as NativeApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { createClient } from "./supabase";
import { mobileConfig, type MobileConfig } from "../config";

export const NATIVE_AUTH_CALLBACK = "com.vowsvibe.mobile://auth/callback";
const RETURN_KEY = "vv-mobile-auth-return";

export function safeReturnPath(path: string | null) {
  return path && /^\/events\/[a-zA-Z0-9-]+(?:\/(?:style|lineup|edit|messages))?$/.test(path) ? path : "/dashboard";
}

export function parseIncomingLink(raw: string, config: Pick<MobileConfig, "inviteBaseUrl">) {
  try {
    const url = new URL(raw);
    if (url.protocol === "com.vowsvibe.mobile:") {
      if (url.hostname === "auth" && url.pathname === "/callback") return { kind: "auth" as const, url };
      if (url.hostname === "invite" && /^\/[a-zA-Z0-9-]+$/.test(url.pathname)) return { kind: "invite" as const, path: `/invite${url.pathname}` };
      return null;
    }
    const origin = new URL(config.inviteBaseUrl).origin;
    if (url.origin !== origin || url.username || url.password) return null;
    if (/^\/invite\/[a-zA-Z0-9-]+$/.test(url.pathname)) return { kind: "invite" as const, path: url.pathname };
    return null;
  } catch { return null; }
}

export async function signInWithGoogle(returnPath: string) {
  sessionStorage.setItem(RETURN_KEY, safeReturnPath(returnPath));
  const redirectTo = Capacitor.isNativePlatform() ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/auth/callback`;
  const { data, error } = await createClient().auth.signInWithOAuth({ provider: "google",
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be opened. Please try again.");
  if (Capacitor.isNativePlatform()) await Browser.open({ url: data.url });
  else window.location.assign(data.url);
}

let exchange: Promise<string> | null = null;
export function completeOAuth(url: URL): Promise<string> {
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (error) return Promise.reject(new Error(error));
  const code = url.searchParams.get("code");
  if (!code) return Promise.reject(new Error("The sign-in link has no authorization code. Start Google sign-in again."));
  // Cold-start and appUrlOpen can both deliver the same callback.
  if (exchange) return exchange;
  exchange = (async () => {
    const { error: sessionError } = await createClient().auth.exchangeCodeForSession(code);
    if (sessionError) throw sessionError;
    if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
    const destination = safeReturnPath(sessionStorage.getItem(RETURN_KEY));
    sessionStorage.removeItem(RETURN_KEY);
    return destination;
  })().finally(() => { exchange = null; });
  return exchange;
}

export async function listenForAppLinks(navigate: (path: string) => void, reportError: (message: string) => void) {
  const handle = async (raw: string) => {
    const link = parseIncomingLink(raw, mobileConfig);
    if (!link) return;
    try { navigate(link.kind === "auth" ? await completeOAuth(link.url) : link.path); }
    catch (error) { reportError(error instanceof Error ? error.message : "Could not open this link."); }
  };
  const listener = await NativeApp.addListener("appUrlOpen", ({ url }) => { void handle(url); });
  const launch = await NativeApp.getLaunchUrl();
  if (launch?.url) await handle(launch.url);
  return () => { void listener.remove(); };
}
