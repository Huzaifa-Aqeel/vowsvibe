import { useEffect, useState, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  Check,
  Camera,
  Crown,
  HeartHandshake,
  Images,
  Loader2,
  Palette,
  Shirt,
  Users,
} from "lucide-react";
import { Purchases, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { clientFetch } from "@/lib/platform/runtime";
import { mobileConfig } from "./config";
import { readApiJson } from "./platform/api";
import { ensurePurchasesIdentity } from "./platform/purchases";

type PlanKey = "free" | "pro";
type Feature = { icon: ReactNode; text: string };
type BillingStatus = { active: boolean };

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function backendHasPro(signal?: AbortSignal) {
  const response = await clientFetch("/api/mobile/billing", { cache: "no-store", signal });
  return (await readApiJson<BillingStatus>(response)).active;
}

const freeFeatures: Feature[] = [
  { icon: <Palette size={17}/>, text: "One wedding and two dress uploads" },
  { icon: <Shirt size={17}/>, text: "Two successful AI try-ons for the bride" },
  { icon: <Camera size={17}/>, text: "One saved skin-tone analysis for the bride" },
  { icon: <Images size={17}/>, text: "A private bridal lookbook" },
];

const proFeatures: Feature[] = [
  { icon: <Users size={17}/>, text: "The bride and every invited bridesmaid" },
  { icon: <Shirt size={17}/>, text: "Eight successful AI try-ons per participant" },
  { icon: <Palette size={17}/>, text: "Unlimited dress uploads and one skin-tone analysis each" },
  { icon: <Images size={17}/>, text: "Group previews, lineup exports and saved arrangements" },
  { icon: <HeartHandshake size={17}/>, text: "Party suggestions and shared collaboration" },
];

function FeatureList({ title, features }: { title: string; features: Feature[] }) {
  return <div className="mt-8"><p className="text-sm font-semibold text-white">{title}</p>
    <ul className="mt-4 space-y-4">{features.map((feature) => <li key={feature.text} className="flex items-start gap-3 text-sm leading-5 text-stone-200">
      <span className="mt-0.5 text-rose-300">{feature.icon}</span><span>{feature.text}</span>
    </li>)}</ul>
  </div>;
}

export function UpgradePanel({ appUserId }: { appUserId?: string } = {}) {
  const configured = Capacitor.isNativePlatform() && !!mobileConfig.revenueCatKey;
  const [selected, setSelected] = useState<PlanKey>("pro");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [info, setInfo] = useState<CustomerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [transaction, setTransaction] = useState(false);
  const [backendEntitled, setBackendEntitled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const entitled = backendEntitled || !!info?.entitlements.active[mobileConfig.revenueCatEntitlement];
  const price = packages[0]?.product.priceString;

  useEffect(() => {
    if (!configured) return;
    let cancelled = false; let listenerId: string | undefined;
    setBusy(true);
    void (async () => {
      await ensurePurchasesIdentity(mobileConfig.revenueCatKey, appUserId);
      const callbackId = await Purchases.addCustomerInfoUpdateListener((next) => {
        if (!cancelled) {
          setInfo(next);
          if (next.entitlements.active[mobileConfig.revenueCatEntitlement]) setNotice(null);
        }
      });
      if (cancelled) { await Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: callbackId }); return; }
      listenerId = callbackId;
      const [offerings, customer] = await Promise.all([Purchases.getOfferings(), Purchases.getCustomerInfo()]);
      if (cancelled) return;
      const offering = mobileConfig.revenueCatOffering ? offerings.all[mobileConfig.revenueCatOffering] : offerings.current;
      setPackages(offering?.availablePackages ?? []); setInfo(customer.customerInfo);
    })().catch(() => { if (!cancelled) setNotice("Wedding Pass purchasing is temporarily unavailable."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; if (listenerId) void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId }); };
  }, [configured, appUserId]);

  useEffect(() => {
    if (!appUserId) return;
    const controller = new AbortController();
    void backendHasPro(controller.signal)
      .then((active) => { if (!controller.signal.aborted) { setBackendEntitled(active); if (active) setNotice(null); } })
      .catch(() => {});
    return () => controller.abort();
  }, [appUserId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const refresh = () => {
      if (configured) void Purchases.getCustomerInfo().then(({ customerInfo }) => setInfo(customerInfo)).catch(() => {});
      if (appUserId) void backendHasPro().then((active) => { setBackendEntitled(active); if (active) setNotice(null); }).catch(() => {});
    };
    const listener = NativeApp.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [configured, appUserId]);

  useEffect(() => { if (entitled) setSelected("pro"); }, [entitled]);

  async function transact(aPackage: PurchasesPackage) {
    if (transaction || busy) return;
    setTransaction(true); setNotice(null);
    try {
      await ensurePurchasesIdentity(mobileConfig.revenueCatKey, appUserId);
      const result = await Purchases.purchasePackage({ aPackage });
      setInfo(result.customerInfo);
      if (result.customerInfo.entitlements.active[mobileConfig.revenueCatEntitlement]) return;

      setNotice("Activating your Wedding Pass…");
      let active = false;
      if (appUserId) {
        for (let attempt = 0; attempt < 8 && !active; attempt += 1) {
          try { active = await backendHasPro(); } catch { /* Retry while the webhook settles. */ }
          if (!active && attempt < 7) await pause(1_500);
        }
      }
      setBackendEntitled(active);
      setNotice(active ? null : "Purchase received. Your Wedding Pass is still syncing and will appear shortly.");
    } catch (error) {
      const sdkError = error as { userCancelled?: boolean; code?: unknown; message?: string };
      const cancelled = sdkError.userCancelled || String(sdkError.code) === String(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
      setNotice(cancelled ? "Purchase cancelled." : "We couldn't complete the purchase. Please try again.");
    } finally { setTransaction(false); }
  }

  return <section className="mobile-home pb-10">
    <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[.24em] text-rose-800">Plans for one unforgettable wedding</p>
      <h1 className="mt-3 font-serif text-3xl text-stone-950">Vows &amp; Vibe Pro — One-Time Wedding Pass</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-600">Start free for the bride, or unlock the fitting room for the whole bridal party with one payment.</p>
    </div>

    <div role="group" aria-label="Choose a plan" className="mx-auto mt-6 grid max-w-sm grid-cols-2 rounded-full border border-stone-200 bg-white p-1.5 shadow-sm">
      {(["free", "pro"] as const).map((plan) => {
        const active = selected === plan;
        const current = plan === (entitled ? "pro" : "free");
        return <button key={plan} type="button" aria-pressed={active} onClick={() => setSelected(plan)} className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition ${active ? "bg-stone-950 text-white shadow-md" : "text-stone-600"}`}>
          {plan === "pro" && <Crown size={15}/>}<span>{plan === "free" ? "Free" : "Pro"}</span>{current && <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-rose-300" : "bg-rose-700"}`} aria-label="Current plan"/>}
        </button>;
      })}
    </div>

    <article className="relative mt-5 overflow-hidden rounded-[2rem] bg-stone-950 px-6 py-7 text-white shadow-[0_24px_60px_-28px_rgba(67,35,45,.75)]">
      <div aria-hidden="true" className={`absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl ${selected === "pro" ? "bg-rose-500/30" : "bg-stone-500/20"}`}/>
      <div aria-hidden="true" className="absolute -bottom-24 -left-20 h-48 w-48 rounded-full bg-amber-200/10 blur-3xl"/>
      <div className="relative">
        <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{selected === "free" ? "Free" : "Wedding Pass"}</p>
          {(selected === (entitled ? "pro" : "free") || selected === "pro") && <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${selected === (entitled ? "pro" : "free") ? "bg-white/10 text-rose-100" : "bg-rose-200 text-rose-950"}`}>
            {selected === (entitled ? "pro" : "free") ? "Current plan" : "Best for parties"}
          </span>}
        </div>

        <h2 className="mt-8 font-serif text-3xl">{selected === "free" ? "Style your own bridal look" : "Bring the whole party in"}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-300">{selected === "free"
          ? "A focused starting point for the bride to create one wedding and try the core styling tools."
          : "One bride purchase unlocks Pro for every bridesmaid who joins through that wedding's private invite."}</p>

        <div className="mt-6 flex items-end gap-2"><span className="font-serif text-5xl leading-none">{selected === "free" ? "0" : price ?? "One-time"}</span>
          <span className="pb-1 text-sm text-stone-400">{selected === "free" ? "forever" : price ? "for this wedding" : "Wedding Pass"}</span>
        </div>

        {selected === "free" ? <button type="button" disabled className="mt-7 min-h-12 w-full rounded-full border border-white/15 bg-white/5 px-4 text-sm font-semibold text-stone-400">
          {entitled ? "Free plan included" : "Your current plan"}
        </button> : <div className="mt-7 space-y-3">
          {packages.map((aPackage) => <button key={aPackage.identifier} type="button" disabled={busy || transaction || entitled} onClick={() => void transact(aPackage)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-200 px-4 py-3 text-sm font-bold text-rose-950 shadow-lg shadow-rose-950/20 disabled:opacity-50">
            {transaction ? <Loader2 size={16} className="animate-spin"/> : entitled ? <Check size={16}/> : <Crown size={16}/>}
            {entitled ? "Wedding Pass active" : transaction ? "Activating Wedding Pass…" : `Get the Wedding Pass · ${aPackage.product.priceString}`}
          </button>)}
          {!packages.length && <button type="button" disabled className="min-h-12 w-full rounded-full bg-white/10 px-4 text-sm font-semibold text-stone-400">{busy ? "Loading Wedding Pass…" : entitled ? "Wedding Pass active" : "Purchase unavailable"}</button>}
          {notice && <p role="status" className="px-2 text-center text-xs leading-5 text-stone-300">{notice}</p>}
        </div>}

        <FeatureList title={selected === "free" ? "Start with the essentials:" : "Everything your party needs:"} features={selected === "free" ? freeFeatures : proFeatures}/>
        <p className="mt-7 border-t border-white/10 pt-4 text-xs leading-5 text-stone-400">{selected === "free"
          ? "Bridesmaid AI tools, collaboration and group previews unlock with Pro."
          : "AI try-on allowances are total per participant and do not reset. Additional credit packs are not currently available."}</p>
      </div>
    </article>
  </section>;
}
