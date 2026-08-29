"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Check, Shirt, Camera, Users, ShieldCheck, RotateCcw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import EventSummary from "@/components/EventSummary";
import { DressDropzone } from "@/components/DressDropzone";
import { PhotoFlipCard } from "@/components/PhotoFlipCard";
import { PublicLineupBoard } from "@/components/PublicLineupBoard";
import { DressAnalysisCard } from "@/components/DressAnalysisCard";
import type { EventRow, VtoHistoryEntry } from "@/lib/types";
import { type Undertone } from "@/lib/color/undertone";
import { analyzeDressWithSkinAndHair, type DressAnalysisResult, type YouCamProfile } from "@/lib/color/dress-analyzer";
import {
  classifyBridalPaletteBadge,
  type BridalPaletteBadge,
} from "@/lib/color/palette-matching";
import type { DressColorMeta } from "@/components/DressDropzone";

type Step = "loading" | "name" | "studio" | "processing" | "preview" | "confirmed";

interface ConfirmedBridesmaidColor {
  id: string;
  name: string;
  hex: string;
}

interface Session {
  participantId: string;
  token: string;
}

function storageKey(eventId: string) {
  return `vv-session-${eventId}`;
}

// localStorage (not sessionStorage) so the session survives closing the tab/browser and
// reopening the invite link later on the SAME device — sessionStorage is wiped as soon as
// the tab closes, which was forcing her through "name" again on every re-visit.
function loadSession(eventId: string): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(storageKey(eventId));
    return saved ? (JSON.parse(saved) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(eventId: string, session: Session) {
  window.localStorage.setItem(storageKey(eventId), JSON.stringify(session));
}

// Plain useLayoutEffect warns when it runs during SSR (this component IS server-rendered
// for the initial HTML, then hydrated). Falling back to useEffect on the server side of
// that render keeps the warning away without changing client behavior at all.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function stepForStatus(status: string): Step {
  return status === "confirmed" ? "confirmed" : "studio";
}

export function BridesmaidFlow({ event }: { event: EventRow }) {
  // Always start in loading on the first render. Reading localStorage during the initial
  // state calculation made the server render "name" while the browser rendered "loading",
  // which caused a hydration mismatch and the Next.js error indicator on refresh. The
  // resume effect below decides between studio/confirmed/name after the client mounts.
  const [step, setStep] = useState<Step>("loading");
  const [name, setName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [dressUrl, setDressUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<VtoHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  // Tracks which VTO run (by task_id) is the one currently shown in "preview" — whether it
  // just finished or was picked from her lookbook — so confirm() knows exactly which look's
  // dress/render paths to persist, instead of trusting whatever the DB happens to hold from
  // her most recent run.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = not yet analyzed (or analysis failed) — the dress rail simply falls back to
  // event.example_dresses' original order in that case, never blocks or shows an error.
  const [undertone, setUndertone] = useState<Undertone | null>(null);
  // Raw skin_tone_hex, needed alongside `undertone` to actually score individual dresses
  // (analyzeDressWithSkinAndHair wants real hexes, not just the warm/cool/neutral bucket).
  const [skinToneHex, setSkinToneHex] = useState<string | null>(null);
  // From the same YouCam skin-tone-analysis call as skinToneHex — needed for the personal
  // (skin vs hair) contrast term in analyzeDressWithSkinAndHair.
  const [hairToneHex, setHairToneHex] = useState<string | null>(null);
  // Keyed by dress URL. Scoring is now pure, synchronous local math over each dress's
  // primaryHex (resolved from the user-entered dress color palette at upload time — see
  // event.example_dresses) against her skin+hair profile — no per-dress image fetch or
  // client-side color extraction needed anymore, so this fills in immediately the moment
  // her profile is known instead of after an async pass over every dress image.
  const [dressBadges, setDressBadges] = useState<Record<string, DressAnalysisResult>>({});
  const [newlyAnalyzedDressUrl, setNewlyAnalyzedDressUrl] = useState<string | null>(null);
  const [customDresses, setCustomDresses] = useState<Array<{ url: string; primaryHex: string | null; colorName: string | null; family: string | null }>>([]);
  const [confirmedBridesmaids, setConfirmedBridesmaids] = useState<ConfirmedBridesmaidColor[]>([]);
  const [busy, setBusy] = useState(false);
  // These refs are used only by the required YouCam VTO task polling.
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenRef = useRef(0);
  function bridePaletteBadge(
    dressHex: string | null | undefined,
    colorName?: string | null,
  ): BridalPaletteBadge | null {
    return classifyBridalPaletteBadge(colorName, dressHex, event.color_palette ?? []);
  }


  // Resume an in-progress session (e.g. she closed the tab while VTO was processing, or
  // simply reopened the invite link later). Session lives in localStorage so it survives
  // across visits on this device.
  //
  // useLayoutEffect (not useEffect) specifically so the localStorage check itself runs
  // BEFORE the browser paints the first frame. With plain useEffect, a first-time visitor
  // (no saved session) would still get one visible paint of the "loading" screen before
  // the effect flips step to "name" — a flash. Reading localStorage is synchronous and
  // cheap, so doing it pre-paint costs nothing; the actual network fetch below still runs
  // async and the loading screen still shows for as long as that's genuinely in flight.
  useIsomorphicLayoutEffect(() => {
    const saved = loadSession(event.id);
    if (saved) {
      setSession(saved);
      fetch(`/api/participants/${saved.participantId}?token=${saved.token}`)
        .then((r) => r.json())
        .then(({ participant }) => {
          if (!participant) {
            setStep("name");
            return;
          }
          if (participant.name) setName(participant.name);
          setDressUrl(participant.selected_dress_url);
          setPhotoUrl(participant.original_photo_url);
          setRenderUrl(participant.vto_render_url);
          setHistory(participant.vto_history ?? []);
          setActiveTaskId(participant.vto_task_id ?? null);
          setUndertone(participant.skin_undertone ?? null);
          setSkinToneHex(participant.skin_tone_hex ?? null);
          setHairToneHex(participant.hair_tone_hex ?? null);
          fetch(`/api/participants/${saved.participantId}/dresses?token=${saved.token}`)
            .then((dressRes) => dressRes.json())
            .then(({ dresses }) => {
              setCustomDresses((dresses ?? []).map((d: unknown) => {
                const obj = d as Record<string, unknown>;
                return {
                  url: typeof obj.url === "string" ? obj.url : "",
                  primaryHex: typeof obj.primary_hex === "string" ? obj.primary_hex : null,
                  colorName: typeof obj.color_name === "string" ? obj.color_name : null,
                  family: typeof obj.family === "string" ? obj.family : null,
                };
              }));
            })
            .catch(() => undefined);
          setStep(stepForStatus(participant.status));
        })
        .catch(() => setStep("name"));
    } else {
      // No session for this event on this device at all (first-ever visit, or she cleared
      // storage) — go straight to the name form. Running this check pre-paint (see the
      // useIsomorphicLayoutEffect above) means this never renders as a "loading" flash first.
      setStep("name");
    }
    pollGenRef.current += 1;
    if (pollRef.current) clearTimeout(pollRef.current);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${event.id}/lineup`)
      .then((response) => response.json())
      .then((json) => {
        if (cancelled || !Array.isArray(json.participants)) return;
        setConfirmedBridesmaids(
          json.participants
            .filter((participant: { role?: string; id?: string; confirmed_dress_primary_hex?: string | null }) => participant.role === "bridesmaid" && participant.id !== session?.participantId)
            .filter((participant: { confirmed_dress_primary_hex?: string | null }) => typeof participant.confirmed_dress_primary_hex === "string")
            .map((participant: { id: string; name: string; confirmed_dress_primary_hex: string }) => ({ id: participant.id, name: participant.name, hex: participant.confirmed_dress_primary_hex })),
        );
      })
      .catch(() => {
        if (!cancelled) setConfirmedBridesmaids([]);
      });
    return () => { cancelled = true; };
  }, [event.id, session?.participantId]);

  // Dress analysis is deliberately render-time math. The DB already has the participant
  // skin/hair hex values and Grok has already read the dress primaryHex, so refreshes do not
  // trigger another model call.
  useEffect(() => {
    if (!photoUrl || !skinToneHex || !undertone) {
      setDressBadges({});
      return;
    }
    const profile: YouCamProfile = { skinHex: skinToneHex, hairHex: hairToneHex, undertone };
    const next: Record<string, DressAnalysisResult> = {};
    const allDresses = [
      ...(event.example_dresses ?? []).map((d) => ({ url: d.url, primaryHex: d.primaryHex ?? null, colorName: d.colorName ?? null })),
      ...customDresses.map((d) => ({ url: d.url, primaryHex: d.primaryHex, colorName: d.colorName })),
    ];
    for (const d of allDresses) {
      if (!d.primaryHex) continue;
      try {
        next[d.url] = analyzeDressWithSkinAndHair(d.primaryHex, profile, {
          dressColorName: d.colorName,
          bridePalette: event.color_palette ?? [],
          confirmedBridesmaids,
        });
      } catch (err) {
        console.error("Dress compatibility scoring failed for", d.url, err);
      }
    }
    setDressBadges(next);
  }, [photoUrl, skinToneHex, hairToneHex, undertone, event.example_dresses, event.color_palette, customDresses, confirmedBridesmaids]);

  async function joinEvent(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: event.id, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not join");
      const participant = json.participant;
      const s = { participantId: participant.id, token: participant.session_token };
      saveSession(event.id, s);
      setSession(s);
      // The server may have handed back an EXISTING row (same name, reopened from another
      // device or after clearing storage) — restore her prior progress instead of always
      // dropping her into a blank studio.
      setDressUrl(participant.selected_dress_url ?? null);
      setPhotoUrl(participant.original_photo_url ?? null);
      setRenderUrl(participant.vto_render_url ?? null);
      setHistory(participant.vto_history ?? []);
      setActiveTaskId(participant.vto_task_id ?? null);
      setUndertone(participant.skin_undertone ?? null);
      setSkinToneHex(participant.skin_tone_hex ?? null);
      setHairToneHex(participant.hair_tone_hex ?? null);
      fetch(`/api/participants/${participant.id}/dresses?token=${participant.session_token}`)
        .then((dressRes) => dressRes.json())
        .then(({ dresses }) => setCustomDresses((dresses ?? []).map((d: unknown) => {
          const obj = d as Record<string, unknown>;
          return {
            url: typeof obj.url === "string" ? obj.url : "",
            primaryHex: typeof obj.primary_hex === "string" ? obj.primary_hex : null,
            colorName: typeof obj.color_name === "string" ? obj.color_name : null,
                      };
        })))
        .catch(() => undefined);
      setStep(stepForStatus(participant.status ?? "pending"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // Persist the uploaded photo to the participant row IMMEDIATELY, not only once a VTO run
  // starts. Without this, the file exists in Supabase Storage but nowhere in the database —
  // a refresh (or reopening the link) had no way to know it was ever uploaded, so it looked
  // like the photo vanished even though it was still sitting in the bucket as an orphan.
  // Skin tone is no longer derived from this photo — see handleSkinToneResult, driven by
  // the independent selfie side of the flip card — so this no longer triggers analysis.
  async function persistPhoto(url: string, path?: string) {
    setPhotoUrl(url);
    if (!session || !path) return;
    try {
      await fetch(`/api/participants/${session.participantId}?token=${session.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_photo_path: path }),
      });
    } catch (err) {
      console.error("Could not save photo to participant record", err);
    }
  }

  // Called once the selfie side of the flip card finishes analysis (see SelfieUpload /
  // PhotoFlipCard). The selfie itself is never sent here — only the derived tone, which the
  // skin-tone route already persisted server-side.
  function handleSkinToneResult(result: { hex: string; undertone: Undertone; depth: string | null; hairHex?: string | null }) {
    setUndertone(result.undertone);
    setSkinToneHex(result.hex);
    setHairToneHex(result.hairHex ?? null);
  }

  async function clearPhoto() {
    setPhotoUrl(null);
    if (!session) return;
    try {
      await fetch(`/api/participants/${session.participantId}?token=${session.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_photo_path: null }),
      });
    } catch (err) {
      console.error("Could not clear photo on participant record", err);
    }
  }

  const sortedDresses = [
    ...(event.example_dresses ?? []).map((d, index) => ({
      url: d.url,
      label: d.label,
      primaryHex: d.primaryHex ?? null,
      colorName: d.colorName ?? null,
            index,
    })),
    ...customDresses.map((d, index) => ({
      url: d.url,
      label: d.colorName ?? "Uploaded dress",
      primaryHex: d.primaryHex,
      colorName: d.colorName,
            index: (event.example_dresses?.length ?? 0) + index,
    })),
  ].sort((a, b) => {
    const aScore = dressBadges[a.url]?.score;
    const bScore = dressBadges[b.url]?.score;
    if (aScore == null && bScore == null) return a.index - b.index;
    if (aScore == null) return 1;
    if (bScore == null) return -1;
    return bScore - aScore || a.index - b.index;
  });

async function startVto(nextDressUrl: string, dressMeta?: DressColorMeta) {
  if (!session || !photoUrl) {
    setError("Please upload your full-body photo first.");
    return;
  }

  setDressUrl(nextDressUrl);

  const primaryHex = dressMeta?.primaryHex;

  // Score the dress immediately when we have the resolved dress color
  // and the YouCam profile data.
  if (primaryHex && skinToneHex && undertone) {
    const profile: YouCamProfile = {
      skinHex: skinToneHex,
      hairHex: hairToneHex,
      undertone,
    };

    setDressBadges((current) => ({
      ...current,
      [nextDressUrl]: analyzeDressWithSkinAndHair(primaryHex, profile, {
        dressColorName: dressMeta?.colorName ?? null,
        bridePalette: event.color_palette ?? [],
        confirmedBridesmaids,
      }),
    }));
  }
    setStep("processing");
    setError(null);
    try {
      const res = await fetch("/api/vto/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: session.participantId,
          token: session.token,
          photo_url: photoUrl,
          dress_url: nextDressUrl,
          dress_primary_hex: dressMeta?.primaryHex ?? null,
          dress_color_name: dressMeta?.colorName ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start render");
      setHistory((current) => [...current, { id: json.attempt_id, dress_path: null, dress_url: nextDressUrl, render_path: null, task_id: json.task_id, status: "processing", created_at: new Date().toISOString() }]);
      setSelectedHistoryId(null);

      // This is the only polling left in the app: the YouCam task itself has no
      // push callback, so we must ask YouCam until this render finishes.
      const myGen = ++pollGenRef.current;
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 60;

      const poll = async () => {
        if (pollGenRef.current !== myGen) return;
        pollAttempts += 1;
        try {
          const statusRes = await fetch(
            `/api/vto/status/${json.task_id}?participant_id=${session.participantId}&token=${session.token}`
          );
          const statusJson = await statusRes.json();
          if (pollGenRef.current !== myGen) return;

          if (!statusRes.ok) {
            setError(statusJson.error ?? "Render failed — please try again.");
            setStep("studio");
            return;
          }

          if (statusJson.status === "success") {
            setRenderUrl(statusJson.render_url);
            setHistory((current) => current.map((entry) => entry.task_id === json.task_id ? { ...entry, status: "ready", render_url: statusJson.render_url } : entry));
            setSelectedHistoryId(null);
            setActiveTaskId(json.task_id);
            setStep("preview");
            return;
          }

          if (statusJson.status === "error" || pollAttempts >= MAX_POLL_ATTEMPTS) {
            setError(statusJson.error ?? "This render is taking longer than expected. Please try again.");
            setStep("studio");
            return;
          }

          pollRef.current = setTimeout(poll, 2500);
        } catch {
          if (pollGenRef.current === myGen) pollRef.current = setTimeout(poll, 2500);
        }
      };

      pollRef.current = setTimeout(poll, 2500);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("studio");
    }
  }

  async function confirm() {
    if (!session || !activeTaskId) return;
    setBusy(true);
    setError(null);
    try {
      const entry = history.find((h) => h.task_id === activeTaskId);
      if (!entry?.id) throw new Error("This preview is no longer available. Please try it again.");
      const res = await fetch(`/api/participants/${session.participantId}?token=${session.token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed", confirmed_look_id: entry.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not confirm your look");
      // Mirror the server: the previously confirmed attempt (if any) drops back to "ready",
      // and this one becomes the sole "confirmed" entry, so her lookbook badges stay in sync
      // when she comes back here after changing her look.
      setHistory((current) =>
        current.map((h) => {
          if (h.id === entry.id) return { ...h, status: "confirmed" };
          if (h.status === "confirmed") return { ...h, status: "ready" };
          return h;
        })
      );
      setRenderUrl(json.participant?.vto_render_url ?? renderUrl);
      setStep("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm your look");
    } finally {
      setBusy(false);
    }
  }

  return (
<div className={step === "name" ? "w-full" : step === "confirmed" ? "lineup-confirmed-viewport mx-auto max-w-6xl" : "mx-auto max-w-6xl"}>      {/* ── LOADING: resuming a saved session, avoids flashing the name form ── */}
      {step === "loading" && (
        <div className="flex min-h-[80vh] items-center justify-center py-6">
          <div className="flex flex-col items-center gap-3 text-stone-400">
            <Loader2 className="animate-spin" size={22} />
            <p className="text-xs font-medium uppercase tracking-widest">Welcoming you back…</p>
          </div>
        </div>
      )}

      {/* ── STEP 1: NAME ENTRY ── */}
      {step === "name" && (
        <div className="-mx-5 -my-7 sm:-mx-8 sm:-my-10">
          <AuthSplitLayout eyebrow="Your private fitting room" role="bridesmaid">
            <Card className="border-stone-200/80 bg-white p-7 shadow-[0_24px_70px_-35px_rgba(28,25,23,0.35)] sm:p-9">
              <div className="mb-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-rose-700">You&apos;re invited</p>
                <h2 className="mt-2 font-serif text-3xl leading-tight text-stone-900">{event.title || "The Bridal Suite"}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">Enter your name to open your private lookbook. You can explore, try on, and confirm a look when you&apos;re ready.</p>
              </div>
              <form onSubmit={joinEvent} className="space-y-5">
                <div>
                  <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Your name</Label>
                  <Input id="name" required placeholder="e.g. Sophia Lin" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-12 rounded-xl border-stone-200 bg-stone-50 text-sm focus:border-stone-400 focus:ring-2 focus:ring-rose-200" />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button type="submit" className="h-12 w-full rounded-xl bg-stone-900 text-xs font-semibold uppercase tracking-widest text-white shadow-lg shadow-stone-900/10 hover:bg-rose-950" disabled={busy || !name.trim()}>
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <>Open my fitting room <ArrowRight size={15} /></>}
                </Button>
              </form>
              <div className="mt-6 grid grid-cols-3 divide-x rounded-2xl border border-stone-100 bg-stone-50/80 py-3 text-center">
                {[{ icon: Shirt, text: "Pick a dress" }, { icon: Camera, text: "AI try-on" }, { icon: Users, text: "Join lineup" }].map(({ icon: Icon, text }) => <div key={text} className="px-2"><Icon className="mx-auto mb-1.5 text-rose-500" size={15} /><p className="text-[9px] font-semibold text-stone-600">{text}</p></div>)}
              </div>
            </Card>
          </AuthSplitLayout>
        </div>
      )}

      {/* ── STEP 2: PRIVATE FITTING STUDIO ── */}
      {step === "studio" && (
        <section className="space-y-7">
          <EventSummary event={event} undertone={undertone} />
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3 border-b border-stone-200/60 pb-5">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800/70">Your private studio</p>
              <h2 className="font-serif text-3xl text-stone-900">Find your look</h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-stone-500">Upload your photo once, then try as many dresses as you like. Your previews stay private until you confirm.</p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">01 · Your photo</p>
                  <h3 className="mt-0.5 font-serif text-xl text-stone-900">Start with you</h3>
                </div>
                {photoUrl && <Check className="text-emerald-600" size={19} />}
              </div>
              {session && (
                <PhotoFlipCard
                  participantId={session.participantId}
                  token={session.token}
                  photoFolder="user-photos/bridesmaid"
                  photoUrl={photoUrl}
                  onPhotoUploaded={persistPhoto}
                  onPhotoCleared={clearPhoto}
                  onSkinToneResult={handleSkinToneResult}
                  skinToneCaptured={Boolean(skinToneHex)}
                />
              )}
              <p className="mt-3 text-xs leading-relaxed text-stone-500">Your full-body photo stays private to your fitting studio and is only ever removed if the bride deletes this event. Your selfie is used only to read your skin tone and is never saved.</p>
            </div>

            <div>
              <div className="mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">02 · Dress rail</p>
                <h3 className="mt-0.5 font-serif text-xl text-stone-900">Choose a dress to try</h3>
              </div>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
                {sortedDresses.map((d) => (
                  <div key={d.url} className={dressBadges[d.url] ? "" : "pt-5"}>
                    {dressBadges[d.url] ? (
                      <DressAnalysisCard
                        url={d.url}
                        alt={d.label ?? "Dress"}
                        analysis={dressBadges[d.url]}
                        bridePaletteMatch={bridePaletteBadge(d.primaryHex, d.colorName)}
                        initialAnalysisOpen={newlyAnalyzedDressUrl === d.url}
                        onSelect={() => startVto(d.url, { primaryHex: d.primaryHex, colorName: d.colorName, family: null })}
                        disabled={!photoUrl}
                        actionLabel="Try this dress"
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={!photoUrl}
                        onClick={() => startVto(d.url, { primaryHex: d.primaryHex, colorName: d.colorName, family: null })}
                        className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-stone-100 text-left ring-offset-2 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.url} alt={d.label ?? "Dress"} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        <span className="absolute inset-x-2 bottom-2 rounded-xl bg-stone-900/90 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">Try this dress</span>
                      </button>
                    )}
                  </div>
                ))}
                <div className="pt-5">
                  <DressDropzone
                    variant="catalog"
                  folder="user-dresses/bridesmaid"
                  label="Add a dress"
                  askColorPalette
                  paletteOptions={event.color_palette}
                  onUploaded={async (url, path, meta) => {
                    const uploaded = {
                      url,
                      primaryHex: meta?.primaryHex ?? null,
                      colorName: meta?.colorName ?? null,
                      family: meta?.family ?? null,
                    };
                    setCustomDresses((current) => current.some((d) => d.url === url) ? current : [uploaded, ...current]);
                    setNewlyAnalyzedDressUrl(url);
                    if (path && session) {
                      try {
                        const resp = await fetch(`/api/participants/${session.participantId}/dresses`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            storage_path: path,
                            primary_hex: uploaded.primaryHex,
                            color_name: uploaded.colorName,
                            family: uploaded.family,
                          }),
                        });
                        if (!resp.ok) console.error("Failed to save uploaded bridesmaid dress", await resp.text());
                      } catch (err) {
                        console.error("Failed to save uploaded bridesmaid dress", err);
                      }
                    }
                  }}
                  />
                </div>
              </div>
              {!photoUrl && <p className="mt-3 text-xs font-medium text-stone-500">Upload your photo first to unlock virtual try-on.</p>}
            </div>
          </div>

          {history.length > 0 && (
            <div className="border-t border-stone-200/60 pt-6">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-stone-400">Your private lookbook · {history.filter((entry) => entry.status === "ready" || entry.status === "confirmed").length} previews</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {history.map((entry) => (entry.status === "ready" || entry.status === "confirmed") && entry.render_url ? (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => { setSelectedHistoryId(entry.id); setActiveTaskId(entry.task_id); setRenderUrl(entry.render_url ?? null); setDressUrl(entry.dress_preview_url ?? entry.dress_url); setStep("preview"); }}
                    className={`relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border bg-stone-100 transition ${selectedHistoryId === entry.id ? "border-rose-400 ring-2 ring-rose-200" : "border-stone-200"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={entry.render_url} alt="Saved try-on" className="h-full w-full object-cover" />
                    {entry.status === "confirmed" && (
                      <span className="absolute inset-x-0 bottom-0 bg-emerald-600/90 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-white">Confirmed</span>
                    )}
                  </button>
                ) : null)}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── PROCESSING ── */}
      {step === "processing" && (
        <>
          <EventSummary event={event} undertone={undertone}/>
          <Card className="mx-auto mt-6 max-w-md border-stone-200 bg-white/80 text-center shadow-none p-8 rounded-2xl">
            <Sparkles className="mx-auto mb-3 animate-pulse text-rose-500" size={28} />
            <h2 className="mb-1 font-serif text-xl">Working our magic…</h2>
            <p className="text-sm text-neutral-500">Your photo is private while our AI fits the selected dress. This usually takes a few seconds.</p>
          </Card>
        </>
      )}

      {/* ── STEP 5: PREVIEW ── */}
      {step === "preview" && renderUrl && (
        <Card className="mx-auto max-w-lg border-stone-200 bg-white/80 shadow-none p-6 rounded-2xl">
          <h2 className="mb-1 font-serif text-xl">Here&apos;s your look</h2>
          <p className="mb-4 text-sm text-neutral-500">
            Only you can see this. Happy with it? Confirm to join the shared lineup.
          </p>
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={16} /> Your selected VTO look joins the shared lineup. Your photo stays private and is only removed if the bride deletes this event.</div>
          {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={renderUrl} alt="Your virtual try-on" className="mb-4 w-full rounded-xl border border-rose-100" />
          {dressUrl && (
            <div className="mb-4 flex items-center gap-2">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dressUrl} alt="Selected dress" className="h-full w-full object-cover" />
              </div>
              <p className="text-xs text-stone-500">This is your selected dress for this look.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setStep("studio")}>
              Try another dress
            </Button>
            <Button className="flex-1 bg-stone-900 hover:bg-rose-950 text-white" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              {busy ? "Joining lineup…" : "Confirm & join lineup"}
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 6: CONFIRMED ── */}
      {step === "confirmed" && (
        <section className="mx-auto flex h-full min-h-0 max-w-5xl flex-col py-0">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blush-100 text-blush-700">
              <Check size={22} strokeWidth={2.5} />
            </div>
            <h2 className="font-serif text-2xl text-stone-800">You&apos;re in the lineup!</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-stone-500">
              Your look has joined the group photo below — it&apos;ll keep filling in as the rest of the party confirms theirs.
            </p>
            <Button
              variant="outline"
              className="mt-4 border-stone-200 text-xs"
              onClick={() => setStep("studio")}
            >
              <RotateCcw size={14} /> Change your look
            </Button>
          </div>
          <div className="lineup-full-bleed relative flex min-h-0 flex-1 flex-col rounded-3xl border border-blush-100 bg-white p-3 shadow-sm sm:p-4">
            <PublicLineupBoard eventId={event.id} eventTitle={event.title} currentParticipantId={session?.participantId ?? null} currentParticipantToken={session?.token ?? null} />
          </div>
        </section>
      )}
    </div>
  );
}
