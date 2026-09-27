import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  admin: vi.fn(),
  access: vi.fn(),
  persist: vi.fn(),
  record: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: mock.admin }));
vi.mock("@/lib/billing/revenuecat", () => ({ proSubscriptionAccess: mock.access }));
vi.mock("@/lib/billing/revenuecat-store", () => ({
  persistRevenueCatAccess: mock.persist,
  recordRevenueCatWebhookEvent: mock.record,
}));

import { POST } from "../../../src/app/api/webhooks/revenuecat/route";

const brideId = "6f2275ad-3f52-42b3-8e7a-973a491c4624";

function webhook(authorization: string, event: Record<string, unknown>) {
  return new Request("https://vowsvibe.test/api/webhooks/revenuecat", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("REVENUECAT_WEBHOOK_AUTHORIZATION", "Bearer webhook-secret");
  mock.admin.mockReturnValue({ server: true });
  mock.access.mockResolvedValue({
    configured: true,
    active: true,
    entitlementId: "vows_vibes_pro",
    productIdentifier: "vows_vibes_pro_wedding_pass",
    periodStart: "2026-09-27T12:00:00Z",
    periodEnd: null,
  });
  mock.persist.mockResolvedValue(undefined);
  mock.record.mockResolvedValue(undefined);
});

describe("RevenueCat webhook", () => {
  it("rejects an incorrect Authorization header before doing any work", async () => {
    const response = await POST(webhook("Bearer wrong", { id: "event-1", type: "INITIAL_PURCHASE" }));
    expect(response.status).toBe(401);
    expect(mock.admin).not.toHaveBeenCalled();
    expect(mock.access).not.toHaveBeenCalled();
  });

  it("resolves the signed-in bride UUID from aliases and stores canonical access", async () => {
    const response = await POST(webhook("Bearer webhook-secret", {
      id: "event-2",
      type: "INITIAL_PURCHASE",
      app_user_id: "$RCAnonymousID:test-customer",
      original_app_user_id: "$RCAnonymousID:test-customer",
      aliases: ["$RCAnonymousID:test-customer", brideId],
      environment: "SANDBOX",
      event_timestamp_ms: 1_798_000_000_000,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, syncedUsers: 1 });
    expect(mock.access).toHaveBeenCalledWith(brideId);
    expect(mock.persist).toHaveBeenCalledWith(
      { server: true },
      brideId,
      expect.objectContaining({ active: true, entitlementId: "vows_vibes_pro" }),
      { eventId: "event-2", eventTimestampMs: 1_798_000_000_000, environment: "SANDBOX" },
    );
    expect(mock.record).toHaveBeenCalledWith(
      { server: true },
      expect.objectContaining({ id: "event-2", type: "INITIAL_PURCHASE" }),
    );
  });

  it("returns a retryable response if reconciliation cannot be persisted", async () => {
    mock.persist.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(webhook("Bearer webhook-secret", {
      id: "event-3",
      type: "TRANSFER",
      transferred_to: [brideId],
    }));
    expect(response.status).toBe(503);
    expect(mock.record).not.toHaveBeenCalled();
  });
});
