import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { mobileConfig } from "../config";
import { subscribeToDemoUpdates } from "../demo/backend";
let liveClient: ReturnType<typeof createSupabaseClient> | null = null;
export function createClient() {
  if (mobileConfig.mode === "live") {
    if (mobileConfig.errors.length) throw new Error(mobileConfig.errors.join(" "));
    liveClient ??= createSupabaseClient(mobileConfig.supabaseUrl, mobileConfig.supabaseKey, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        ...(Capacitor.isNativePlatform() ? { storage: {
          getItem: async (key: string) => (await Preferences.get({ key })).value,
          setItem: async (key: string, value: string) => { await Preferences.set({ key, value }); },
          removeItem: async (key: string) => { await Preferences.remove({ key }); },
        } } : {}),
      },
    });
    return liveClient;
  } else {
    // Browser-compatible demo signals only. This is not a Supabase Realtime connection.
    const stops = new Map<object, () => void>();
    return {
      channel: () => {
        const callbacks: Array<() => void> = [];
        const channel = { on: (_kind: unknown, _filter: unknown, callback: () => void) => { callbacks.push(callback); return channel; }, subscribe: () => { stops.set(channel, subscribeToDemoUpdates(() => callbacks.forEach((callback) => callback()))); return channel; } };
        return channel;
      },
      removeChannel: async (channel: object) => { stops.get(channel)?.(); stops.delete(channel); return "ok"; },
    } as unknown as ReturnType<typeof createSupabaseClient>;
  }
}
