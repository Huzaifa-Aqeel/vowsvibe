"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { DressAnalysisResult } from "@/lib/color/dress-analyzer";

export function DressAnalysisCard({
  url,
  alt,
  analysis,
  bridePaletteMatch,
  onSelect,
  disabled = false,
  initialAnalysisOpen = false,
  actionLabel = "Try this dress",
}: {
  url: string;
  alt: string;
  analysis: DressAnalysisResult;
  bridePaletteMatch?: "palette" | "family" | "same-family" | "custom" | null;
  onSelect: () => void;
  disabled?: boolean;
  initialAnalysisOpen?: boolean;
  actionLabel?: string;
}) {
  const [analysisOpen, setAnalysisOpen] = useState(initialAnalysisOpen);

  useEffect(() => {
    if (initialAnalysisOpen) {
      setAnalysisOpen(true);
    }
  }, [initialAnalysisOpen]);

  return (
    <div className="relative w-full pt-5">
      <div className="absolute left-0 top-0 text-[10px] font-semibold tracking-wide text-stone-500">{analysis.score}% match</div>
      <div
      className={`dress-analysis-card group relative aspect-[3/4] w-full select-none outline-none ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      tabIndex={disabled ? -1 : 0}
      aria-label={`${alt}. ${analysis.badgeLabel}. ${analysisOpen ? "Analysis open" : "View analysis"}`}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setAnalysisOpen(true);
        }
      }}
    >
      <div className={`dress-analysis-card__inner ${analysisOpen ? "is-flipped" : ""}`}>
        <div
          className="dress-analysis-card__face dress-analysis-card__front overflow-hidden rounded-2xl bg-stone-100 shadow-sm ring-offset-2 focus-visible:ring-2 focus-visible:ring-rose-400"
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) setAnalysisOpen(true);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-stone-900/90 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {actionLabel}
          </div>

        </div>

        <div
          className="dress-analysis-card__face dress-analysis-card__back rounded-2xl border border-rose-100/80 bg-white p-4 shadow-[0_18px_45px_-28px_rgba(28,25,23,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close dress analysis"
            title="Close analysis"
            className="absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              setAnalysisOpen(false);
            }}
          >
            <X size={15} />
          </button>

          <div className="flex h-full flex-col overflow-hidden pt-1">
            <div className="pr-8">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">Dress analysis</p>
              <div className="mt-1 flex items-start justify-between gap-3">
                <div>
                  <p className="font-serif text-xl leading-tight text-stone-900">{analysis.badgeLabel}</p>
                </div>
              </div>
            </div>

            {bridePaletteMatch === "palette" ? (
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                ✓ Bride&apos;s palette match
              </span>
            ) : bridePaletteMatch === "family" ? (
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-rose-50 px-2.5 py-1 text-[9px] font-semibold text-rose-700 ring-1 ring-rose-100">
                ✓ Bride&apos;s suggested palette family match
              </span>
            ) : bridePaletteMatch === "same-family" ? (
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-semibold text-amber-800 ring-1 ring-amber-100">
                Bride&apos;s palette family · distinct shade
              </span>
            ) : bridePaletteMatch === "custom" ? (
              <span className="mt-3 inline-flex w-fit items-center rounded-full bg-stone-100 px-2.5 py-1 text-[9px] font-semibold text-stone-700">
                Distinct from the bride&apos;s palette families
              </span>
            ) : null}

            {analysis.contextSuggestions && analysis.contextSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {analysis.contextSuggestions.map((suggestion) => (
                  <span key={suggestion} className="inline-flex items-center rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[9px] font-medium text-stone-600">
                    {suggestion}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">{analysis.explanationTitle}</p>
              <div className="space-y-2 text-[11px] leading-relaxed text-stone-600">
                {analysis.reasons.map((reason) => (
                  <p key={reason} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />
                    <span>{reason}</span>
                  </p>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled) onSelect();
              }}
              className="mt-3 w-full shrink-0 rounded-xl bg-stone-900 px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-sm transition hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
