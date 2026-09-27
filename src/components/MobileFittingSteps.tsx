"use client";
import { isMobileRuntime } from "@/lib/platform/runtime";

export function MobileFittingSteps() {
  if (!isMobileRuntime()) return null;
  return <nav aria-label="Fitting room steps" className="mobile-fitting-steps">
    {[["Your photo", "data-fitting-photo"], ["Choose a dress", "data-fitting-dresses"]].map(([label, attribute], index) => <button key={attribute} type="button" onClick={() => document.querySelector(`[${attribute}]`)?.scrollIntoView({ block: "start" })}>{index + 1} · {label}</button>)}
  </nav>;
}
