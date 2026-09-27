import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
import { createClient } from "../../../src/lib/supabase/server";
import { mobileCorsHeaders } from "../../../src/lib/platform/cors";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend-test.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key"); mocks.headers.mockResolvedValue(new Headers()); mocks.cookies.mockResolvedValue({ get: vi.fn(() => undefined) }); });
describe("web and mobile backend auth", () => {
  it("passes mobile bearer credentials to the public RLS client", async () => {
    mocks.headers.mockResolvedValue(new Headers({ Authorization: "Bearer verified-by-supabase" }));
    const network = vi.fn().mockImplementation(async () => Response.json({ id: "owner-id", email: "owner@example.com" })); vi.stubGlobal("fetch", network);
    const client = await createClient(); const user = await client.auth.getUser();
    expect(user.data.user?.id).toBe("owner-id");
    expect(String(network.mock.calls[0][0])).toContain("/auth/v1/user");
    expect(new Headers(network.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer verified-by-supabase");
    await client.from("events").select("id");
    expect(new Headers(network.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer verified-by-supabase");
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
  it("retains cookie-based web sessions", async () => {
    const client = await createClient(); expect(mocks.cookies).toHaveBeenCalled();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
  it("limits CORS to explicitly configured origins and does not expose cookie credentials", () => {
    expect(mobileCorsHeaders("https://localhost", "https://localhost,http://127.0.0.1:5176")?.["Access-Control-Allow-Origin"]).toBe("https://localhost");
    expect(mobileCorsHeaders("https://evil.example.com", "https://localhost")).toBeNull();
    expect(mobileCorsHeaders("https://localhost.evil.example.com", "https://localhost")).toBeNull();
    expect(mobileCorsHeaders("null", "https://localhost")).toBeNull();
    expect(mobileCorsHeaders("https://localhost", "https://localhost")).not.toHaveProperty("Access-Control-Allow-Credentials");
  });
});
