import { InputHTMLAttributes, forwardRef, LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-blush-200 bg-white px-4 py-2.5 text-sm text-ink-900 placeholder:text-neutral-400 focus:border-blush-400 focus:outline-none focus:ring-2 focus:ring-blush-100",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink-900", className)} {...props} />;
}
