import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { ArrowLeft, Heart, Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { clientFetch } from "@/lib/platform/runtime";
import type { BridalLookView, EventRow, LineupPosition, ParticipantRow } from "@/lib/types";
import type { FabricNamespace } from "@/components/LineupCanvas";
import { EventForm } from "@/components/EventForm";
import { BridalLookStudio } from "@/components/BridalLookStudio";
import { BridesmaidFlow } from "@/components/BridesmaidFlow";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { BrideLoginPanel } from "@/components/BrideLoginPanel";
import { SuggestionTools } from "@/components/SuggestionTools";
import EventSummary from "@/components/EventSummary";
import { NavigationContext } from "./compat/navigation";
import { mobileConfig } from "./config";
import { createClient } from "./platform/supabase";
import { readApiJson } from "./platform/api";
import { completeOAuth, listenForAppLinks, safeReturnPath, signInWithGoogle } from "./platform/auth";
import { mobileFileActions } from "./platform/files";
import { useMobileNavigation } from "./useMobileNavigation";
import { UpgradePanel } from "./UpgradePanel";
import { clearPurchasesIdentity } from "./platform/purchases";
import { ProStatusCard } from "./ProStatusCard";
import { DeleteEventButton } from "@/components/DeleteEventButton";

const LineupCanvas = lazy(() => import("@/components/LineupCanvas").then((module) => ({ default: module.LineupCanvas })));
async function loadBundledCanvas(): Promise<FabricNamespace> {
  window.fabric ??= await import("fabric") as unknown as FabricNamespace;
  return window.fabric;
}

function Loading() { return <p role="status" className="flex items-center justify-center gap-2 p-6 text-sm text-stone-600"><Loader2 size={18} className="animate-spin"/>Loading your wedding…</p>; }
function Action({ children, onClick, disabled = false }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-12 w-full rounded-full border border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-800 disabled:opacity-50">{children}</button>;
}

function useRemote<T>(url: string, revision: number): { value?: T; error?: string } {
  const [result, setResult] = useState<{ url: string; revision: number; value?: T; error?: string }>({ url: "", revision: -1 });
  useEffect(() => {
    const controller = new AbortController();
    void clientFetch(url, { signal: controller.signal, cache: "no-store" }).then(readApiJson<T>)
      .then((value) => { if (!controller.signal.aborted) setResult({ url, revision, value }); })
      .catch((error) => { if (!controller.signal.aborted) setResult((previous) => ({ ...previous, url, revision, error: error instanceof Error ? error.message : "Could not load this screen." })); });
    return () => controller.abort();
  }, [url, revision]);
  return result.url === url ? result : {};
}

function ResourceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="mobile-home"><p role="alert" className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm text-rose-900">{message}</p><Action onClick={retry}>Try again</Action></div>;
}

function Login({ returnPath }: { returnPath: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true); setError(null);
    try { await signInWithGoogle(returnPath); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not sign in. Please try again."); }
    finally { setBusy(false); }
  }
  return <AuthSplitLayout eyebrow="For the bride"><BrideLoginPanel action={<>{error && <p role="alert" className="mb-4 text-sm text-rose-800">{error}</p>}<Action disabled={busy} onClick={() => void start()}>{busy ? "Opening Google…" : "Continue with Google"}</Action></>}/></AuthSplitLayout>;
}

function Dashboard({ revision, navigate, retry }: { revision: number; navigate: (path: string) => void; retry: () => void }) {
  const result = useRemote<{ events: EventRow[] }>("/api/events", revision);
  if (result.error) return <ResourceError message={result.error} retry={retry}/>;
  if (!result.value) return <Loading/>;
  return <section className="mobile-home"><h1 className="mb-5 font-serif text-3xl">Your events</h1>{!result.value.events.length && <Action onClick={() => navigate("/events/new")}>Create an event</Action>}<ProStatusCard open={() => navigate("/upgrade")}/>
    {!result.value.events.length && <p className="mt-5 text-sm text-stone-600">Start your first wedding event to set the palette and invite your party.</p>}
    {result.value.events.map((event) => <article key={event.id} className="relative mt-4 rounded-3xl border border-stone-200 bg-white p-5 pr-14"><div className="absolute right-3 top-3"><DeleteEventButton eventId={event.id} eventTitle={event.title} variant="icon" stayOnPage /></div><h2 className="font-serif text-2xl">{event.title}</h2>
      <p className="my-3 text-xs text-stone-500">{event.event_date ?? "Date to be decided"}</p><Action onClick={() => navigate(`/events/${event.id}`)}>Open {event.title}</Action></article>)}</section>;
}

type EventBundle = { event: EventRow; bride: ParticipantRow; looks: BridalLookView[] };
type LineupBundle = { participants: ParticipantRow[]; positions: Record<string, LineupPosition> };

function LiveInviteCard({ event }: { event: EventRow }) {
  const [message, setMessage] = useState("");
  const url = `${mobileConfig.inviteBaseUrl}/invite/${encodeURIComponent(event.invite_code)}`;
  async function share(copy = false) {
    try {
      if (copy) { await navigator.clipboard.writeText(url); setMessage("Invite link copied."); }
      else if (Capacitor.isNativePlatform()) await Share.share({ title: event.title, text: "Join our bridal party on Vows & Vibe", url });
      else if (navigator.share) await navigator.share({ title: event.title, url });
      else { await navigator.clipboard.writeText(url); setMessage("Invite link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Could not share automatically. Copy the link below.");
    }
  }
  return <div className="my-5 rounded-3xl border border-stone-200 bg-white p-4"><h2 className="font-semibold">Invite your bridal party</h2>
    <p className="mt-2 break-all text-xs text-stone-500">{url}</p><div className="mt-4 grid grid-cols-2 gap-2"><Action onClick={() => void share()}>Share invite</Action><Action onClick={() => void share(true)}>Copy invite</Action></div>
    {message && <p role="status" className="mt-3 text-xs">{message}</p>}</div>;
}

function EventScreen({ eventId, screen, revision, navigate, retry }: { eventId: string; screen: string; revision: number; navigate: (path: string) => void; retry: () => void }) {
  const [lineupRevision, setLineupRevision] = useState(0);
  useEffect(() => {
    const client = createClient(); let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = client.channel(`mobile-event:${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lineup_updates", filter: `event_id=eq.${eventId}` }, () => {
        clearTimeout(timer); timer = setTimeout(() => setLineupRevision((value) => value + 1), 250);
      }).subscribe((status) => { if (status === "SUBSCRIBED") setLineupRevision((value) => value + 1); });
    return () => { clearTimeout(timer); void client.removeChannel(channel); };
  }, [eventId]);
  const bundle = useRemote<EventBundle>(`/api/events/${eventId}/mobile`, revision);
  const lineup = useRemote<LineupBundle>(`/api/events/${eventId}/lineup`, revision + lineupRevision);
  const error = bundle.error ?? lineup.error;
  if (error && (!bundle.value || !lineup.value)) return <ResourceError message={error} retry={retry}/>;
  if (!bundle.value || !lineup.value) return <Loading/>;
  const { event, bride, looks } = bundle.value;
  if (screen === "style") return <section className="mobile-flow-page"><BridalLookStudio event={event} brideParticipantId={bride.id} initialLooks={looks}
    initialPhotoUrl={bride.original_photo_url} initialSkinToneHex={bride.skin_tone_hex} initialUndertone={bride.skin_undertone} onUpgradeRequired={() => navigate("/upgrade")}/></section>;
  if (screen === "edit") return <section className="mobile-home"><h1 className="mb-5 font-serif text-3xl">Edit your event</h1><EventForm mobileMode initialEvent={event} onUpgradeRequired={() => navigate("/upgrade")}/></section>;
  if (screen === "lineup") return <section className="mobile-studio-container" aria-label="Mobile compose studio"><Suspense fallback={<Loading/>}><LineupCanvas event={event}
    participants={lineup.value.participants} initialPositions={lineup.value.positions} request={clientFetch} fileActions={mobileFileActions} loadCanvas={loadBundledCanvas} onUpgradeRequired={() => navigate("/upgrade")} mobileMode/></Suspense>
    <p className="mobile-studio-caption" role={error ? "alert" : undefined}>{error ?? "Save shares your arrangement with your party."}</p></section>;
  if (screen === "messages") return <section className="mobile-home"><h1 className="font-serif text-3xl">Party suggestions</h1>
    <p className="mt-3 text-sm text-stone-600">Choose a bridesmaid to open your private suggestion conversation.</p><div className="mt-6 flex justify-end"><SuggestionTools eventId={event.id} currentParticipantId={bride.id} participants={[bride, ...lineup.value.participants.filter((person) => person.id !== bride.id)]} request={clientFetch}/></div></section>;
  return <section className="mobile-home"><h1 className="font-serif text-3xl">{event.title}</h1><EventSummary event={event}/><div className="space-y-3">
    <Action onClick={() => navigate(`/events/${event.id}/style`)}>Style your bridal look</Action><Action onClick={() => navigate(`/events/${event.id}/lineup`)}>Arrange bridal party</Action>
    <Action onClick={() => navigate(`/events/${event.id}/edit`)}>Edit styling brief</Action></div>
    <LiveInviteCard event={event}/></section>;
}

function Invite({ code, revision, retry }: { code: string; revision: number; retry: () => void }) {
  const result = useRemote<{ event: Omit<EventRow, "owner_id"> }>(`/api/invites/${encodeURIComponent(code)}`, revision);
  if (result.error) return <ResourceError message={result.error} retry={retry}/>;
  if (!result.value) return <Loading/>;
  return <section className="mobile-flow-page"><BridesmaidFlow event={{ ...result.value.event, owner_id: "" }}/></section>;
}

export function LiveApp() {
  const { path, revision, navigation } = useMobileNavigation();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const eventMatch = path.match(/^\/events\/([a-zA-Z0-9-]+)(?:\/(style|lineup|edit|messages))?$/);
  const inviteMatch = path.match(/^\/invite\/([a-zA-Z0-9-]+)$/);
  const studio = eventMatch?.[2] === "lineup";
  const privateRoute = path === "/dashboard" || path === "/events/new" || !!eventMatch || path === "/upgrade";
  useEffect(() => {
    const client = createClient();
    let cancelled = false;
    void client.auth.getSession().then(({ data, error }) => { if (!cancelled) { setSession(data.session); setAuthReady(true); if (error) setAuthError(error.message); } })
      .catch((error) => { if (!cancelled) { setAuthReady(true); setAuthError(error.message); } });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, value) => { setSession(value); setAuthReady(true); });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (authReady && privateRoute && !session) navigation.replace(`/login?next=${encodeURIComponent(safeReturnPath(path))}`);
  }, [authReady, privateRoute, session, navigation, path]);
  useEffect(() => {
    if (path !== "/auth/callback") return;
    let cancelled = false;
    void completeOAuth(new URL(window.location.href)).then((destination) => { if (!cancelled) navigation.replace(destination); })
      .catch((error) => { if (!cancelled) { setAuthError(error.message); navigation.replace("/login"); } });
    return () => { cancelled = true; };
  }, [path, navigation]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false; let stop: (() => void) | undefined;
    void listenForAppLinks(navigation.reset, setAuthError).then((cleanup) => { if (cancelled) cleanup(); else stop = cleanup; }).catch((error) => setAuthError(error.message));
    const state = NativeApp.addListener("appStateChange", ({ isActive }) => {
      void (isActive ? createClient().auth.startAutoRefresh() : createClient().auth.stopAutoRefresh());
      if (isActive) navigation.refresh();
    });
    return () => { cancelled = true; stop?.(); void state.then((handle) => handle.remove()); };
  }, [navigation]);
  useEffect(() => {
    const update = () => { setOffline(!navigator.onLine); if (navigator.onLine) navigation.refresh(); };
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [navigation]);
  async function signOut() {
    const { error } = await createClient().auth.signOut({ scope: "local" });
    if (error) { setAuthError(error.message); return; }
    setSession(null); navigation.replace("/");
    if (Capacitor.isNativePlatform()) await clearPurchasesIdentity().catch(() => {});
  }
  let content: ReactNode;
  if (path === "/auth/callback" || (!authReady && path === "/") || (privateRoute && (!authReady || !session))) content = <Loading/>;
  else if (path === "/login") content = session ? <section className="mobile-home"><Action onClick={() => navigation.replace("/dashboard")}>Open your events</Action></section>
    : <Login returnPath={safeReturnPath(new URLSearchParams(window.location.search).get("next"))}/>;
  else if (path === "/dashboard") content = <Dashboard key={session!.user.id} revision={revision} navigate={navigation.push} retry={navigation.refresh}/>;
  else if (path === "/events/new") content = <section className="mobile-home"><h1 className="mb-5 font-serif text-3xl">Create your event</h1><EventForm mobileMode onUpgradeRequired={() => navigation.push("/upgrade")}/></section>;
  else if (eventMatch) content = <EventScreen key={`${session!.user.id}:${path}`} eventId={eventMatch[1]} screen={eventMatch[2] ?? "detail"} revision={revision} navigate={navigation.push} retry={navigation.refresh}/>;
  else if (inviteMatch) content = <Invite key={inviteMatch[1]} code={inviteMatch[1]} revision={revision} retry={navigation.refresh}/>;
  else if (path === "/upgrade") content = <UpgradePanel appUserId={session!.user.id}/>;
  else if (path === "/") content = session
    ? <Dashboard key={session.user.id} revision={revision} navigate={navigation.push} retry={navigation.refresh}/>
    : <Login returnPath="/dashboard"/>;
  else content = <section className="mobile-home"><h1 className="font-serif text-3xl">This page was not found</h1><div className="mt-4"><Action onClick={() => navigation.replace("/")}>Return home</Action></div></section>;
  const guestEntry = !!inviteMatch;
  const canGoBack = !guestEntry && navigation.canGoBack();
  return <NavigationContext.Provider value={navigation}><main className={`mobile-app ${studio ? "mobile-app--studio" : ""}`}>
    <header className="mobile-header">{canGoBack ? <button type="button" aria-label="Back" onClick={navigation.back} className="mobile-icon-button"><ArrowLeft size={20}/></button> : <Heart size={23} className="shrink-0 text-rose-800"/>}
      {guestEntry
        ? <div className="min-w-0 flex-1"><p className="font-serif text-xl">Vows &amp; Vibe</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-500">Your private fitting room</p></div>
        : <button type="button" aria-label="Go to home" onClick={() => navigation.push("/")} className="min-w-0 flex-1 text-left"><p className="font-serif text-xl">Vows &amp; Vibe</p><p className="text-[10px] uppercase tracking-[.18em] text-stone-500">See it. Style it. Love it.</p></button>}
      {session && !guestEntry && <button type="button" onClick={() => void signOut()} className="min-h-11 shrink-0 text-xs text-stone-600">Sign out</button>}</header>
    {offline && <p role="status" className="shrink-0 bg-amber-50 p-3 text-center text-xs text-amber-900">You&apos;re offline. Reconnect to load and save your wedding.</p>}
    {authError && <div role="alert" className="flex shrink-0 items-center gap-2 bg-rose-50 p-3 text-xs text-rose-900"><span className="min-w-0 flex-1">{authError}</span><button type="button" onClick={() => setAuthError(null)} className="min-h-11">Dismiss</button></div>}
    {content}
  </main></NavigationContext.Provider>;
}
