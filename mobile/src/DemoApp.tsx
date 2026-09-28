import { useEffect, useMemo, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ArrowLeft, Heart } from "lucide-react";
import * as fabric from "fabric";
import { LineupCanvas, type FabricNamespace } from "@/components/LineupCanvas";
import { SuggestionTools } from "@/components/SuggestionTools";
import { EventForm } from "@/components/EventForm";
import { BridalLookStudio } from "@/components/BridalLookStudio";
import { BridesmaidFlow } from "@/components/BridesmaidFlow";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { BrideLoginPanel } from "@/components/BrideLoginPanel";
import EventSummary from "@/components/EventSummary";
import { NavigationContext } from "./compat/navigation";
import { demoEvent, demoParticipants } from "./demo/data";
import { demoRequest, readDemoState, subscribeToDemoUpdates } from "./demo/backend";
import { mobileFileActions } from "./platform/files";
import { UpgradePanel } from "./UpgradePanel";
import { createNavigation } from "./platform/navigation";

window.fabric = fabric as unknown as FabricNamespace;
async function loadBundledCanvas() { return window.fabric!; }
export function DemoApp() {
  const [path, setPath] = useState(window.location.pathname);
  const [revision, setRevision] = useState(0);
  const studio = path === `/events/${demoEvent.id}/lineup`;
  const knownRoute = ["/", "/login", "/dashboard", "/events/new", `/events/${demoEvent.id}`, `/events/${demoEvent.id}/style`, `/events/${demoEvent.id}/lineup`, "/invite/demo", "/messages", "/upgrade"].includes(path);
  const navigation = useMemo(() => createNavigation(setPath, () => setRevision((v) => v + 1)), []);
  useEffect(() => { const update = () => setPath(window.location.pathname); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty("--mobile-keyboard-inset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    update();
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      const dialog = document.querySelector('.mobile-color-prompt, [role="dialog"][aria-label="Layer controls"]');
      const dismiss = dialog?.querySelector<HTMLButtonElement>('button[aria-label^="Close"]') ?? [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => button.textContent === "Cancel upload");
      if (dismiss) { dismiss.click(); return; }
      if (navigation.canGoBack()) navigation.back(); else void NativeApp.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [navigation]);
  const state = readDemoState();
  const event = state.event;
  const guestEntry = path === "/invite/demo";
  const canGoBack = !guestEntry && navigation.canGoBack();
  const button = (label: string, next: string) => <button type="button" onClick={() => navigation.push(next)} className="min-h-12 w-full rounded-full border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800">{label}</button>;

  return <NavigationContext.Provider value={navigation}><main className={`mobile-app ${studio ? "mobile-app--studio" : ""}`}>
    <header className="mobile-header">{canGoBack ? <button type="button" aria-label="Back" onClick={navigation.back} className="mobile-icon-button"><ArrowLeft size={20}/></button> : <Heart size={23} className="text-rose-800"/>}{guestEntry
      ? <div className="min-w-0 flex-1"><p className="font-serif text-xl">Vows &amp; Vibe</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-500">Your private fitting room</p></div>
      : <button type="button" aria-label="Go to home" onClick={() => navigation.push("/")} className="flex-1 text-left"><p className="font-serif text-xl">Vows & Vibe</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-500">See it. Style it. Love it.</p></button>}{path !== "/upgrade" && <span className="rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-semibold text-rose-800">Mobile preview</span>}</header>
    {path !== "/upgrade" && <div className="mobile-demo-banner">Offline demo · Local data only · AI and tone results are illustrated test fixtures.</div>}
    {path === "/" && <AuthSplitLayout eyebrow="For the bride"><BrideLoginPanel action={button("Continue as demo bride", "/dashboard")}/></AuthSplitLayout>}
    {path === "/login" && <AuthSplitLayout eyebrow="For the bride"><BrideLoginPanel action={button("Continue as demo bride", "/dashboard")}/></AuthSplitLayout>}
    {path === "/dashboard" && <section className="mobile-home"><h1 className="mb-5 font-serif text-3xl">Your events</h1><div className="mt-4 rounded-3xl border border-stone-200 bg-white p-5"><h2 className="font-serif text-2xl">{event.title}</h2><p className="my-3 text-xs text-stone-500">{event.event_date}</p>{button("Open wedding event", `/events/${event.id}`)}</div></section>}
    {path === "/events/new" && <section className="mobile-home"><h1 className="mb-5 font-serif text-3xl">Create your event</h1><EventForm mobileMode/></section>}
    {path === `/events/${demoEvent.id}/style` && <section className="mobile-flow-page"><BridalLookStudio key={revision} event={event} initialLooks={state.looks.filter((look) => look.participant_id === "demo-person-0")} brideParticipantId="demo-person-0" initialPhotoUrl={state.participants[0].original_photo_url} initialSkinToneHex={state.participants[0].skin_tone_hex}/></section>}
    {path === `/events/${demoEvent.id}` && <section className="mobile-home"><h1 className="font-serif text-3xl">{event.title}</h1><EventSummary event={event}/><div className="space-y-3">{button("Style your bridal look", `/events/${event.id}/style`)}{button("Arrange bridal party", `/events/${event.id}/lineup`)}</div></section>}
    {studio && <section className="mobile-studio-container" aria-label="Mobile compose studio"><LineupCanvas key={revision} event={event} participants={state.participants} initialPositions={state.positions} request={demoRequest} fileActions={mobileFileActions} loadCanvas={loadBundledCanvas} subscribeToUpdates={subscribeToDemoUpdates} mobileMode/><p className="mobile-studio-caption">Save stays on this device · Tap a name to select overlapping people.</p></section>}
    {path === "/invite/demo" && <section className="mobile-flow-page"><BridesmaidFlow key={revision} event={event}/></section>}
    {path === "/messages" && <section className="mobile-home"><h1 className="font-serif text-3xl">Party suggestions</h1><p className="mt-2 text-sm leading-6 text-stone-600">Choose a bridesmaid to open the local demo conversation.</p><div className="mt-8 flex justify-end"><SuggestionTools eventId={event.id} currentParticipantId={demoParticipants[0].id} participants={state.participants} request={demoRequest} subscribeToUpdates={subscribeToDemoUpdates}/></div></section>}
    {path === "/upgrade" && <UpgradePanel/>}
    {!knownRoute && <section className="mobile-not-found"><h1 className="font-serif text-3xl">This link is not connected yet</h1><p className="my-4 text-sm leading-6 text-stone-600">This build supports only the local demo event. Real wedding invites and account callbacks need the cloud integration; we won&apos;t open an unrelated demo in their place.</p>{button("Open local demo", "/")}</section>}
  </main></NavigationContext.Provider>;
}
