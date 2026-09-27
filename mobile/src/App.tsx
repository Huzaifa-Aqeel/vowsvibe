import { lazy, Suspense } from "react";
import { Capacitor } from "@capacitor/core";
import { configureClientRuntime } from "@/lib/platform/runtime";
import { demoRequest } from "./demo/backend";
import { mobileConfig } from "./config";
import { createApiRequest } from "./platform/api";
import { createClient } from "./platform/supabase";

const DemoApp = lazy(() => import("./DemoApp").then((module) => ({ default: module.DemoApp })));
const LiveApp = lazy(() => import("./LiveApp").then((module) => ({ default: module.LiveApp })));
configureClientRuntime({ mobileMode: true, demoMode: mobileConfig.mode === "demo",
  cameraKitAllowed: mobileConfig.cameraKitEnabled,
  request: mobileConfig.mode === "demo" ? demoRequest : mobileConfig.errors.length
    ? async () => Response.json({ error: "Mobile service configuration is incomplete." }, { status: 503 })
    : createApiRequest(mobileConfig.apiBaseUrl, () => createClient().auth.getSession()),
  ...(mobileConfig.mode === "live" && Capacitor.isNativePlatform()
    ? { captureSelfie: async () => (await import("./platform/camera")).captureSelfie() } : {}),
});

export function App() {
  if (mobileConfig.errors.length) return <main className="mobile-home"><h1 className="font-serif text-3xl">Mobile setup needs attention</h1>
    <ul className="mt-4 list-disc space-y-3 pl-5 text-sm">{mobileConfig.errors.map((error) => <li key={error}>{error}</li>)}</ul>
    <p className="mt-4 text-sm text-stone-600">Correct the build configuration and restart the app.</p></main>;
  return <Suspense fallback={<main className="mobile-home" role="status">Opening Vows &amp; Vibe…</main>}>
    {mobileConfig.mode === "demo" ? <DemoApp/> : <LiveApp/>}
  </Suspense>;
}
