import { Purchases } from "@revenuecat/purchases-capacitor";

let configured = false;
let queue: Promise<unknown> = Promise.resolve();
/** Serialize SDK setup and identity changes; failed setup remains retryable. */
export function ensurePurchasesIdentity(apiKey: string, appUserId?: string) {
  const next = queue.catch(() => {}).then(async () => {
    if (!configured) {
      await Purchases.configure({ apiKey, ...(appUserId ? { appUserID: appUserId } : {}) });
      configured = true;
    }
    if (appUserId) {
      const current = await Purchases.getAppUserID();
      if (current.appUserID !== appUserId) await Purchases.logIn({ appUserID: appUserId });
    }
  });
  queue = next;
  return next;
}

export function clearPurchasesIdentity() {
  const next = queue.catch(() => {}).then(async () => {
    if (configured) {
      const { isAnonymous } = await Purchases.isAnonymous();
      if (!isAnonymous) await Purchases.logOut();
    }
  });
  queue = next;
  return next;
}
