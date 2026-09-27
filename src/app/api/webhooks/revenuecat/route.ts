import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { proSubscriptionAccess } from "@/lib/billing/revenuecat";
import {
  persistRevenueCatAccess,
  recordRevenueCatWebhookEvent,
} from "@/lib/billing/revenuecat-store";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RevenueCatWebhookEvent = {
  id?: unknown;
  type?: unknown;
  app_user_id?: unknown;
  original_app_user_id?: unknown;
  aliases?: unknown;
  transferred_from?: unknown;
  transferred_to?: unknown;
  environment?: unknown;
  event_timestamp_ms?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authorized(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function appUserIds(event: RevenueCatWebhookEvent) {
  const candidates = [
    ...stringValues(event.app_user_id),
    ...stringValues(event.original_app_user_id),
    ...stringValues(event.aliases),
    ...stringValues(event.transferred_to),
    ...stringValues(event.transferred_from),
  ];
  return [...new Set(candidates.filter((candidate) => UUID.test(candidate)))].slice(0, 10);
}

export async function POST(request: Request) {
  const expectedAuthorization = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION?.trim();
  if (!expectedAuthorization) {
    return NextResponse.json({ error: "RevenueCat webhook is not configured." }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), expectedAuthorization)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as { event?: RevenueCatWebhookEvent } | null;
  const event = payload?.event;
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Invalid RevenueCat event." }, { status: 400 });
  }

  const userIds = appUserIds(event);
  const timestampMs = typeof event.event_timestamp_ms === "number" && Number.isFinite(event.event_timestamp_ms)
    ? event.event_timestamp_ms
    : Date.now();
  const environment = typeof event.environment === "string" ? event.environment : null;
  const admin = createServiceRoleClient();

  try {
    // RevenueCat recommends fetching the subscriber after each event. This makes
    // duplicate and out-of-order deliveries converge on the current entitlement.
    for (const userId of userIds) {
      const access = await proSubscriptionAccess(userId);
      await persistRevenueCatAccess(admin, userId, access, {
        eventId: event.id,
        eventTimestampMs: timestampMs,
        environment,
      });
    }
    await recordRevenueCatWebhookEvent(admin, {
      id: event.id,
      type: event.type,
      appUserId: typeof event.app_user_id === "string" ? event.app_user_id : null,
      environment,
      timestampMs,
    });
  } catch {
    // A non-2xx response asks RevenueCat to retry the idempotent event.
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 503 });
  }

  return NextResponse.json({ received: true, syncedUsers: userIds.length });
}
