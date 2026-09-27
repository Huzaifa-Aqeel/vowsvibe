import { afterEach, describe, expect, it, vi } from "vitest";
import {
  entitlementIsActive,
  groupPreviewAccess,
  proSubscriptionAccess,
  revenueCatAllowsSandbox,
  subscriptionAccessFromSubscriber,
  type RevenueCatSubscriber,
} from "../../../src/lib/billing/revenuecat";
import {
  FREE_BRIDE_VTO_LIMIT,
  participantAiPlan,
  PRO_PARTICIPANT_VTO_LIMIT,
} from "../../../src/lib/billing/plan";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const now = Date.parse("2026-09-16T00:00:00Z");

function subscriber(expires: string | null): RevenueCatSubscriber {
  return {
    entitlements: {
      vows_vibes_pro: {
        expires_date: expires,
        product_identifier: "vows_vibes_pro_monthly",
        purchase_date: "2026-09-01T00:00:00Z",
      },
    },
    subscriptions: {
      vows_vibes_pro_monthly: {
        is_sandbox: false,
        purchase_date: "2026-09-01T00:00:00Z",
        expires_date: expires,
      },
    },
  };
}

function admin(ownerId = "owner-a") {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { owner_id: ownerId }, error: null }),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return { from: vi.fn(() => builder) } as unknown as Parameters<typeof participantAiPlan>[0];
}

describe("server membership verification", () => {
  it("accepts Test Store purchases by default until a production deployment explicitly disables them", () => {
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "");
    expect(revenueCatAllowsSandbox()).toBe(true);
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "true");
    expect(revenueCatAllowsSandbox()).toBe(true);
    vi.stubEnv("REVENUECAT_ALLOW_SANDBOX", "false");
    expect(revenueCatAllowsSandbox()).toBe(false);
  });

  it("recognizes active, expired, missing, lifetime, and grace-period entitlements", () => {
    expect(entitlementIsActive(subscriber("2026-10-01T00:00:00Z"), "vows_vibes_pro", false, now)).toBe(true);
    expect(entitlementIsActive(subscriber("2026-09-01T00:00:00Z"), "vows_vibes_pro", false, now)).toBe(false);
    expect(entitlementIsActive(subscriber(null), "vows_vibes_pro", false, now)).toBe(true);
    expect(entitlementIsActive(subscriber(null), "other", false, now)).toBe(false);
    const grace = subscriber("2026-09-15T00:00:00Z");
    grace.entitlements.vows_vibes_pro.grace_period_expires_date = "2026-09-18T00:00:00Z";
    expect(entitlementIsActive(grace, "vows_vibes_pro", false, now)).toBe(true);
  });

  it("rejects refunds, invalid dates and sandbox access unless explicitly enabled", () => {
    const test = subscriber(null);
    test.subscriptions!.vows_vibes_pro_monthly.is_sandbox = true;
    expect(entitlementIsActive(test, "vows_vibes_pro", false, now)).toBe(false);
    expect(entitlementIsActive(test, "vows_vibes_pro", true, now)).toBe(true);
    test.subscriptions!.vows_vibes_pro_monthly.refunded_at = "2026-09-10T00:00:00Z";
    expect(entitlementIsActive(test, "vows_vibes_pro", true, now)).toBe(false);
    expect(entitlementIsActive(subscriber("broken-date"), "vows_vibes_pro", false, now)).toBe(false);
  });

  it("recognizes only allowlisted one-time Wedding Pass products when an entitlement mapping is missing", () => {
    const purchaseOnly: RevenueCatSubscriber = {
      entitlements: {},
      non_subscriptions: {
        vows_vibes_pro_lifetime: [{ is_sandbox: true, purchase_date: "2026-09-15T00:00:00Z" }],
      },
    };
    expect(subscriptionAccessFromSubscriber(
      purchaseOnly, "vows_vibes_pro", true, now, ["vows_vibes_pro_lifetime"],
    )).toMatchObject({ active: true, productIdentifier: "vows_vibes_pro_lifetime", periodEnd: null });
    expect(subscriptionAccessFromSubscriber(
      purchaseOnly, "vows_vibes_pro", false, now, ["vows_vibes_pro_lifetime"],
    ).active).toBe(false);
    expect(subscriptionAccessFromSubscriber(
      purchaseOnly, "vows_vibes_pro", true, now, ["another_product"],
    ).active).toBe(false);
  });

  it("uses the latest verified renewal as the VTO quota period", () => {
    expect(subscriptionAccessFromSubscriber(subscriber("2026-10-01T00:00:00Z"), "vows_vibes_pro", false, now)).toMatchObject({
      active: true,
      periodStart: "2026-09-01T00:00:00Z",
      periodEnd: "2026-10-01T00:00:00Z",
      productIdentifier: "vows_vibes_pro_monthly",
    });
  });

  it("keeps the free bride plan available before RevenueCat is configured", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    expect(await proSubscriptionAccess("owner")).toMatchObject({ configured: false, active: false, entitlementId: "vows_vibes_pro" });
    const bride = await participantAiPlan(admin(), { id: "bride-a", event_id: "event-a", role: "bride" });
    const guest = await participantAiPlan(admin(), { id: "guest-a", event_id: "event-a", role: "bridesmaid" });
    expect(bride).toMatchObject({ tier: "free", vtoLimit: FREE_BRIDE_VTO_LIMIT, skinAnalysisAllowed: true });
    expect(guest).toMatchObject({ tier: "locked", vtoLimit: 0, skinAnalysisAllowed: false });
  });

  it("verifies Pro against the bride UUID and grants each participant eight attempts", async () => {
    vi.stubEnv("REVENUECAT_PRO_ENTITLEMENT", "vows_vibes_pro");
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "server-only-test-key");
    const network = vi.fn().mockImplementation(async () => Response.json({ subscriber: subscriber("2026-10-01T00:00:00Z") }));
    vi.stubGlobal("fetch", network);
    const plan = await participantAiPlan(admin("owner/id"), { id: "guest-a", event_id: "event-a", role: "bridesmaid" });
    expect(plan).toMatchObject({ tier: "pro", vtoLimit: PRO_PARTICIPANT_VTO_LIMIT, periodStart: "2026-09-01T00:00:00Z" });
    expect(network.mock.calls[0][0]).toBe("https://api.revenuecat.com/v1/subscribers/owner%2Fid");
    expect(network.mock.calls[0][1].headers.Authorization).toBe("Bearer server-only-test-key");
    expect((await groupPreviewAccess("owner/id")).entitled).toBe(true);
  });

  it("fails closed when configured membership verification is unavailable", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "server-only-test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("offline", { status: 503 })));
    await expect(proSubscriptionAccess("owner")).rejects.toThrow("unavailable");
  });
});
