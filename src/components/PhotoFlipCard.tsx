"use client";

import { useState } from "react";
import { ArrowLeftRight, Check, Sparkles } from "lucide-react";
import { DressDropzone } from "@/components/DressDropzone";
import { SelfieUpload, type SkinToneResult } from "@/components/SelfieUpload";
import { cn } from "@/lib/utils";

interface PhotoFlipCardProps {
  participantId: string;
  token?: string | null;
  photoFolder: string;
  photoUrl: string | null;
  onPhotoUploaded: (url: string, path?: string) => void;
  onPhotoCleared?: () => void;
  onSkinToneResult: (result: SkinToneResult) => void;
  skinToneCaptured?: boolean;
  className?: string;
}

/**
 * Two-side flip card for the studio's "01 · Your photo" step.
 *
 *  - Front: the full-body photo used for VTO — unchanged behavior, goes through
 *    DressDropzone → /api/upload → Supabase Storage, exactly as before.
 *  - Back: a selfie used only for skin-tone analysis — handled entirely by SelfieUpload,
 *    which never touches Storage or the DB; only the derived tone (returned by
 *    /api/participants/[id]/skin-tone) ever gets saved, on the participant row.
 *
 * The two photos are fully independent — she can upload the body photo, the selfie, or
 * both, in either order. Flipping the card never clears whichever side she already filled.
 */
export function PhotoFlipCard({
  participantId,
  token,
  photoFolder,
  photoUrl,
  onPhotoUploaded,
  onPhotoCleared,
  onSkinToneResult,
  skinToneCaptured,
  className,
}: PhotoFlipCardProps) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="[perspective:1200px]">
        <div
          className={cn(
            "relative aspect-[3/4] w-full transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]"
          )}
        >
          {/* Front — full-body VTO photo (stored in Supabase, unchanged) */}
          <div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-2xl border-2 border-dashed border-rose-200/70 bg-rose-50/20 [backface-visibility:hidden]",
              flipped ? "pointer-events-none" : "pointer-events-auto"
            )}
            aria-hidden={flipped}
          >
            <DressDropzone
              folder={photoFolder}
              currentUrl={photoUrl}
              label="Upload a clear, full-body photo"
              onUploaded={onPhotoUploaded}
              onClear={onPhotoCleared}
            />
          </div>

          {/* Back — selfie for skin tone (never stored) */}
          <div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-2xl border-2 border-dashed border-rose-200/70 bg-rose-50/20 [backface-visibility:hidden] [transform:rotateY(180deg)]",
              flipped ? "pointer-events-auto" : "pointer-events-none"
            )}
            aria-hidden={!flipped}
          >
            <SelfieUpload participantId={participantId} token={token} onResult={onSkinToneResult} />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex items-center justify-center gap-1.5 self-center rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-600 shadow-sm transition hover:bg-stone-50"
      >
        <ArrowLeftRight size={12} />
        {flipped ? "Back to full-body photo" : "Add a selfie for skin tone"}
      </button>

      <div className="flex items-center justify-center gap-4 text-[10px] font-medium text-stone-400">
        <span className={cn("flex items-center gap-1", photoUrl && "text-emerald-600")}>
          {photoUrl && <Check size={11} />} Full-body photo
        </span>
        <span className={cn("flex items-center gap-1", skinToneCaptured && "text-emerald-600")}>
          {skinToneCaptured ? <Check size={11} /> : <Sparkles size={11} />} Skin tone selfie
        </span>
      </div>
    </div>
  );
}
