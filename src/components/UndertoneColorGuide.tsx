"use client";

import type { Undertone } from "@/lib/color/undertone";
import { UNDERTONE_COLOR_GUIDE, type GuideSwatch } from "@/lib/color/undertone-guide";

const UNDERTONE_LABEL: Record<Undertone, string> = {
  warm: "Warm undertone",
  cool: "Cool undertone",
  neutral: "Neutral undertone",
};

/** Shown right after skin-tone analysis: a quick reference of flattering vs. washed-out shades. */
export function UndertoneColorGuide({ undertone }: { undertone: Undertone }) {
  const guide = UNDERTONE_COLOR_GUIDE[undertone];

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-rose-100/80 bg-white shadow-[0_18px_45px_-32px_rgba(28,25,23,0.35)]">
      <div className="h-1 bg-gradient-to-r from-amber-300 via-rose-400 to-purple-400" />
      <div className="p-4 sm:p-5">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-stone-600">
          {UNDERTONE_LABEL[undertone]}
        </span>
        <h3 className="mt-2.5 font-serif text-lg text-stone-900">Your color guide</h3>
        <p className="mt-1 text-[11px] leading-5 text-stone-500">
          A quick reference for dress shades that tend to work with your coloring.
        </p>

        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Flattering on you</p>
          <div className="mt-2.5 flex flex-wrap gap-3">
            {guide.flattering.map((swatch) => (
              <SwatchChip key={swatch.name} swatch={swatch} />
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Can wash you out</p>
          <div className="mt-2.5 flex flex-wrap gap-3">
            {guide.caution.map((swatch) => (
              <SwatchChip key={swatch.name} swatch={swatch} muted />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SwatchChip({ swatch, muted = false }: { swatch: GuideSwatch; muted?: boolean }) {
  return (
    <div className="flex w-14 flex-col items-center gap-1.5 text-center">
      <span
        className={`h-9 w-9 rounded-full shadow-sm ${muted ? "border border-stone-200 opacity-60" : "ring-1 ring-stone-200"}`}
        style={{ backgroundColor: swatch.hex }}
        aria-hidden="true"
      />
      <span className={`text-[9px] leading-tight ${muted ? "text-stone-400" : "text-stone-600"}`}>{swatch.name}</span>
    </div>
  );
}
