import { useEffect, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Crown, Loader2 } from "lucide-react";
import { clientFetch } from "@/lib/platform/runtime";
import { readApiJson } from "./platform/api";

type BillingStatus = {
  active: boolean;
};

export function ProStatusCard({ open }: { open: () => void }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void clientFetch("/api/mobile/billing", { cache: "no-store", signal: controller.signal })
      .then(readApiJson<BillingStatus>)
      .then((value) => { if (!controller.signal.aborted) setStatus(value); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("appStateChange", ({ isActive }) => { if (isActive) setRevision((value) => value + 1); });
    return () => { void listener.then((handle) => handle.remove()); };
  }, []);

  return <section className="mt-4 rounded-3xl border border-rose-200/70 bg-gradient-to-br from-white to-rose-50 p-5 shadow-sm">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-800"><Crown size={18}/></span>
      <div className="min-w-0 flex-1">
        <p className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.18em] ${status?.active ? "bg-rose-800 text-white" : "bg-rose-100 text-rose-800"}`}>
          {status?.active ? "Pro active" : error ? "Status unavailable" : "Bride membership"}
        </p>
        <h2 className="mt-1 font-serif text-xl">Vows &amp; Vibe Pro Wedding Pass</h2>
        {!status && !error && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-stone-500"><Loader2 size={13} className="animate-spin"/>Checking membership…</p>}
      </div>
    </div>
    <button type="button" onClick={open} className="mt-4 min-h-11 w-full rounded-full bg-stone-900 px-4 text-sm font-semibold text-white">
      {status?.active ? "View pass details" : "See Wedding Pass"}
    </button>
  </section>;
}
