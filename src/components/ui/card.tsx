import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-blush-100 bg-white p-6 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "pending" | "processing" | "ready" | "confirmed";
}) {
  const styles: Record<string, string> = {
    neutral: "bg-neutral-100 text-neutral-600",
    pending: "bg-neutral-100 text-neutral-600",
    processing: "bg-amber-100 text-amber-700",
    ready: "bg-sky-100 text-sky-700",
    confirmed: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
