"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Loader2, RotateCcw, ShieldCheck, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DressDropzone } from "@/components/DressDropzone";
import { DressAnalysisCard } from "@/components/DressAnalysisCard";
import { PhotoFlipCard } from "@/components/PhotoFlipCard";
import type { SkinToneResult } from "@/components/SelfieUpload";
import { analyzeDressWithSkinAndHair, type DressAnalysisResult, type YouCamProfile } from "@/lib/color/dress-analyzer";
import type { Undertone } from "@/lib/color/undertone";
import type { BridalLookView, EventRow } from "@/lib/types";


type StudioState = "setup" | "processing" | "preview";

export function BridalLookStudio({ event, initialLooks, brideParticipantId, initialPhotoUrl, initialUndertone, initialSkinToneHex, initialHairToneHex }: { event: EventRow; initialLooks: BridalLookView[]; brideParticipantId: string; initialPhotoUrl?: string | null; initialUndertone?: Undertone | null; initialSkinToneHex?: string | null; initialHairToneHex?: string | null }) {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl ?? initialLooks[0]?.original_photo_url ?? null);
  interface StoredDress {
    url: string;
    storage_path?: string | null;
    primary_hex?: string | null;
    color_name?: string | null;
  }
  const [dresses, setDresses] = useState<StoredDress[]>([]);
  const [looks, setLooks] = useState<BridalLookView[]>(initialLooks);
  const [state, setState] = useState<StudioState>("setup");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [activeLookId, setActiveLookId] = useState<string | null>(initialLooks[0]?.id ?? null);
  const [undertone, setUndertone] = useState<Undertone | null>(initialUndertone ?? null);
  const [skinToneHex, setSkinToneHex] = useState<string | null>(initialSkinToneHex ?? null);
  const [hairToneHex, setHairToneHex] = useState<string | null>(initialHairToneHex ?? null);
  const [dressAnalyses, setDressAnalyses] = useState<Record<string, DressAnalysisResult>>({});
  const [newlyAnalyzedDressUrl, setNewlyAnalyzedDressUrl] = useState<string | null>(null);
const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pollGenRef = useRef(0);

// Helper to safely stop active polling
const stopPolling = () => {
  pollGenRef.current += 1;
  if (intervalRef.current) {
    clearTimeout(intervalRef.current);
    intervalRef.current = null;
  }
};
  useEffect(() => {
    fetch(`/api/participants/${brideParticipantId}/dresses`)
      .then((res) => res.json())
      .then((json) =>
        setDresses(
          (json.dresses ?? [])
            .map((dress: unknown) => {
              const d = dress as Record<string, unknown>;
              return {
                url: typeof d.url === "string" ? d.url : "",
                storage_path: typeof d.storage_path === "string" ? d.storage_path : null,
                primary_hex: typeof d.primary_hex === "string" ? d.primary_hex : null,
                color_name: typeof d.color_name === "string" ? d.color_name : null,
              } as StoredDress;
            })
            .filter((d: StoredDress) => Boolean(d.url))
        )
      )
      .catch(() => undefined);
    return () => stopPolling();
  }, [brideParticipantId]);

  function addDress(dress: StoredDress) {
    setDresses((current) => (current.some((d) => d.url === dress.url) ? current : [...current, dress]));
  }

  useEffect(() => {
    if (!photoUrl || !skinToneHex || !undertone) {
      setDressAnalyses({});
      return;
    }
    const profile: YouCamProfile = { skinHex: skinToneHex, hairHex: hairToneHex, undertone };
    const next: Record<string, DressAnalysisResult> = {};
    for (const dress of dresses) {
      if (!dress.primary_hex) continue;
      try { next[dress.url] = analyzeDressWithSkinAndHair(dress.primary_hex, profile); }
      catch (err) { console.error("Dress compatibility scoring failed for", dress.url, err); }
    }
    setDressAnalyses(next);
  }, [dresses, photoUrl, skinToneHex, hairToneHex, undertone]);

  const sortedDresses = dresses
    .map((dress, index) => ({ dress, index }))
    .sort((a, b) => {
      const aScore = dressAnalyses[a.dress.url]?.score;
      const bScore = dressAnalyses[b.dress.url]?.score;
      if (aScore == null && bScore == null) return a.index - b.index;
      if (aScore == null) return 1;
      if (bScore == null) return -1;
      return bScore - aScore || a.index - b.index;
    })
    .map(({ dress }) => dress);

async function startLook(dressUrl: string) {
    if (!photoUrl) {
      setError("Please add your full-body photo before creating a preview.");
      return;
    }
    stopPolling();
    setError(null);
    setState("processing");

    try {
      // 1. Trigger API route (creates DB row & initializes YouCam task)
      const res = await fetch("/api/bridal-look/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          photo_url: photoUrl,
          dress_url: dressUrl
        }),
        signal: AbortSignal.timeout(35_000),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start preview");

      const lookId = json.look_id as string;
      const taskId = json.task_id as string;

      // 2. Poll YouCam task status — schedule each check only after the
      // previous one resolves, so a slow render can't stack up multiple
      // in-flight requests that all land as "success" at once. The
      // generation guard also ignores stale responses if the person
      // starts a new preview before this one finishes.
      const myGen = ++pollGenRef.current;
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 60; // ~2.5 min at 2500ms between checks
      const pollLifetime = AbortSignal.timeout(180_000);

      const poll = async () => {
        if (pollGenRef.current !== myGen) return;
        if (pollLifetime.aborted) {
          setError("This preview is taking longer than expected. Please try again.");
          setState("setup");
          return;
        }
        pollAttempts += 1;
        try {
          const statusRes = await fetch(`/api/bridal-look/status/${taskId}?look_id=${lookId}`, {
            signal: AbortSignal.timeout(15_000),
          });
          const status = await statusRes.json();
          if (pollGenRef.current !== myGen) return; // superseded while this fetch was in flight

          if (!statusRes.ok) {
            setError(status.error ?? "Preview failed. Please try again.");
            setState("setup");
            return;
          }

          if (status.status === "success") {
            const look: BridalLookView = {
              id: lookId,
              participant_id: brideParticipantId,
              participant_dress_id: null,
              dress_path: null,
              body_photo_path: "",
              render_path: null,
              task_id: taskId,
              status: "ready",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              cutout_path: null,
              original_photo_url: photoUrl,
              dress_url: dressUrl,
              vto_render_url: status.render_url,
            };
            setLooks((current) => (current.some((l) => l.id === look.id) ? current : [look, ...current]));
            setActiveLookId(look.id);
            setState("preview");
            return;
          }

          if (status.status === "error") {
            setError(status.error ?? "Preview failed. Please try a different dress or photo.");
            setState("setup");
            return;
          }

          if (pollAttempts >= MAX_POLL_ATTEMPTS || pollLifetime.aborted) {
            setError("This preview is taking longer than expected. Please try again.");
            setState("setup");
            return;
          }

          intervalRef.current = setTimeout(poll, 2500);
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
          if (pollGenRef.current !== myGen) return;
          if (pollAttempts >= MAX_POLL_ATTEMPTS || pollLifetime.aborted) {
            setError("This preview is taking longer than expected. Please try again.");
            setState("setup");
            return;
          }
          intervalRef.current = setTimeout(poll, 2500);
        }
      };

      intervalRef.current = setTimeout(poll, 2500);

    } catch (err) {
      stopPolling();
      setError(err instanceof DOMException && err.name === "TimeoutError"
        ? "YouCam did not respond in time. Please try again."
        : err instanceof Error ? err.message : "Something went wrong");
      setState("setup");
    }
  }

  const latest = looks[0];
  const activeLook = looks.find((look) => look.id === activeLookId) ?? latest;

  async function confirmLook() {
    if (!activeLook) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/bridal-look/${activeLook.id}/confirm`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not confirm your look");

      setLooks((current) =>
        current.map((look) => ({
          ...look,
          status: look.id === activeLook.id ? "confirmed" : look.status,
        }))
      );
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-xl shadow-stone-900/[0.03] backdrop-blur-xl sm:p-10">
      {/* Top Accent Line */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-200 via-rose-400 to-blush-300" />
      
      {/* Header */}
      <div className="mb-8 border-b border-stone-200/60 pb-6">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-rose-800/80">
            Bride&apos;s Private Studio
          </p>
          <h2 className="font-serif text-3xl font-normal text-stone-900 sm:text-4xl">Find the one</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">
            Upload one full-body photo, add as many dresses as you wish, and see each look on you before the fitting room.
          </p>
        </div>
      </div>

      {/* State 1: Processing */}
      {state === "processing" ? (
        <Card className="mx-auto max-w-lg border-stone-100 bg-[#fcfaf7] py-16 text-center shadow-none">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-rose-100 text-rose-700">
            <WandSparkles className="animate-pulse" size={25} />
          </div>
          <h3 className="font-serif text-2xl text-stone-900">Styling your preview</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-stone-600">
            We&apos;re fitting your selected dress to your photo. Keep this tab open — it usually takes a moment.
          </p>
          <Loader2 className="mx-auto mt-6 animate-spin text-rose-500" size={22} />
        </Card>
      ) : state === "preview" && activeLook?.vto_render_url ? (
        /* State 2: Preview Result */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="overflow-hidden rounded-2xl border border-rose-100 bg-stone-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeLook.vto_render_url} alt="Bride virtual try-on preview" className="max-h-[650px] w-full object-contain" />
          </div>
          <div className="flex flex-col justify-center rounded-2xl bg-[#fcf7f5] p-6">
            <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-800 shadow-xs">
              <Check size={12} /> Your preview
            </span>
            <h3 className="font-serif text-2xl text-stone-900">A beautiful fit.</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              Try another dress, or keep this look. Your source photo stays private and is only removed if you delete this event.
            </p>
            {activeLook.status === "confirmed" ? (
              <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800">
                <ShieldCheck size={17} /> This look is confirmed
              </div>
            ) : (
              <Button className="mt-6 w-full bg-stone-900 text-white transition-colors hover:bg-rose-950" onClick={confirmLook} disabled={confirming}>
                <ShieldCheck size={15} /> {confirming ? "Confirming…" : "Keep this look"}
              </Button>
            )}
            <Button variant="outline" className="mt-2.5 w-full border-stone-200" onClick={() => setState("setup")}>
              <RotateCcw size={15} /> Try another dress
            </Button>
          </div>
        </div>
      ) : (
        /* State 3: Setup Rails */
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {/* Column 01: Photo Upload */}
          <div className="flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">01 · Your photo</p>
                <h3 className="mt-0.5 font-serif text-xl text-stone-900">Start with you</h3>
              </div>
              {photoUrl && <Check className="text-emerald-600" size={19} />}
            </div>

            <PhotoFlipCard
              participantId={brideParticipantId}
              photoFolder="user-photos/bride"
              photoUrl={photoUrl}
              skinToneCaptured={Boolean(skinToneHex)}
              onPhotoUploaded={async (url, path) => {
                setPhotoUrl(url);
                if (!path) return;
                await fetch(`/api/participants/${brideParticipantId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ original_photo_path: path }) });
              }}
              onPhotoCleared={async () => {
                setPhotoUrl(null);
                await fetch(`/api/participants/${brideParticipantId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ original_photo_path: null }) });
              }}
              onSkinToneResult={(result: SkinToneResult) => {
                // Skin tone now comes from the independent selfie side of the flip card,
                // never from the full-body photo — the skin-tone route already persisted
                // this server-side, so we're just syncing local state for the palette rail.
                setUndertone(result.undertone);
                setSkinToneHex(result.hex);
                setHairToneHex(result.hairHex ?? null);
              }}
            />

            <p className="mt-3 text-xs leading-relaxed text-stone-500">
              For the most natural preview, stand facing the camera in even lighting with your full silhouette in frame.
            </p>


          </div>

          {/* Column 02: Dress Rail */}
          <div>
            <div className="mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">02 · Your dresses</p>
              <h3 className="mt-0.5 font-serif text-xl text-stone-900">Build your fitting rail</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
              {sortedDresses.map((dress) => (
                <div key={dress.url} className={dressAnalyses[dress.url] ? "" : "pt-5"}>
                  {dressAnalyses[dress.url] ? (
                    <DressAnalysisCard
                      url={dress.url}
                      alt="Uploaded dress"
                      analysis={dressAnalyses[dress.url]}
                      initialAnalysisOpen={newlyAnalyzedDressUrl === dress.url}
                      onSelect={() => startLook(dress.url)}
                      actionLabel="Preview this dress"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startLook(dress.url)}
                      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-stone-100 text-left ring-offset-2 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-400"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={dress.url} alt="Uploaded dress" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      <span className="absolute inset-x-2 bottom-2 rounded-xl bg-stone-900/90 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100">
                        Preview this dress
                      </span>
                    </button>
                  )}
                </div>
              ))}
              
              <div className="pt-5">
                <div className="aspect-[3/4] w-full">
                  <DressDropzone
                  variant="catalog"
                  folder="user-dresses/bride"
                  label="Add a dress"
                  askColorPalette
                  paletteOptions={event.color_palette}
                  onUploaded={async (url, path, meta) => {
                    const dressObj: StoredDress = {
                      url,
                      storage_path: path ?? null,
                      primary_hex: meta?.primaryHex ?? null,
                      color_name: meta?.colorName ?? null,
                    };

                    addDress(dressObj);
                    setNewlyAnalyzedDressUrl(url);
                    if (dressObj.primary_hex && skinToneHex && hairToneHex && undertone) {
                      const profile: YouCamProfile = { skinHex: skinToneHex, hairHex: hairToneHex, undertone };
                      setDressAnalyses((current) => ({ ...current, [url]: analyzeDressWithSkinAndHair(dressObj.primary_hex!, profile) }));
                    }

                    if (path) {
                      try {
                        const resp = await fetch(`/api/participants/${brideParticipantId}/dresses`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            storage_path: path,
                            primary_hex: dressObj.primary_hex,
                            color_name: dressObj.color_name,
                          }),
                        });
                        const json = await resp.json();
                        if (!resp.ok) {
                          console.error("Failed to save participant dress", json.error ?? json);
                        }
                      } catch (err) {
                        console.error("Failed to save participant dress", err);
                      }
                    }
                  }}
                  />
                </div>
              </div>
            </div>

            {!dresses.length && (
              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-stone-500">
                <ImagePlus size={14} className="text-rose-500" /> Add your first dress to unlock a preview.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && <p className="mt-5 rounded-xl border border-red-100 bg-red-50/80 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      {/* Saved Previews Lookbook */}
      {looks.length > (state === "preview" ? 1 : 0) && (
        <div className="mt-10 border-t border-stone-200/60 pt-6">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-stone-400">
            Your lookbook · {looks.length} previews
          </p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {looks.map(
              (look) =>
                look.vto_render_url && (
                  <button
                    key={look.id}
                    type="button"
                    onClick={() => { setActiveLookId(look.id); setState("preview"); }}
                    className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100 transition hover:border-rose-300"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={look.vto_render_url} alt="Saved bridal look" className="h-full w-full object-cover" />
                  </button>
                )
            )}
          </div>
        </div>
      )}
    </section>
  );
}
