import { beforeEach, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ configure: vi.fn(), getAppUserID: vi.fn(), logIn: vi.fn(), isAnonymous: vi.fn(), logOut: vi.fn() }));
vi.mock("@revenuecat/purchases-capacitor", () => ({ Purchases: sdk }));
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); sdk.getAppUserID.mockResolvedValue({ appUserID: "bride-a" }); sdk.isAnonymous.mockResolvedValue({ isAnonymous: false }); });

it("retries a failed SDK setup and uses the verified account identity", async () => {
  const { ensurePurchasesIdentity } = await import("../../src/platform/purchases");
  sdk.configure.mockRejectedValueOnce(new Error("Store unavailable"));
  await expect(ensurePurchasesIdentity("test_public", "bride-a")).rejects.toThrow("Store unavailable");
  await ensurePurchasesIdentity("test_public", "bride-a");
  expect(sdk.configure).toHaveBeenCalledTimes(2);
  expect(sdk.configure).toHaveBeenLastCalledWith({ apiKey: "test_public", appUserID: "bride-a" });
});

it("serializes account switches and logout to prevent buying against another account", async () => {
  const { ensurePurchasesIdentity, clearPurchasesIdentity } = await import("../../src/platform/purchases");
  await Promise.all([ensurePurchasesIdentity("test_public", "bride-a"), ensurePurchasesIdentity("test_public", "bride-b"), clearPurchasesIdentity()]);
  expect(sdk.configure).toHaveBeenCalledTimes(1);
  expect(sdk.logIn).toHaveBeenCalledWith({ appUserID: "bride-b" });
  expect(sdk.logIn.mock.invocationCallOrder[0]).toBeLessThan(sdk.logOut.mock.invocationCallOrder[0]);
});

it("keeps identity changes retryable after a failed login", async () => {
  const { ensurePurchasesIdentity } = await import("../../src/platform/purchases");
  sdk.logIn.mockRejectedValueOnce(new Error("Identity unavailable"));
  await expect(ensurePurchasesIdentity("test_public", "bride-b")).rejects.toThrow();
  await ensurePurchasesIdentity("test_public", "bride-b");
  expect(sdk.logIn).toHaveBeenCalledTimes(2);
});

it("does not log out an anonymous or unconfigured customer", async () => {
  const { ensurePurchasesIdentity, clearPurchasesIdentity } = await import("../../src/platform/purchases");
  await clearPurchasesIdentity(); expect(sdk.isAnonymous).not.toHaveBeenCalled();
  await ensurePurchasesIdentity("test_public"); sdk.isAnonymous.mockResolvedValue({ isAnonymous: true });
  await clearPurchasesIdentity(); expect(sdk.logOut).not.toHaveBeenCalled();
});
