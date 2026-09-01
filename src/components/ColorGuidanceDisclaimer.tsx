"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, FlaskConical, Palette, ShieldCheck, Shirt } from "lucide-react";

const STORAGE_PREFIX = "vv-color-guidance-disclaimer:";

/**
 * Shown once per participant on this browser. It remains required until the participant
 * explicitly acknowledges it; opening the studio or refreshing never counts as consent.
 */
export function ColorGuidanceDisclaimer({ participantId }: { participantId: string }) {
  const [open, setOpen] = useState(false);
  const acknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${participantId}`;
    try {
      if (window.localStorage.getItem(key) === "acknowledged") return;
    } catch {
      // Persistent acknowledgement cannot be guaranteed when browser storage is disabled.
    }
    setOpen(true);
  }, [participantId]);

  function acknowledge() {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${participantId}`, "acknowledged");
    } catch {
      // Still allow the current studio session to continue when storage is unavailable.
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    acknowledgeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-stone-950/55 backdrop-blur-sm sm:p-5" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-guidance-title"
        aria-describedby="color-guidance-description"
        className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#fffdf9] shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-[2rem] sm:border sm:border-white/70"
      >
        <div className="h-1.5 shrink-0 bg-gradient-to-r from-amber-300 via-rose-400 to-purple-400" />
        <header className="relative shrink-0 border-b border-stone-200/70 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div>
            <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-700">
              Before you begin
            </span>
            <h2 id="color-guidance-title" className="mt-3 font-serif text-2xl leading-tight text-stone-900 sm:text-3xl">
              Personal color guidance, not a verdict
            </h2>
            <p id="color-guidance-description" className="mt-1.5 text-xs leading-5 text-stone-600 sm:text-sm sm:leading-6">
              We use your selfie to offer explainable styling suggestions. Here is what the result does—and does not—mean.
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7 sm:py-5">
          <div className="space-y-2.5">
            <GuidanceItem icon={Camera} title="YouCam color analysis">
              We use Perfect Corp&apos;s YouCam Skin Tone Analysis API to obtain representative skin and available hair-color values. Lighting, makeup, camera settings, and surroundings can still affect the result.
            </GuidanceItem>
            <GuidanceItem icon={FlaskConical} title="Color measurement">
              We convert YouCam&apos;s representative colors into CIE Lab, an established colorimetric space used to compare color consistently. This is styling analysis—not a skin diagnosis.
            </GuidanceItem>
            <GuidanceItem icon={Shirt} title="How dress analysis works">
              Dress colors are compared using undertone relationship, skin-to-dress lightness contrast, and color intensity, including available skin-to-hair contrast. The resulting score is a styling guide, not a probability or guarantee.
            </GuidanceItem>
            <GuidanceItem icon={Palette} title="Styling heuristics">
              Warm, cool, or neutral undertone labels and “Suggested match” colors are advisory product calculations. They are not scientifically validated rules for what will flatter you.
            </GuidanceItem>
            <GuidanceItem icon={ShieldCheck} title="Your selfie stays out of Vows &amp; Vibe storage">
              Vows &amp; Vibe sends the selfie to Perfect Corp for analysis but does not save the image in its database or Supabase Storage. Only the derived color values are retained.
            </GuidanceItem>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3.5 text-[11px] leading-5 text-amber-950">
            Fabric, venue lighting, accessories, makeup, and—most importantly—your preference can change how a color feels. Use the guidance to compare options, not to limit them.
          </div>
        </div>

        <footer className="shrink-0 border-t border-stone-200/80 bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_-24px_rgba(28,25,23,0.45)] sm:px-7 sm:pb-5 sm:pt-4">
          <button
            ref={acknowledgeRef}
            type="button"
            onClick={acknowledge}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-5 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
          >
            <Check size={16} /> I understand — show my studio
          </button>
          <p className="mt-2 text-center text-[10px] text-stone-500">After you acknowledge this, it will not appear again for this studio on this browser.</p>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function GuidanceItem({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Camera;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-stone-200/70 bg-white p-3.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700">
        <Icon size={17} />
      </div>
      <div>
        <h3 className="text-xs font-bold text-stone-900">{title}</h3>
        <p className="mt-1 text-[11px] leading-[1.55] text-stone-600">{children}</p>
      </div>
    </div>
  );
}
