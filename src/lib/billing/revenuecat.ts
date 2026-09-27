export const DEFAULT_PRO_ENTITLEMENT = "vows_vibes_pro";
export const DEFAULT_PRO_PRODUCT_IDS = ["vows_vibes_pro_lifetime", "vows_vibes_pro_wedding_pass"];

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

export function revenueCatEntitlementId() {
  return process.env.REVENUECAT_PRO_ENTITLEMENT?.trim()
    || process.env.REVENUECAT_GROUP_PREVIEW_ENTITLEMENT?.trim()
    || DEFAULT_PRO_ENTITLEMENT;
}

export function revenueCatProProductIds() {
  const configured = process.env.REVENUECAT_PRO_PRODUCT_IDS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_PRO_PRODUCT_IDS;
}

export function revenueCatAllowsSandbox() {
  // This app currently ships against RevenueCat Test Store. Keep test purchases usable
  // when the deployment omitted the flag; a future store release can explicitly set false.
  return process.env.REVENUECAT_ALLOW_SANDBOX?.trim().toLowerCase() !== "false";
}

function validDate(value: string | null | undefined) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function purchaseForEntitlement(subscriber: RevenueCatSubscriber, entitlement: Entitlement) {
  return subscriber.subscriptions?.[entitlement.product_identifier]
    ?? subscriber.non_subscriptions?.[entitlement.product_identifier]?.at(-1);
}

function purchaseIsActive(purchase: Purchase, allowSandbox: boolean, now: number) {
  if (!validDate(purchase.purchase_date) || purchase.refunded_at || (!allowSandbox && purchase.is_sandbox)) return false;
  if (purchase.expires_date == null) return true;
  return validDate(purchase.expires_date) && Date.parse(purchase.expires_date) > now;
}

function activeConfiguredProduct(
  subscriber: RevenueCatSubscriber,
  productIds: string[],
  allowSandbox: boolean,
  now: number,
) {
  return productIds.flatMap((productIdentifier) => [
    ...(subscriber.non_subscriptions?.[productIdentifier] ?? []).map((purchase) => ({ productIdentifier, purchase })),
    ...(subscriber.subscriptions?.[productIdentifier]
      ? [{ productIdentifier, purchase: subscriber.subscriptions[productIdentifier] }]
      : []),
  ])
    .filter(({ purchase }) => purchaseIsActive(purchase, allowSandbox, now))
    .sort((a, b) => Date.parse(b.purchase.purchase_date!) - Date.parse(a.purchase.purchase_date!))[0] ?? null;
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
  productIds: string[] = [],
): ProSubscriptionAccess {
  const entitlement = subscriber.entitlements?.[entitlementId];
  const active = entitlementIsActive(subscriber, entitlementId, allowSandbox, now);
  if (!entitlement || !active) {
    // A strict allowlist keeps the intended Wedding Pass usable if RevenueCat's
    // product-to-entitlement attachment is delayed or accidentally removed.
    const configuredProduct = activeConfiguredProduct(subscriber, productIds, allowSandbox, now);
    return configuredProduct ? {
      configured: true,
      active: true,
      entitlementId,
      productIdentifier: configuredProduct.productIdentifier,
      periodStart: configuredProduct.purchase.purchase_date!,
      periodEnd: validDate(configuredProduct.purchase.expires_date) ? configuredProduct.purchase.expires_date! : null,
    } : { configured: true, active: false, entitlementId, productIdentifier: null, periodStart: null, periodEnd: null };
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
  const entitlementId = revenueCatEntitlementId();
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
    revenueCatAllowsSandbox(),
    Date.now(),
    revenueCatProProductIds(),
  );
}

/** Compatibility wrapper retained for the group-preview route. */
export async function groupPreviewAccess(userId: string) {
  const access = await proSubscriptionAccess(userId);
  return { ...access, requiresMembership: true, entitled: access.active };
}
