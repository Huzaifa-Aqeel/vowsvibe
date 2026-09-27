import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ oauth: vi.fn(), exchange: vi.fn(), open: vi.fn(), close: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/browser", () => ({ Browser: { open: mocks.open, close: mocks.close } }));
vi.mock("../../src/platform/supabase", () => ({ createClient: () => ({ auth: { signInWithOAuth: mocks.oauth, exchangeCodeForSession: mocks.exchange } }) }));
import { completeOAuth, NATIVE_AUTH_CALLBACK, parseIncomingLink, safeReturnPath, signInWithGoogle } from "../../src/platform/auth";
beforeEach(() => {
  vi.clearAllMocks();
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) });
  mocks.oauth.mockResolvedValue({ data: { url: "https://supabase.example.com/authorize" }, error: null });
  mocks.exchange.mockResolvedValue({ error: null }); mocks.close.mockResolvedValue(undefined);
});
describe("mobile OAuth and invitations", () => {
  it("uses PKCE's external-browser callback and exchanges the returned code", async () => {
    await signInWithGoogle("/events/wedding/style");
    expect(mocks.oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } } });
    expect(mocks.open).toHaveBeenCalledWith({ url: "https://supabase.example.com/authorize" });
    expect(await completeOAuth(new URL(`${NATIVE_AUTH_CALLBACK}?code=one-use-code`))).toBe("/events/wedding/style");
    expect(mocks.exchange).toHaveBeenCalledWith("one-use-code");
  });
  it("rejects missing codes, OAuth errors, and unsafe return paths", async () => {
    await expect(completeOAuth(new URL(`${NATIVE_AUTH_CALLBACK}#access_token=unsafe`))).rejects.toThrow("authorization code");
    await expect(completeOAuth(new URL(`${NATIVE_AUTH_CALLBACK}?error_description=Access%20denied`))).rejects.toThrow("Access denied");
    expect(safeReturnPath("//external.example.com")).toBe("/dashboard"); expect(safeReturnPath("/events/wedding/lineup")).toBe("/events/wedding/lineup");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("accepts only known callback and invite links from the trusted host", () => {
    const config = { inviteBaseUrl: "https://wedding.example.com" };
    expect(parseIncomingLink(`${NATIVE_AUTH_CALLBACK}?code=x`, config)?.kind).toBe("auth");
    expect(parseIncomingLink("com.vowsvibe.mobile://invite/abc123", config)).toEqual({ kind: "invite", path: "/invite/abc123" });
    expect(parseIncomingLink("https://wedding.example.com/invite/abc123", config)?.kind).toBe("invite");
    for (const url of ["https://evil.example.com/invite/abc123", "com.vowsvibe.mobile://auth/other?code=x", "javascript:alert(1)", "https://wedding.example.com/invite/../../events/private"]) expect(parseIncomingLink(url, config)).toBeNull();
  });
});
