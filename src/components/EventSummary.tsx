"use client";

import { Palette, Scissors, Layers } from "lucide-react";
import type { EventRow } from "@/lib/types";
import { rankPaletteForUndertone, scoreSwatchForUndertone, type Undertone } from "@/lib/color/undertone";

interface EventSummaryProps {
  event: EventRow;
  /** Optional — when known, reorders palette pills best-match-first and badges the top
   *  matches. Purely a display nicety: every swatch stays visible and pickable either way. */
  undertone?: Undertone | null;
}

interface ColorPaletteItem {
  id?: string;
  hex: string;
  name: string;
  family?: string;
}

export default function EventSummary({ event, undertone }: EventSummaryProps) {
  const length = event.dress_length || "Floor-Length";
  const fabric = event.fabric_type || "Stretch Satin";
  const rawPaletteItems: ColorPaletteItem[] = event.color_palette ?? [];
  let paletteItems = [...rawPaletteItems];
  let scores: number[] = [];
  try {
    paletteItems = rankPaletteForUndertone(rawPaletteItems, undertone ?? null);
    scores = undertone ? paletteItems.map((color) => scoreSwatchForUndertone(color.hex, undertone)) : [];
  } catch (error) {
    // Strict color validation belongs in the shared utility. A malformed legacy swatch,
    // however, should leave the advisory palette in its original order—not crash a studio.
    console.error("Could not rank event palette", error);
  }
  // Badge only the swatches that score meaningfully above the palette's own average — on a
  // palette that's already all-warm or all-cool, nothing should stand out as "extra" suited.
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const spread = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;

  // Extract and capitalize unique color family names dynamically
  const uniqueFamilies = Array.from(
    new Set(
      paletteItems
        .map((item) => item.family)
        .filter((fam): fam is string => Boolean(fam && fam.trim()))
    )
  ).map((fam) => fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase());

  // Format the title (e.g. "Purple" or "Purple & Pink")
  const familyTitle = uniqueFamilies.length > 0 ? uniqueFamilies.join(" & ") : null;

  return (
    <div className="w-full my-8">
      <div className="relative overflow-hidden rounded-3xl border border-stone-200/90 bg-white/90 p-6 sm:p-8 backdrop-blur-xl shadow-xl shadow-stone-900/5 transition-all">
        {/* Top Decorative Gradient Accent Bar */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-300 via-amber-200 to-purple-400" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          {/* Header Section */}
          <div className="flex items-center">
            <div>
              <span className="inline-block text-[11px] font-bold uppercase tracking-[0.24em] text-rose-800/80">
                The Vision
              </span>
              <h3 className="font-serif text-xl sm:text-2xl font-medium text-stone-900">
                Bride&apos;s Styling Specs
              </h3>
            </div>
          </div>

          {/* Specs Details Section */}
          <div className="w-full lg:w-auto grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pt-5 lg:pt-0 border-t lg:border-t-0 border-stone-200/60">
            
            {/* Length Spec */}
            <div className="flex items-center gap-3.5 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-stone-600 shadow-xs">
                <Scissors className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                  Length
                </p>
                <p className="text-sm font-semibold text-stone-800 mt-0.5">{length}</p>
              </div>
            </div>

            {/* Fabric Spec */}
            <div className="flex items-center gap-3.5 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-stone-600 shadow-xs">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                  Fabric
                </p>
                <p className="text-sm font-semibold text-stone-800 mt-0.5">{fabric}</p>
              </div>
            </div>

            {/* Palette Spec (Dynamic JSON Swatches & Family Name) */}
            <div className="flex items-center gap-3.5 bg-stone-50/80 p-3.5 rounded-2xl border border-stone-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-stone-600 shadow-xs">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                  Palette {familyTitle ? `• ${familyTitle}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {paletteItems.map((color, idx) => {
                    const suitsHer = spread > 0.5 && scores[idx] > avgScore + spread * 0.25;
                    return (
                      <div
                        key={color.id || idx}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-2xs ${
                          suitsHer ? "border-rose-300 bg-rose-50 text-rose-800" : "border-stone-200/80 bg-white text-stone-700"
                        }`}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-black/10 shadow-xs shrink-0"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span>{color.name}</span>
                        {suitsHer && <span className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Suggested match</span>}
                      </div>
                    );
                  })}
                </div>
                {undertone && scores.length > 0 && (
                  <p className="mt-1.5 text-[9px] leading-4 text-stone-400">
                    Advisory styling order based on your camera-derived undertone.
                  </p>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
