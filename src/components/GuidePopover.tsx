"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";

/**
 * A small "?" button that reveals a short explainer.
 *
 * "popover" (default) floats the panel above surrounding content — fine in open layouts,
 * but it clips against a narrow, scrolling container (e.g. a sidebar). "inline" instead
 * expands the panel in normal document flow, right where the button sits, so it can never
 * be clipped by an ancestor's overflow. In "inline" mode the button itself is positioned
 * by `buttonClassName` (typically `absolute`, anchored to a `relative` ancestor you provide)
 * so the expanding panel below it isn't squeezed into the button's own flex/grid cell.
 */
export function GuidePopover({
  title,
  children,
  align = "right",
  label,
  variant = "popover",
  buttonClassName,
}: {
  title: string;
  children: ReactNode;
  align?: "left" | "right";
  label?: string;
  variant?: "popover" | "inline";
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={variant === "inline" ? "contents" : "relative shrink-0"} ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label ?? `How ${title.toLowerCase()}`}
        aria-expanded={open}
        className={buttonClassName ?? "grid h-7 w-7 place-items-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"}
      >
        <HelpCircle size={14} />
      </button>
      {open && (variant === "inline" ? (
        <div role="region" aria-label={title} className="mt-2.5 w-full rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5">
          <GuidePanelBody title={title} onClose={() => setOpen(false)}>{children}</GuidePanelBody>
        </div>
      ) : (
        <div
          role="dialog"
          aria-label={title}
          className={`absolute top-full z-50 mt-2 w-72 max-w-[min(20rem,85vw)] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <GuidePanelBody title={title} onClose={() => setOpen(false)}>{children}</GuidePanelBody>
        </div>
      ))}
    </div>
  );
}

function GuidePanelBody({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-serif text-sm leading-tight text-stone-900">{title}</h4>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guide"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          <X size={13} />
        </button>
      </div>
      <div className="mt-2.5 space-y-2">{children}</div>
    </>
  );
}

/** A single labeled row inside a GuidePopover, with a color dot matching the badge it explains. */
export function GuideRow({ dot, label, children }: { dot: string; label: string; children: ReactNode }) {
  return (
    <p className="flex gap-2 text-[11px] leading-5 text-stone-600">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span>
        <span className="font-semibold text-stone-800">{label}:</span> {children}
      </span>
    </p>
  );
}
