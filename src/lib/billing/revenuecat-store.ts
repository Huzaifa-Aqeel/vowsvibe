import type { createServiceRoleClient } from "@/lib/supabase/server";
import type { ProSubscriptionAccess } from "@/lib/billing/revenuecat";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type RevenueCatEventMetadata = {
  eventId: string;
  eventTimestampMs: number;
  environment: string | null;
};

/**
 * The cache makes membership UI responsive to webhooks. Paid API gates deliberately
 * continue to query RevenueCat directly so a stale row can never grant paid work.
 */
export async function readCachedRevenueCatAccess(
  admin: ServiceClient,
  userId: string,
  entitlementId: string,
): Promise<ProSubscriptionAccess | null> {
  const { data, error } = await admin
    .from("revenuecat_entitlements")
    .select("active, product_identifier, period_start, period_end")
    .eq("app_user_id", userId)
    .eq("entitlement_id", entitlementId)
    .maybeSingle();
  if (error || !data) return null;

  const periodEnd = typeof data.period_end === "string" ? data.period_end : null;
  const unexpired = !periodEnd || (Number.isFinite(Date.parse(periodEnd)) && Date.parse(periodEnd) > Date.now());
  return {
    configured: true,
    active: data.active === true && unexpired,
    entitlementId,
    productIdentifier: typeof data.product_identifier === "string" ? data.product_identifier : null,
    periodStart: typeof data.period_start === "string" ? data.period_start : null,
    periodEnd,
  };
}

export async function persistRevenueCatAccess(
  admin: ServiceClient,
  userId: string,
  access: ProSubscriptionAccess,
  metadata?: RevenueCatEventMetadata,
) {
  const { error } = await admin.from("revenuecat_entitlements").upsert({
    app_user_id: userId,
    entitlement_id: access.entitlementId,
    active: access.active,
    product_identifier: access.productIdentifier,
    period_start: access.periodStart,
    period_end: access.periodEnd,
    ...(metadata ? {
      environment: metadata.environment,
      revenuecat_event_id: metadata.eventId,
      event_timestamp_ms: metadata.eventTimestampMs,
    } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: "app_user_id,entitlement_id" });
  if (error) throw new Error("Could not persist RevenueCat access.");
}

export async function recordRevenueCatWebhookEvent(
  admin: ServiceClient,
  event: { id: string; type: string; appUserId: string | null; environment: string | null; timestampMs: number },
) {
  const { error } = await admin.from("revenuecat_webhook_events").upsert({
    id: event.id,
    event_type: event.type,
    app_user_id: event.appUserId,
    environment: event.environment,
    event_timestamp_ms: event.timestampMs,
    processed_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error("Could not record RevenueCat event.");
}
