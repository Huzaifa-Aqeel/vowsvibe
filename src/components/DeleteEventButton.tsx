"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Deleting an event permanently removes every photo, dress, and rendered try-on tied to
 * it — the bride's own look(s) and every bridesmaid's uploads — via
 * DELETE /api/events/[eventId]. This is now the ONLY place media gets deleted; confirming
 * a look no longer deletes anyone's source photo. Requires typing the event title to
 * guard against an accidental tap, since this cannot be undone.
 */
export function DeleteEventButton({
  eventId,
  eventTitle,
  variant = "default",
  stayOnPage = false,
}: {
  eventId: string;
  eventTitle: string;
  /** "icon" renders a small circular trigger meant to sit in the corner of an event card. */
  variant?: "default" | "icon";
  /** Skip the redirect to /dashboard and just refresh in place — for when this is already rendered on the dashboard's event list. */
  stayOnPage?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete this event");
      if (stayOnPage) {
        setOpen(false);
        router.refresh();
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (!open) {
    if (variant === "icon") {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Delete event"
          aria-label={`Delete ${eventTitle}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/90 text-neutral-400 shadow-sm backdrop-blur transition hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={14} />
        </button>
      );
    }
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-red-200 text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} /> Delete event
      </Button>
    );
  }

  const canDelete = confirmText.trim().toLowerCase() === eventTitle.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Card className="w-full max-w-md border-red-100 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={18} />
            <h3 className="font-serif text-lg">Delete &ldquo;{eventTitle}&rdquo;?</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirmText("");
              setError(null);
            }}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-neutral-600">
          This permanently deletes the event, every bridesmaid&apos;s photo, dress, and try-on render, and your own bridal looks. This cannot be undone.
        </p>

        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Type <span className="font-semibold text-neutral-700">{eventTitle}</span> to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
          placeholder={eventTitle}
          autoFocus
        />

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              setOpen(false);
              setConfirmText("");
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 bg-red-600 text-white hover:bg-red-700"
            onClick={handleDelete}
            disabled={!canDelete || busy}
          >
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
            Delete permanently
          </Button>
        </div>
      </Card>
    </div>
  );
}
