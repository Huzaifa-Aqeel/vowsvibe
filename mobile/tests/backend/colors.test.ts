import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.stubEnv("GROQ_API_BASE", "https://color-provider.test/v1"); vi.stubEnv("GROQ_API_KEY", "server-only-test-key"); vi.stubEnv("GROQ_COLOR_MODEL", "qwen/qwen3.8-27b"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("reuses exact wedding swatches without needing a provider call", async () => {
  vi.stubEnv("GROQ_API_KEY", ""); const network = vi.fn(); vi.stubGlobal("fetch", network);
  const { resolveDressColor } = await import("../../../src/lib/color/dress-color-resolver");
  expect(await resolveDressColor("  Sage  Green ", [{ name: "Sage Green", hex: "#a8b8a0", family: "green" }])).toEqual({ primaryHex: "#A8B8A0", family: "green" });
  expect(network).not.toHaveBeenCalled();
});

it("uses a server-side text-only request and validates the model's hex and family", async () => {
  const network = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"primaryHex":"#c88a98","family":"pink"}' } }] })); vi.stubGlobal("fetch", network);
  const { resolveDressColor } = await import("../../../src/lib/color/dress-color-resolver");
  expect(await resolveDressColor("Muted ceremony rose")).toEqual({ primaryHex: "#C88A98", family: "pink" });
  const [, options] = network.mock.calls[0]; const body = JSON.parse(options.body);
  expect(body.messages[0].content).toContain("Muted ceremony rose"); expect(body.messages[0].content).not.toContain("image_url");
  expect(body.reasoning_effort).toBe("none"); expect(body.reasoning_format).toBe("hidden");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it("reports organization permission failures instead of substituting a fake colour", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "model_permission_blocked_org" } }, { status: 403 })));
  const { resolveDressColor } = await import("../../../src/lib/color/dress-color-resolver");
  await expect(resolveDressColor("Muted ceremony rose")).rejects.toThrow("model_permission_blocked_org");
});

it("rejects malformed model output and propagates cancellation", async () => {
  const network = vi.fn().mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"primaryHex":"not-a-hex","family":"pink"}' } }] })).mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError")); vi.stubGlobal("fetch", network);
  const { resolveDressColor } = await import("../../../src/lib/color/dress-color-resolver");
  await expect(resolveDressColor("Muted ceremony rose")).rejects.toThrow("Could not resolve");
  await expect(resolveDressColor("Muted ceremony rose")).rejects.toMatchObject({ name: "TimeoutError" });
});
