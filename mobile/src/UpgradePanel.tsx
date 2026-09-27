import { useEffect, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Purchases, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { mobileConfig } from "./config";
import { ensurePurchasesIdentity } from "./platform/purchases";

export function UpgradePanel({ appUserId }: { appUserId?: string } = {}) {
  const testStore = mobileConfig.revenueCatKey.startsWith("test_");
  const configured = Capacitor.isNativePlatform() && !!mobileConfig.revenueCatKey;
  const initialMessage = mobileConfig.mode === "demo"
    ? "No RevenueCat Test Store is configured. There are no active purchases or charges in this build."
    : !mobileConfig.revenueCatKey ? "Pro purchases are not configured in this build yet. The free bride plan remains available."
    : !Capacitor.isNativePlatform() ? "Open the Android app to buy the Wedding Pass." : "Loading the Wedding Pass purchase…";
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [transaction, setTransaction] = useState(false);
  const entitled = !!info?.entitlements.active[mobileConfig.revenueCatEntitlement];
  useEffect(() => {
    if (!configured) return;
    let cancelled = false; let listenerId: string | undefined;
    setBusy(true); setFailed(false);
    void (async () => {
      await ensurePurchasesIdentity(mobileConfig.revenueCatKey, appUserId);
      const callbackId = await Purchases.addCustomerInfoUpdateListener((next) => { if (!cancelled) setInfo(next); });
      if (cancelled) { await Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: callbackId }); return; }
      listenerId = callbackId;
      const [offerings, customer] = await Promise.all([Purchases.getOfferings(), Purchases.getCustomerInfo()]);
      if (cancelled) return;
      const offering = mobileConfig.revenueCatOffering ? offerings.all[mobileConfig.revenueCatOffering] : offerings.current;
      setPackages(offering?.availablePackages ?? []); setInfo(customer.customerInfo);
      setMessage(offering?.availablePackages.length ? (testStore ? "Test purchase only. No real charge will be made." : "Google Play will show the exact one-time price before you buy.") : "The Wedding Pass purchase is not available right now.");
    })().catch((error) => { if (!cancelled) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not load the Wedding Pass. Please try again."); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; if (listenerId) void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId }); };
  }, [configured, appUserId, retry, testStore]);
  useEffect(() => {
    if (!configured) return;
    const refresh = () => { void Purchases.getCustomerInfo().then(({ customerInfo }) => setInfo(customerInfo)).catch(() => {}); };
    const listener = NativeApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [configured]);
  async function transact(aPackage: PurchasesPackage) {
    if (transaction || busy) return;
    setTransaction(true); setFailed(false);
    try {
      await ensurePurchasesIdentity(mobileConfig.revenueCatKey, appUserId);
      const result = await Purchases.purchasePackage({ aPackage });
      setInfo(result.customerInfo);
      setMessage(result.customerInfo.entitlements.active[mobileConfig.revenueCatEntitlement]
        ? (testStore ? "Your test Wedding Pass is active." : "Your Wedding Pass is active.")
        : "The transaction completed. Your Pro access is still pending; refresh in a moment.");
    } catch (error) {
      const sdkError = error as { userCancelled?: boolean; code?: unknown; message?: string };
      const cancelled = sdkError.userCancelled || String(sdkError.code) === String(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
      setMessage(cancelled ? "Purchase cancelled. You can try again whenever you're ready." : sdkError.message ?? "Could not complete the transaction. Please try again.");
      setFailed(!cancelled);
    } finally { setTransaction(false); }
  }
  return <section className="mobile-home"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-rose-800">{testStore || mobileConfig.mode === "demo" ? "Bride test purchase" : "Bride wedding pass"}</p>
    <h1 className="mt-3 font-serif text-3xl">Vows &amp; Vibe Pro — One-Time Wedding Pass</h1>
    <p className="mt-3 text-sm leading-6 text-stone-600">The bride pays once to unlock Pro for one wedding and her invited party. Every bridesmaid using a valid invite shares the pass—no bridesmaid purchase is required.</p>
    <div className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 text-sm text-stone-700"><p className="font-semibold text-stone-900">The Wedding Pass includes</p><ul className="mt-3 space-y-2 pl-5 leading-5"><li className="list-disc">One wedding for the bride and her invited party</li><li className="list-disc">Eight total successful AI try-ons per participant</li><li className="list-disc">One saved skin-tone analysis per participant</li><li className="list-disc">Group previews, collaboration and exports</li></ul><p className="mt-3 text-xs leading-5 text-stone-500">AI allowances do not reset. Additional credit packs are not currently available.</p></div>
    <p role="status" className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600">{message}</p>
    {info && <p className="mt-4 text-sm font-semibold text-rose-800">{entitled ? "Wedding Pass active" : "No Wedding Pass purchase found"}</p>}
    <div className="mt-5 space-y-3">{packages.map((aPackage) => <button key={aPackage.identifier} type="button" disabled={busy || transaction || entitled} onClick={() => void transact(aPackage)} className="min-h-12 w-full rounded-full bg-stone-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
      {testStore ? "Test Wedding Pass" : "Buy Wedding Pass"} · {aPackage.product.priceString}</button>)}</div>
    {configured && <button type="button" disabled={busy || transaction} onClick={() => setRetry((value) => value + 1)} className="mt-3 min-h-11 w-full text-sm">{failed ? "Try again" : "Refresh access"}</button>}
  </section>;
}
