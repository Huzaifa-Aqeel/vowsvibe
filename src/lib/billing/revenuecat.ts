export const DEFAULT_PRO_ENTITLEMENT = "vows_vibes_pro";

type Entitlement = {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  purchase_date: string;
};

type Purchase = {
  is_sandbox?: boolean;
  refunded_at?: string | null;
  purchase_date?: string;
  expires_date?: string | null;
};

export type RevenueCatSubscriber = {
  entitlements: Record<string, Entitlement>;
  subscriptions?: Record<string, Purchase>;
  non_subscriptions?: Record<string, Purchase[]>;
};

export type ProSubscriptionAccess = {
  configured: boolean;
  active: boolean;
  entitlementId: string;
  productIdentifier: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export class RevenueCatUnavailableError extends Error {
  constructor() {
    super("Membership verification is unavailable. Please try again later.");
    this.name = "RevenueCatUnavailableError";
  }
}

function validDate(value: string | null | undefined) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function purchaseForEntitlement(subscriber: RevenueCatSubscriber, entitlement: Entitlement) {
  return subscriber.subscriptions?.[entitlement.product_identifier]
    ?? subscriber.non_subscriptions?.[entitlement.product_identifier]?.at(-1);
}

export function entitlementIsActive(subscriber: RevenueCatSubscriber, id: string, allowSandbox: boolean, now = Date.now()) {
  const entitlement = subscriber.entitlements?.[id];
  if (!entitlement || !entitlement.product_identifier || !validDate(entitlement.purchase_date)) return false;
  const purchase = purchaseForEntitlement(subscriber, entitlement);
  if (purchase?.refunded_at || (!allowSandbox && purchase?.is_sandbox)) return false;
  if (entitlement.expires_date === null) return true;
  return Date.parse(entitlement.expires_date) > now
    || (validDate(entitlement.grace_period_expires_date) && Date.parse(entitlement.grace_period_expires_date!) > now);
}

export function subscriptionAccessFromSubscriber(
  subscriber: RevenueCatSubscriber,
  entitlementId: string,
  allowSandbox: boolean,
  now = Date.now(),
): ProSubscriptionAccess {
  const entitlement = subscriber.entitlements?.[entitlementId];
  const active = entitlementIsActive(subscriber, entitlementId, allowSandbox, now);
  if (!entitlement || !active) {
    return { configured: true, active: false, entitlementId, productIdentifier: null, periodStart: null, periodEnd: null };
  }
  const purchase = purchaseForEntitlement(subscriber, entitlement);
  const periodStart = validDate(purchase?.purchase_date) ? purchase!.purchase_date! : entitlement.purchase_date;
  const candidateEnd = purchase?.expires_date ?? entitlement.expires_date ?? entitlement.grace_period_expires_date ?? null;
  return {
    configured: true,
    active: true,
    entitlementId,
    productIdentifier: entitlement.product_identifier,
    periodStart,
    periodEnd: validDate(candidateEnd) ? candidateEnd : null,
  };
}

/** Server-authoritative Pro status. The App User ID is always the verified Supabase bride UUID. */
export async function proSubscriptionAccess(userId: string): Promise<ProSubscriptionAccess> {
  const entitlementId = process.env.REVENUECAT_PRO_ENTITLEMENT?.trim()
    || process.env.REVENUECAT_GROUP_PREVIEW_ENTITLEMENT?.trim()
    || DEFAULT_PRO_ENTITLEMENT;
  const key = process.env.REVENUECAT_SECRET_API_KEY?.trim();
  if (!key) {
    return { configured: false, active: false, entitlementId, productIdentifier: null, periodStart: null, periodEnd: null };
  }
  let response: Response;
  try {
    response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RevenueCatUnavailableError();
  }
  if (!response.ok) throw new RevenueCatUnavailableError();
  const data = await response.json().catch(() => null) as { subscriber?: RevenueCatSubscriber } | null;
  if (!data?.subscriber?.entitlements) throw new RevenueCatUnavailableError();
  return subscriptionAccessFromSubscriber(
    data.subscriber,
    entitlementId,
    process.env.REVENUECAT_ALLOW_SANDBOX === "true",
  );
}

/** Compatibility wrapper retained for the group-preview route. */
export async function groupPreviewAccess(userId: string) {
  const access = await proSubscriptionAccess(userId);
  return { ...access, requiresMembership: true, entitled: access.active };
}
