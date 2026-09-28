"use client";
import { clientFetch as fetch, isMobileRuntime } from "@/lib/platform/runtime";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { UploadCloud, Loader2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SwatchColor } from "@/lib/types";
import { prepareImageUpload } from "@/lib/images/prepare-upload";
function renderColorPrompt(content: ReactNode) {
  return isMobileRuntime() ? createPortal(content, document.body) : content;
}

export interface DressColorMeta {
  primaryHex: string | null;
  colorName: string | null;
  family?: string | null;
}

interface DressDropzoneProps {
  folder: string;
  onUploaded: (url: string, path?: string, meta?: DressColorMeta) => void | Promise<void>;
  participantAuth?: { participantId: string; token?: string };
  currentUrl?: string | null;
  onClear?: () => void | Promise<void>;
  label?: string;
  className?: string;
  variant?: "default" | "catalog";
  /**
   * When enabled, upload the dress image first, then ask the user for its color palette.
   * The image is never sent to a vision model. The typed palette name is resolved by a
   * text-only color resolver to a canonical name + representative hex.
   */
  askColorPalette?: boolean;
  /** Optional event palette. Exact name matches reuse the bride's exact swatch hex. */
  paletteOptions?: SwatchColor[];
}

export function DressDropzone({
  folder,
  onUploaded,
  currentUrl,
  onClear,
  label = "Drag & drop an image, or tap to choose",
  className,
  variant = "default",
  askColorPalette = false,
  paletteOptions = [],
  participantAuth,
}: DressDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isResolvingColor, setIsResolvingColor] = useState(false);
  const [colorPromptOpen, setColorPromptOpen] = useState(false);
  const [colorLabel, setColorLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(currentUrl ?? null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => setUploadedUrl(currentUrl ?? null), [currentUrl]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const resetTransient = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setUploadedUrl(null);
    setUploadedPath(null);
    setColorPromptOpen(false);
    setColorLabel("");
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setIsUploading(true);
      setColorPromptOpen(false);
      setColorLabel("");

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const localUrl = URL.createObjectURL(file);
      objectUrlRef.current = localUrl;
      setUploadedUrl(localUrl);

      try {
        const preparedFile = await prepareImageUpload(file);
        const formData = new FormData();
        formData.append("file", preparedFile);
        formData.append("folder", folder);
        if (participantAuth) {
          formData.append("participant_id", participantAuth.participantId);
          if (participantAuth.token) formData.append("token", participantAuth.token);
        }
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed");

        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setUploadedUrl(typeof json.url === "string" ? json.url : null);
        setUploadedPath(typeof json.path === "string" ? json.path : null);

        if (askColorPalette) {
          setColorPromptOpen(true);
          return;
        }

        await onUploaded(json.url, json.path);
        setUploadedUrl(null);
        setUploadedPath(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        resetTransient();
      } finally {
        setIsUploading(false);
      }
    },
    [askColorPalette, folder, onUploaded, participantAuth, resetTransient]
  );

  async function resolveColor() {
    if (!uploadedUrl || !uploadedPath || !colorLabel.trim()) return;
    setError(null);
    setIsResolvingColor(true);
    try {
      const res = await fetch("/api/dresses/resolve-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: participantAuth?.participantId,
          token: participantAuth?.token,
          colorLabel: colorLabel.trim(),
          palette: paletteOptions.map((swatch) => ({ name: swatch.name, hex: swatch.hex, family: swatch.family })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not resolve that color palette");

      await onUploaded(uploadedUrl, uploadedPath, {
        primaryHex: typeof json.primaryHex === "string" ? json.primaryHex : null,
        colorName: colorLabel.trim(),
        family: typeof json.family === "string" ? json.family : null,
      });
      setColorPromptOpen(false);
      setColorLabel("");
      setUploadedUrl(null);
      setUploadedPath(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve that color palette");
    } finally {
      setIsResolvingColor(false);
    }
  }

  const displayUrl = uploadedUrl ?? currentUrl;

  return (
    <div className={cn("dress-dropzone h-full w-full", className)}>
      {displayUrl ? (
        <div className="relative h-full w-full overflow-hidden rounded-xl border border-blush-200 bg-stone-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayUrl} alt="Uploaded dress" className="h-full w-full object-cover" />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-900/25">
              <div className="rounded-full bg-black/65 px-3 py-2 text-[10px] font-medium text-white">
                <Loader2 className="mr-1.5 inline animate-spin" size={12} /> Uploading…
              </div>
            </div>
          )}

          {colorPromptOpen && !isUploading && renderColorPrompt(
            <div role="dialog" aria-modal="true" aria-label="Choose the dress color" className={`${isMobileRuntime() ? "mobile-color-prompt" : "absolute inset-x-2 bottom-2"} rounded-2xl border border-white/20 bg-black/90 p-3 text-white shadow-xl backdrop-blur-md`}>
              <div className="mb-2">
                <p className="text-[11px] font-semibold">Which color palette is this dress?</p>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="Dress color palette"
                  autoFocus
                  value={colorLabel}
                  onChange={(e) => setColorLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void resolveColor();
                    }
                  }}
                  placeholder="e.g. Royal Blue"
                  className="h-9 min-w-0 flex-1 border-white/20 bg-white/95 text-[11px] text-stone-900 placeholder:text-stone-400"
                  disabled={isResolvingColor}
                />
                <Button
                  type="button"
                  onClick={() => void resolveColor()}
                  disabled={!colorLabel.trim() || isResolvingColor}
                  className="h-9 shrink-0 rounded-lg bg-white px-3 text-[10px] font-bold uppercase tracking-wide text-stone-900 hover:bg-stone-100"
                >
                  {isResolvingColor ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save
                </Button>
              </div>
              {paletteOptions.length > 0 && (
                <p className="mt-2 text-[9px] text-white/70">Use the same palette name as the bride when it matches.</p>
              )}
              {isMobileRuntime() && <button type="button" className="mt-2 min-h-11 w-full text-xs" onClick={resetTransient}>Cancel upload</button>}
              {isMobileRuntime() && error && <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p>}
            </div>
          )}

          {onClear && !isUploading && !colorPromptOpen && (
            <button
              type="button"
              aria-label="Remove photo"
              onClick={async () => {
                setError(null); setIsUploading(true);
                try { await onClear(); resetTransient(); }
                catch (err) { setError(err instanceof Error ? err.message : "Could not remove your photo. Try again."); }
                finally { setIsUploading(false); }
              }}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed text-center text-sm transition-colors",
            variant === "catalog" ? "aspect-[3/4] rounded-2xl" : "rounded-xl",
            isDragging ? "border-blush-500 bg-blush-50" : "border-blush-200 bg-white hover:bg-blush-50/50"
          )}
        >
          {isUploading ? <Loader2 className="animate-spin text-blush-500" size={22} /> : <UploadCloud className="text-blush-400" size={22} />}
          <span className="px-6 text-neutral-500">{isUploading ? "Uploading…" : label}</span>
          <input
            ref={inputRef}
            type="file"
            aria-label={label}
            accept="image/*"
            capture={isMobileRuntime() ? undefined : "environment"}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
