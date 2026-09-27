import type { Session } from "@supabase/supabase-js";

type SessionReader = () => Promise<{ data: { session: Session | null }; error: { message: string } | null }>;

/** Tokens are attached only to API requests sent to our configured backend. */
export function createApiRequest(base: string, readSession: SessionReader, network: typeof fetch = globalThis.fetch): typeof fetch {
  const backend = new URL(base);
  return async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const relativeApi = raw.startsWith("/api/");
    const url = relativeApi ? new URL(`${base.replace(/\/$/, "")}${raw}`) : new URL(raw, window.location.origin);
    const backendApi = url.origin === backend.origin && url.pathname.startsWith(`${backend.pathname.replace(/\/$/, "")}/api/`);
    if (!relativeApi && !backendApi) return network(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    // Free ngrok tunnels otherwise return an HTML warning to Android WebView GETs.
    if (backend.hostname.endsWith(".ngrok-free.dev")) headers.set("ngrok-skip-browser-warning", "true");
    // Caller-supplied credentials cannot override the current signed-in identity.
    headers.delete("authorization");
    const { data: { session }, error } = await readSession();
    if (error) throw new Error(`Could not restore your session: ${error.message}`);
    if (session) headers.set("authorization", `Bearer ${session.access_token}`);
    const source = input instanceof Request ? new Request(url, input) : url;
    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // AI generation and confirmation include server work that can run for several minutes.
    const longRequest = method !== "GET" && (url.pathname.endsWith("/group-preview")
      || url.pathname.endsWith("/confirm") || (method === "PATCH" && /\/api\/participants\/[^/]+$/.test(url.pathname)));
    const timeout = AbortSignal.timeout(longRequest ? 300_000 : 60_000);
    try {
      return await network(source, { ...init, headers, credentials: "omit", redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    } catch (error) {
      if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw error;
      throw new Error("Could not reach Vows & Vibe. Check your connection and try again.");
    }
  };
}

export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status}).`);
  if (body === null) throw new Error("The server returned an unreadable response.");
  return body as T;
}
