import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { createApiRequest, readApiJson } from "../../src/platform/api";
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const session = { access_token: "current-access-token" } as Session;
describe("authenticated mobile API transport", () => {
  it("bypasses ngrok's browser warning for backend API calls without adding the header to other hosts", async () => {
    vi.stubGlobal("window", { location: { origin: "https://localhost" } });
    const network = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const readSession = async () => ({ data: { session: null }, error: null });
    const tunnel = createApiRequest("https://wedding.ngrok-free.dev", readSession, network);
    await tunnel("/api/invites/abc");
    await tunnel("https://storage.example.com/photo.png");
    await createApiRequest("https://api.example.com", readSession, network)("/api/events");
    await createApiRequest("https://wedding.ngrok-free.dev.evil.example", readSession, network)("/api/events");
    expect(network.mock.calls[0][1].headers.get("ngrok-skip-browser-warning")).toBe("true");
    expect(network.mock.calls[1][1]).toBeUndefined();
    expect(network.mock.calls[2][1].headers.get("ngrok-skip-browser-warning")).toBeNull();
    expect(network.mock.calls[3][1].headers.get("ngrok-skip-browser-warning")).toBeNull();
  });
  it("allows long-running AI previews and confirmations to finish without truncating the backend budget", async () => {
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const api = createApiRequest("https://api.example.com", async () => ({ data: { session }, error: null }), vi.fn().mockResolvedValue(Response.json({ ok: true })));
    await api("/api/events/a/group-preview", { method: "POST" });
    await api("/api/bridal-look/a/confirm", { method: "POST" });
    await api("/api/participants/a?token=guest", { method: "PATCH" });
    await api("/api/events");
    expect(timeouts.mock.calls.map(([duration]) => duration)).toEqual([300_000, 300_000, 300_000, 60_000]);
  });
  it("attaches the current bearer token and preserves multipart upload metadata", async () => {
    const network = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const api = createApiRequest("https://api.example.com", async () => ({ data: { session }, error: null }), network);
    const body = new FormData(); body.append("token", "guest-session"); body.append("file", new Blob(["photo"], { type: "image/png" }));
    await api("/api/upload", { method: "POST", body, headers: { Authorization: "Bearer stale", "X-Custom": "preserved" } });
    const [url, options] = network.mock.calls[0];
    expect(url.href).toBe("https://api.example.com/api/upload");
    expect(options.headers.get("Authorization")).toBe("Bearer current-access-token");
    expect(options.headers.get("Content-Type")).toBeNull();
    expect(options.body.get("token")).toBe("guest-session");
    expect(options.credentials).toBe("omit"); expect(options.redirect).toBe("error");
  });
  it("never adds an auth token to external images or unrelated same-origin paths", async () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example.com" } });
    const network = vi.fn().mockResolvedValue(new Response("image"));
    const getSession = vi.fn(); const api = createApiRequest("https://api.example.com", getSession, network);
    for (const url of ["https://storage.example.com/image.png", "https://api.example.com/image.png", "data:image/png;base64,aA=="]) await api(url);
    expect(getSession).not.toHaveBeenCalled();
    expect(network.mock.calls.every((call) => call[1] === undefined)).toBe(true);
  });
  it("supports anonymous invite requests and refreshes the token for each request", async () => {
    const getSession = vi.fn().mockResolvedValueOnce({ data: { session: null }, error: null }).mockResolvedValueOnce({ data: { session }, error: null });
    const network = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const api = createApiRequest("https://api.example.com", getSession, network);
    await api("/api/invites/abc"); await api("/api/events");
    expect(network.mock.calls[0][1].headers.get("Authorization")).toBeNull();
    expect(network.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer current-access-token");
  });
  it("stops a request when session restoration fails", async () => {
    const network = vi.fn();
    const api = createApiRequest("https://api.example.com", async () => ({ data: { session: null }, error: { message: "Session expired" } }), network);
    await expect(api("/api/events")).rejects.toThrow("Session expired"); expect(network).not.toHaveBeenCalled();
  });
  it("preserves cancellation and reports unreadable or failed responses", async () => {
    const network = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const api = createApiRequest("https://api.example.com", async () => ({ data: { session: null }, error: null }), network);
    await expect(api("/api/events")).rejects.toMatchObject({ name: "AbortError" });
    await expect(readApiJson(Response.json({ error: "Not authorized" }, { status: 403 }))).rejects.toThrow("Not authorized");
    await expect(readApiJson(new Response("<html>oops"))).rejects.toThrow("unreadable");
  });
});
