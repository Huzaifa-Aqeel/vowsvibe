"use client";

import { useCallback, useRef, useState } from "react";
import { Camera, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Undertone } from "@/lib/color/undertone";
import { prepareImageUpload } from "@/lib/images/prepare-upload";

export interface SkinToneResult {
  hex: string;
  undertone: Undertone;
  depth: "fair" | "light" | "medium" | "deep" | null;
  /** From the same YouCam skin-tone-analysis task/response as `hex` — one selfie, one call,
   *  both colors come back together. Null only if the model couldn't read hair in the shot. */
  hairHex: string | null;
  hairColorName: string | null;
}

interface SelfieUploadProps {
  participantId: string;
  token?: string | null;
  onResult: (result: SkinToneResult) => void;
  className?: string;
}

/**
 * The "selfie" face of the photo flip card. Deliberately does NOT go through DressDropzone
 * / /api/upload — unlike the full-body VTO photo, this image is never written to Supabase
 * Storage and never saved to a DB column. It's read into a local blob URL purely so she can
 * see what she just took, sent exactly once as multipart bytes to
 * /api/participants/[id]/skin-tone, and then dropped — only the derived skin_tone_hex /
 * undertone / depth that route returns ever gets persisted (by the server, on the
 * participant row).
 */
export function SelfieUpload({ participantId, token, onResult, className }: SelfieUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [detectedUndertone, setDetectedUndertone] = useState<Undertone | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const analyze = useCallback(
    async (file: File) => {
      setError(null);
      setStatus("analyzing");

      // Local-only preview so she can see the selfie she just took. Revoke any prior blob
      // URL first so retakes don't leak memory.
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const localUrl = URL.createObjectURL(file);
      objectUrlRef.current = localUrl;
      setPreviewUrl(localUrl);

      try {
        const preparedFile = await prepareImageUpload(file, 1600);
        const formData = new FormData();
        formData.append("file", preparedFile);
        if (token) formData.append("token", token);
        const res = await fetch(`/api/participants/${participantId}/skin-tone`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        console.log("SKIN TONE API RESPONSE:", json);
console.log("DETECTED UNDERTONE:", json.undertone);
        if (!res.ok || json.status !== "success") {
          throw new Error(json.error ?? "Could not read your skin tone from that selfie");
        }
setStatus("done");
setDetectedUndertone(json.undertone);

onResult({
  hex: json.skin_tone_hex,
  undertone: json.undertone,
  depth: json.depth ?? null,
  hairHex: json.hair_tone_hex ?? null,
  hairColorName: json.hair_color_name ?? null,
});
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not analyze that selfie");
      }
    },
    [participantId, token, onResult]
  );

  function retake() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreviewUrl(null);
    setStatus("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      {previewUrl ? (
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-blush-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Your selfie (not saved)" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-white">
{status === "analyzing"
  ? "Reading your skin tone…"
  : status === "done" && detectedUndertone
  ? `${detectedUndertone[0].toUpperCase()}${detectedUndertone.slice(1)} undertone detected`
  : status === "error"
  ? "Analysis failed"
  : ""}
            </span>
            <button
              type="button"
              onClick={retake}
              className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-stone-800 hover:bg-white"
            >
              <RefreshCcw size={11} /> Retake
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blush-200 bg-white text-center text-sm transition-colors hover:bg-blush-50/50"
        >
          <Camera className="text-blush-400" size={22} />
          <span className="px-6 text-neutral-500">Take or upload a selfie</span>
          <span className="px-6 text-[10px] text-neutral-400">Used only to read your skin tone — never saved</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) analyze(file);
        }}
      />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
