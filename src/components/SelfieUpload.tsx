"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Undertone } from "@/lib/color/undertone";
import { prepareImageUpload } from "@/lib/images/prepare-upload";

const CAMERA_KIT_SRC = "https://plugins-media.makeupar.com/v2.5-camera-kit/sdk.js";

interface CameraKitImage {
  image: string | Blob;
  width: number;
  height: number;
  phase: number;
}

interface CameraKitCapture {
  mode: string;
  images: CameraKitImage[];
}

interface CameraQuality {
  hasFace?: boolean;
  position?: "good" | "notgood" | "toosmall" | "outofboundary";
  frontal?: "good" | "notgood";
  lighting?: "good" | "ok" | "notgood";
}

interface CameraKitApi {
  init(args: Record<string, unknown>): void;
  openCameraKit(): void;
  close(): void;
  addEventListener(event: string, callback: (payload: unknown) => void): unknown;
  removeEventListener(id: unknown): void;
}

declare global {
  interface Window {
    YMK?: CameraKitApi;
    YMKAsyncInit?: () => void;
  }
}

let cameraKitPromise: Promise<CameraKitApi> | null = null;

function loadCameraKit(): Promise<CameraKitApi> {
  if (window.YMK) return Promise.resolve(window.YMK);
  if (cameraKitPromise) return cameraKitPromise;

  cameraKitPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Camera Kit took too long to load")), 15_000);
    const finish = () => {
      if (!window.YMK) return;
      window.clearTimeout(timeout);
      resolve(window.YMK);
    };

    // Perfect Corp requires this entry point to exist before its SDK is loaded.
    window.YMKAsyncInit = finish;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CAMERA_KIT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Camera Kit could not load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = CAMERA_KIT_SRC;
    script.async = true;
    script.onload = finish;
    script.onerror = () => {
      window.clearTimeout(timeout);
      cameraKitPromise = null;
      reject(new Error("Camera Kit could not load"));
    };
    document.head.appendChild(script);
  });

  return cameraKitPromise;
}

/**
 * On the second camera launch the SDK is already cached, so loadCameraKit() resolves before
 * React has committed the newly rendered mount point. Camera Kit then falls back to a tiny
 * canvas at document origin. Wait for the required container to exist and have layout before
 * calling YMK.init/openCameraKit.
 */
async function waitForCameraMount(): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const container = document.getElementById("YMK-module");
    // Presence after a paint is the important requirement. The surrounding responsive
    // card can legitimately measure below Camera Kit's 300px API minimum on narrow phones;
    // init() receives clamped dimensions below, so that is not a mount failure.
    if (container && container.isConnected) return container;
  }
  throw new Error("Camera mount point is not ready");
}

function dataUrlToFile(dataUrl: string): File {
  const [header, encoded] = dataUrl.split(",", 2);
  const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bytes = atob(encoded);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) buffer[i] = bytes.charCodeAt(i);
  return new File([buffer], "guided-selfie.jpg", { type: mime });
}

function qualityMessage(quality: CameraQuality | null) {
  if (!quality?.hasFace) return "Place your face inside the guide";
  if (quality.position === "toosmall") return "Move a little closer";
  if (quality.position === "outofboundary") return "Move back and center your face";
  if (quality.frontal === "notgood") return "Look straight at the camera";
  if (quality.lighting === "notgood") return "Move into soft, even light";
  return "Hold still — your selfie will capture automatically";
}

export interface SkinToneResult {
  hex: string;
  undertone: Undertone;
  depth: "fair" | "light" | "medium" | "deep" | null;
  hairHex: string | null;
  hairColorName: string | null;
}

interface SelfieUploadProps {
  participantId: string;
  token?: string | null;
  onResult: (result: SkinToneResult) => void;
  className?: string;
}

type Status = "idle" | "loading-camera" | "camera" | "fallback" | "analyzing" | "done" | "error";

/** A guided, quality-checked selfie that is analyzed in memory and never stored. */
export function SelfieUpload({ participantId, token, onResult, className }: SelfieUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [quality, setQuality] = useState<CameraQuality | null>(null);
  const [detectedUndertone, setDetectedUndertone] = useState<Undertone | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const listenerIdsRef = useRef<unknown[]>([]);
  const ymkRef = useRef<CameraKitApi | null>(null);
  // The SDK emits `closed` both when the user taps its cancel control and when we call
  // close() after a capture/failure. Only a user-initiated close should return to the
  // pristine start screen; programmatic closes must preserve analysis/fallback state.
  const programmaticCloseRef = useRef(false);

  const closeCamera = useCallback(() => {
    programmaticCloseRef.current = true;
    try { ymkRef.current?.close(); } catch { /* Camera may already be closed. */ }
    setQuality(null);
  }, []);

  const analyze = useCallback(async (file: File) => {
    setError(null);
    setStatus("analyzing");
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    objectUrlRef.current = localUrl;
    setPreviewUrl(localUrl);

    try {
      const preparedFile = await prepareImageUpload(file, 1600);
      const formData = new FormData();
      formData.append("file", preparedFile);
      if (token) formData.append("token", token);
      const res = await fetch(`/api/participants/${participantId}/skin-tone`, { method: "POST", body: formData });
      const json = await res.json();
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
  }, [participantId, token, onResult]);

  const showFallback = useCallback((message: string) => {
    closeCamera();
    setCameraNotice(message);
    setStatus("fallback");
  }, [closeCamera]);

  const openCamera = useCallback(async () => {
    // A fresh mount and init on every attempt makes reopening behave exactly like the
    // first launch, even after the user cancelled Perfect Corp's full camera experience.
    programmaticCloseRef.current = false;
    setError(null);
    setCameraNotice(null);
    setStatus("loading-camera");
    try {
      const ymk = await loadCameraKit();
      const container = await waitForCameraMount();
      ymkRef.current = ymk;
      for (const id of listenerIdsRef.current) ymk.removeEventListener(id);
      listenerIdsRef.current = [];

      listenerIdsRef.current.push(
        ymk.addEventListener("closed", () => {
          if (programmaticCloseRef.current) {
            programmaticCloseRef.current = false;
            return;
          }
          setQuality(null);
          setCameraNotice(null);
          setStatus("idle");
        }),
        ymk.addEventListener("faceQualityChanged", (payload) => setQuality(payload as CameraQuality)),
        ymk.addEventListener("cameraFailed", (payload) => {
          const code = typeof payload === "string" ? payload : (payload as { error?: string; code?: string } | null)?.error ?? (payload as { code?: string } | null)?.code;
          showFallback(code === "error_permission_denied"
            ? "Camera permission was denied. You can upload a selfie instead."
            : "We couldn't access a suitable camera. You can upload a selfie instead.");
        }),
        ymk.addEventListener("unsupportedResolution", () => showFallback("This camera's resolution isn't supported. You can upload a selfie instead.")),
        ymk.addEventListener("faceDetectionCaptured", (payload) => {
          const captured = payload as CameraKitCapture;
          const first = captured.images?.[0]?.image;
          if (!first) {
            showFallback("The camera didn't return a photo. Please upload one instead.");
            return;
          }
          const file = typeof first === "string"
            ? dataUrlToFile(first)
            : new File([first], "guided-selfie.jpg", { type: first.type || "image/jpeg" });
          closeCamera();
          void analyze(file);
        }),
      );

      const width = Math.max(300, Math.min(640, container.clientWidth));
      const height = Math.max(300, Math.min(720, container.clientHeight));
      ymk.init({
        faceDetectionMode: "shadefinder",
        imageFormat: "blob",
        language: "enu",
        width,
        height,
        countingDuration: 1200,
        hideFlipCameraButton: false,
      });
      ymk.openCameraKit();
      setStatus("camera");
    } catch {
      showFallback("The guided camera couldn't start. You can upload a selfie instead.");
    }
  }, [analyze, closeCamera, showFallback]);

  useEffect(() => () => {
    try {
      for (const id of listenerIdsRef.current) ymkRef.current?.removeEventListener(id);
      ymkRef.current?.close();
    } catch { /* Best-effort SDK cleanup. */ }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function retake() {
    closeCamera();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreviewUrl(null);
    setStatus("idle");
    setError(null);
    setCameraNotice(null);
    setDetectedUndertone(null);
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
              {status === "analyzing" ? <><Loader2 size={11} className="animate-spin" /> Reading your skin tone…</>
                : status === "done" && detectedUndertone ? `${detectedUndertone[0].toUpperCase()}${detectedUndertone.slice(1)} undertone detected`
                : status === "error" ? "Analysis failed" : ""}
            </span>
            <button type="button" onClick={retake} className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-stone-800 hover:bg-white">
              <RefreshCcw size={11} /> Retake
            </button>
          </div>
        </div>
      ) : status === "camera" || status === "loading-camera" ? (
        <div className="relative h-full min-h-[300px] w-full overflow-hidden rounded-xl bg-stone-950">
          <div id="YMK-module" className="h-full min-h-[300px] w-full min-w-0" />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-full bg-black/65 px-3 py-2 text-center text-[11px] font-medium text-white backdrop-blur-sm">
            {status === "loading-camera" ? "Starting your camera…" : qualityMessage(quality)}
          </div>
          <button type="button" onClick={() => showFallback("You can upload a selfie from your device instead.")} className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-bold text-stone-800 shadow">
            Upload instead
          </button>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl bg-white p-6 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-blush-50 text-blush-500"><Camera size={22} /></div>
          <p className="text-sm font-semibold text-stone-800">Take a guided skin-tone selfie</p>
          {cameraNotice && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-800">{cameraNotice}</p>}
          <div className="flex w-full flex-col gap-2.5">
            <button type="button" onClick={openCamera} className="flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-950">
              <Camera size={14} /> Open guided camera
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50">
              <ImagePlus size={14} /> Upload a selfie
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-600"><ShieldCheck size={12} className="text-emerald-600" /> Analyzed once and never saved</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void analyze(file); }} />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
