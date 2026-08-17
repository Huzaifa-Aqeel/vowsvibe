"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  GripVertical,
  Minus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { SuggestionTools } from "@/components/SuggestionTools";
import type { EventRow, LineupPosition, ParticipantRow, SwatchColor } from "@/lib/types";
import { matchesPaletteMode } from "@/lib/color/palette-matching";

const FABRIC_CDN = "https://cdn.jsdelivr.net/npm/fabric@6.7.1/dist/index.min.js";
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;
const SCALE_STEP = 0.1;

interface FabricImageLike {
  participantId?: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  opacity: number;
  filters?: unknown[];
  set: (props: Record<string, unknown>) => void;
  setCoords: () => void;
  getScaledWidth: () => number;
  getScaledHeight: () => number;
  applyFilters?: () => void;
  selectable?: boolean;
  hasControls?: boolean;
  hoverCursor?: string;
}

interface FabricCanvasLike {
  add: (...objects: FabricImageLike[]) => void;
  remove: (...objects: FabricImageLike[]) => void;
  getObjects: () => FabricImageLike[];
  moveObjectTo: (object: FabricImageLike, index: number) => boolean;
  discardActiveObject?: () => void;
  setActiveObject: (object: FabricImageLike | null) => boolean;
  getActiveObject: () => FabricImageLike | null;
  bringObjectForward: (object: FabricImageLike, intersecting?: boolean) => boolean;
  sendObjectBackwards: (object: FabricImageLike, intersecting?: boolean) => boolean;
  bringObjectToFront: (object: FabricImageLike) => boolean;
  sendObjectToBack: (object: FabricImageLike) => boolean;
  requestRenderAll: () => void;
  dispose: () => void;
  on: (event: string, handler: (event: { target?: FabricImageLike }) => void) => void;
  setDimensions: (dims: { width: number; height: number }) => void;
  defaultCursor?: string;
  hoverCursor?: string;
  getWidth: () => number;
  getHeight: () => number;
  toDataURL: (options?: { format?: string; quality?: number; multiplier?: number }) => string;
}

interface FabricNamespace {
  Canvas: new (el: HTMLCanvasElement, options?: Record<string, unknown>) => FabricCanvasLike;
  FabricImage: { fromURL: (url: string, options?: Record<string, unknown>) => Promise<FabricImageLike> };
  filters: { Grayscale: new () => unknown };
}

declare global {
  interface Window {
    fabric?: FabricNamespace;
  }
}

function loadFabric(): Promise<FabricNamespace> {
  if (window.fabric) return Promise.resolve(window.fabric);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-fabric-cdn="${FABRIC_CDN}"]`);
    const script = existing ?? document.createElement("script");
    const finish = () => window.fabric ? resolve(window.fabric) : reject(new Error("Fabric.js did not expose a browser global"));
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Fabric.js")), { once: true });
    if (!existing) {
      script.src = FABRIC_CDN;
      script.async = true;
      script.dataset.fabricCdn = FABRIC_CDN;
      document.head.appendChild(script);
    }
  });
}

interface Props {
  event: EventRow;
  participants: ParticipantRow[];
  initialPositions: Record<string, LineupPosition>;
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 10) / 10));
}

function matchesSwatch(
  participant: Pick<ParticipantRow, "confirmed_dress_primary_hex" | "confirmed_dress_color_name">,
  swatch: SwatchColor,
  palette: SwatchColor[],
  mode: "palette" | "family" | "other",
) {
  return matchesPaletteMode(
    participant.confirmed_dress_color_name,
    participant.confirmed_dress_primary_hex ?? null,
    palette,
    swatch,
    mode,
  );
}

function defaultPosition(participant: ParticipantRow, index: number, participants: ParticipantRow[]): LineupPosition {
  if (participant.role === "bride") {
    return { participant_id: participant.id, x: 0.5, y: 0.07, scale: 1, z_index: 100, hidden: false };
  }

  const bridesmaids = participants.filter((p) => p.role === "bridesmaid");
  const brideIndex = participants.findIndex((p) => p.role === "bride");
  const ordinal = Math.max(0, bridesmaids.findIndex((p) => p.id === participant.id));
  const side = ordinal % 2 === 0 ? 1 : -1;
  const distance = 0.12 + Math.floor(ordinal / 2) * 0.115;
  const x = Math.max(0.06, Math.min(0.94, 0.5 + side * distance));
  return { participant_id: participant.id, x, y: 0.07, scale: 1, z_index: brideIndex >= 0 ? 50 - index : 50 - ordinal, hidden: false };
}

export function LineupCanvas({ event, participants, initialPositions }: Props) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<FabricCanvasLike | null>(null);
  const objectMapRef = useRef(new Map<string, FabricImageLike>());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const swatchRefs = useRef(new Map<string, HTMLButtonElement>());
  const geometryRef = useRef(new Map<string, { x: number; y: number; width: number; height: number }>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [selectedScale, setSelectedScale] = useState(1);
  const [positions, setPositions] = useState<Record<string, LineupPosition>>(initialPositions);
  const [activeSwatch, setActiveSwatch] = useState<string | null>(null);
  const [paletteMatchMode, setPaletteMatchMode] = useState<"palette" | "family" | "other">("palette");
  const [geometryVersion, setGeometryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const suggestionModeRef = useRef(false);
  const [scaleMode, setScaleMode] = useState(false);
  const scaleModeRef = useRef(false);

  useEffect(() => {
    scaleModeRef.current = scaleMode;
  }, [scaleMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "s") return;

      // Suggestions mode has priority; do not change canvas interaction while it is active.
      if (suggestionModeRef.current) return;

      // Never hijack typing in inputs, textareas, selects, or content-editable elements.
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      setScaleMode((current) => !current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const confirmedParticipants = useMemo(
    () => participants.filter((p) => p.status === "confirmed" && p.cutout_url),
    [participants],
  );

  const palette = useMemo(() => event.color_palette ?? [], [event.color_palette]);
  const selectedParticipant = selectedId ? confirmedParticipants.find((p) => p.id === selectedId) ?? null : null;
  const bride = confirmedParticipants.find((p) => p.role === "bride") ?? null;

const filteredIds = useMemo(() => {
  if (!activeSwatch) return null;

  const swatch = palette.find((item) => item.id === activeSwatch);
  if (!swatch) return null;

  const filtered = new Set(
    confirmedParticipants
      .filter((p) => p.role === "bridesmaid")
      .filter((p) => matchesSwatch(p, swatch, palette, paletteMatchMode))
      .map((p) => p.id)
  );

  console.log("[Palette Filter]", {
    mode: paletteMatchMode,
    swatch: swatch.name,
    count: filtered.size,
    participantIds: [...filtered],
  });

  return filtered;
}, [
  activeSwatch,
  confirmedParticipants,
  palette,
  paletteMatchMode,
]);

  const refreshGeometry = () => setGeometryVersion((v) => v + 1);

  function syncSuggestionMode(nextEnabled: boolean) {
    suggestionModeRef.current = nextEnabled;
    setSuggestionMode(nextEnabled);
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((object) => {
      object.set({
        selectable: !nextEnabled,
        hasControls: false,
        hoverCursor: nextEnabled ? "pointer" : "move",
      });
    });
    canvas.defaultCursor = nextEnabled ? "default" : "default";
    canvas.hoverCursor = nextEnabled ? "default" : "default";
    if (nextEnabled) {
      canvas.discardActiveObject?.();
      syncSelectionPop(null);
      setSelectedId(null);
    }
    canvas.requestRenderAll();
    refreshGeometry();
  }

  function syncSelectionPop(nextId: string | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const oldId = selectedIdRef.current;
    const resetObject = oldId ? objectMapRef.current.get(oldId) : null;
    if (resetObject) {
      const base = (canvas.getHeight() * 0.82) / Math.max(1, resetObject.height);
      const savedScale = positions[oldId!]?.scale ?? 1;
      resetObject.set({ scaleX: base * savedScale, scaleY: base * savedScale });
      resetObject.setCoords();
    }
    const nextObject = nextId ? objectMapRef.current.get(nextId) : null;
    if (nextId && nextObject) {
      const base = (canvas.getHeight() * 0.82) / Math.max(1, nextObject.height);
      const savedScale = positions[nextId]?.scale ?? 1;
      nextObject.set({ scaleX: base * savedScale * 1.02, scaleY: base * savedScale * 1.02 });
      nextObject.setCoords();
    }
    selectedIdRef.current = nextId;
    canvas.requestRenderAll();
  }

  useEffect(() => {
    let cancelled = false;
    const objectMap = objectMapRef.current;
    let resizeObserver: ResizeObserver | null = null;

    async function boot() {
      try {
        const fabric = await loadFabric();
        if (cancelled || !canvasElementRef.current || canvasRef.current) return;

        const parent = canvasElementRef.current.parentElement;
        const width = parent?.clientWidth ?? 1100;
        const height = Math.max(460, Math.round(width * 0.53));
        canvasElementRef.current.width = width;
        canvasElementRef.current.height = height;

        const canvas = new fabric.Canvas(canvasElementRef.current, {
          selection: false,
          preserveObjectStacking: true,
          enableRetinaScaling: true,
          fireRightClick: false,
        });
        canvasRef.current = canvas;

        const fallbackPositions = new Map<string, LineupPosition>();
        confirmedParticipants.forEach((participant) => {
          const index = confirmedParticipants.findIndex((candidate) => candidate.id === participant.id);
          fallbackPositions.set(participant.id, positions[participant.id] ?? defaultPosition(participant, index, confirmedParticipants));
        });

        await Promise.all(
          confirmedParticipants.map(async (participant) => {
            if (!participant.cutout_url) return;
            const image = await fabric.FabricImage.fromURL(participant.cutout_url, { crossOrigin: "anonymous" });
            if (cancelled) return;
            const position = fallbackPositions.get(participant.id)!;
            const baseScale = (height * 0.82) / Math.max(1, image.height);
            const scale = baseScale * clampScale(position.scale || 1);
            image.set({
              participantId: participant.id,
              originX: "center",
              originY: "bottom",
              left: width * position.x,
              top: height * (1 - position.y),
              scaleX: scale,
              scaleY: scale,
              selectable: !suggestionModeRef.current,
              evented: true,
              hasControls: false,
              hasBorders: false,
              hoverCursor: "move",
              lockRotation: true,
              cornerColor: "transparent",
              borderColor: "transparent",
              shadow: { color: "rgba(28,25,23,0.25)", blur: 15, offsetX: 0, offsetY: 15 },
            });
            canvas.add(image);
            objectMapRef.current.set(participant.id, image);
            geometryRef.current.set(participant.id, {
              x: image.left,
              y: image.top,
              width: image.getScaledWidth(),
              height: image.getScaledHeight(),
            });
            if (position.hidden) image.set({ opacity: 0 });
          }),
        );

        const reorder = () => {
          const objects = [...canvas.getObjects()].sort((a, b) => {
            const pa = positions[a.participantId ?? ""]?.z_index ?? 0;
            const pb = positions[b.participantId ?? ""]?.z_index ?? 0;
            return pa - pb;
          });
          objects.forEach((object, index) => canvas.moveObjectTo(object, index));
          canvas.requestRenderAll();
        };
        reorder();

        const select = (object?: FabricImageLike) => {
          const id = object?.participantId ?? null;
          syncSelectionPop(id);
          setSelectedId(id);
          setSelectedScale(id ? clampScale(positions[id]?.scale ?? 1) : 1);
          if (object) canvas.setActiveObject(object);
          refreshGeometry();
        };
        canvas.on("mouse:down", (e) => {
          const target = e.target;
          if (!target?.participantId) return;

          const id = target.participantId;

          // Suggestions mode keeps its existing participant-targeting behavior.
          if (suggestionModeRef.current) {
            if (id === bride?.id) {
              syncSelectionPop(null);
              setSelectedId(null);
              refreshGeometry();
              return;
            }
            syncSelectionPop(id);
            selectedIdRef.current = id;
            setSelectedId(id);
            setSelectedScale(clampScale(positions[id]?.scale ?? 1));
            refreshGeometry();
            return;
          }

          // Scale mode only establishes the selected participant. Fabric continues to
          // handle normal dragging and object selection as before.
          if (scaleModeRef.current) {
            selectedIdRef.current = id;
            setSelectedId(id);
            setSelectedScale(clampScale(positions[id]?.scale ?? 1));
            refreshGeometry();
          }
        });
        canvas.on("selection:created", (e) => select(e.target));
        canvas.on("selection:updated", (e) => select(e.target));
        canvas.on("selection:cleared", () => {
          syncSelectionPop(null);
          setSelectedId(null);
          refreshGeometry();
        });
        canvas.on("object:moving", (e) => {
          if (!e.target?.participantId) return;
          geometryRef.current.set(e.target.participantId, {
            x: e.target.left,
            y: e.target.top,
            width: e.target.getScaledWidth(),
            height: e.target.getScaledHeight(),
          });
          refreshGeometry();
        });
        canvas.on("object:modified", (e) => {
          if (!e.target?.participantId) return;
          geometryRef.current.set(e.target.participantId, {
            x: e.target.left,
            y: e.target.top,
            width: e.target.getScaledWidth(),
            height: e.target.getScaledHeight(),
          });
          const next = { ...(positions[e.target.participantId] ?? { participant_id: e.target.participantId, x: 0.5, y: 0.07, scale: 1, z_index: 0, hidden: false }) };
          next.x = e.target.left / canvas.getWidth();
          next.y = 1 - e.target.top / canvas.getHeight();
          setPositions((current) => ({ ...current, [e.target!.participantId!]: next }));
          refreshGeometry();
        });

        const resize = () => {
          const p = canvasElementRef.current?.parentElement;
          if (!p) return;
          const nextWidth = p.clientWidth;
          const nextHeight = Math.max(460, Math.round(nextWidth * 0.53));
          const oldWidth = canvas.getWidth();
          const oldHeight = canvas.getHeight();
          if (!oldWidth || !oldHeight) return;
          canvas.setDimensions({ width: nextWidth, height: nextHeight });
          canvas.getObjects().forEach((object) => {
            object.set({ left: (object.left / oldWidth) * nextWidth, top: (object.top / oldHeight) * nextHeight });
            object.setCoords();
          });
          canvas.requestRenderAll();
          refreshGeometry();
        };
        resizeObserver = new ResizeObserver(resize);
        if (parent) resizeObserver.observe(parent);
      } catch (bootError) {
        console.error(bootError);
        setError("The lineup canvas could not be loaded. Please refresh and try again.");
      }
    }

    void boot();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      canvasRef.current?.dispose();
      canvasRef.current = null;
      objectMap.clear();
      selectedIdRef.current = null;
    };
    // Initial positions and participants intentionally boot the canvas once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const grayscale = window.fabric?.filters.Grayscale;
    let raf = 0;
    const started = performance.now();
    const duration = 300;
    const from = new Map<string, number>();
    const to = new Map<string, number>();

    canvas.getObjects().forEach((object) => {
      const selected = filteredIds ? filteredIds.has(object.participantId ?? "") : true;
      const target = positions[object.participantId ?? ""]?.hidden ? 0 : selected ? 1 : 0.3;
      from.set(object.participantId ?? "", object.opacity ?? 1);
      to.set(object.participantId ?? "", target);
      if (grayscale) {
        object.filters = filteredIds && !selected ? [new grayscale()] : [];
        object.applyFilters?.();
      }
    });

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      canvas.getObjects().forEach((object) => {
        const id = object.participantId ?? "";
        const a = from.get(id) ?? 1;
        const b = to.get(id) ?? 1;
        object.set({ opacity: a + (b - a) * eased });
      });
      canvas.requestRenderAll();
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [filteredIds, positions]);

  function updateSelectedScale(raw: number) {
    const id = selectedId;
    const canvas = canvasRef.current;
    if (!id || !canvas) return;
    const object = objectMapRef.current.get(id);
    if (!object) return;
    const next = clampScale(raw);
    const participant = confirmedParticipants.find((p) => p.id === id);
    if (!participant) return;
    const parentHeight = canvas.getHeight();
    const baseScale = (parentHeight * 0.82) / Math.max(1, object.height);
    object.set({ scaleX: baseScale * next * 1.02, scaleY: baseScale * next * 1.02 });
    object.setCoords();
    setSelectedScale(next);
    setPositions((current) => ({ ...current, [id]: { ...(current[id] ?? { participant_id: id, x: object.left / canvas.getWidth(), y: 1 - object.top / canvas.getHeight(), z_index: 0, hidden: false }), scale: next } }));
    geometryRef.current.set(id, {
      x: object.left,
      y: object.top,
      width: object.getScaledWidth(),
      height: object.getScaledHeight(),
    });
    canvas.requestRenderAll();
    refreshGeometry();
  }

  function layer(delta: 1 | -1) {
    const canvas = canvasRef.current;
    const id = selectedId;
    if (!canvas || !id) return;
    const object = objectMapRef.current.get(id);
    if (!object) return;
    if (delta > 0) canvas.bringObjectForward(object);
    else canvas.sendObjectBackwards(object);
    const order = canvas.getObjects();
    const z = order.findIndex((candidate) => candidate.participantId === id);
    setPositions((current) => ({ ...current, [id]: { ...(current[id] ?? { participant_id: id, x: object.left / canvas.getWidth(), y: 1 - object.top / canvas.getHeight(), scale: 1, hidden: false }), z_index: z } }));
    canvas.requestRenderAll();
  }

  function removeSelected() {
    const id = selectedId;
    const canvas = canvasRef.current;
    if (!id || !canvas) return;
    const object = objectMapRef.current.get(id);
    if (!object) return;
    object.set({ opacity: 0 });
    setPositions((current) => ({ ...current, [id]: { ...(current[id] ?? { participant_id: id, x: object.left / canvas.getWidth(), y: 1 - object.top / canvas.getHeight(), scale: 1, z_index: 0 }), hidden: true } }));
    canvas.discardActiveObject?.();
    setSelectedId(null);
    canvas.requestRenderAll();
  }


  function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);
    try {
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "bridal-lineup"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (downloadError) {
      console.error(downloadError);
      setError("Could not download the lineup canvas. Please try again.");
    }
  }

  async function saveLineup() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const items = confirmedParticipants.map((participant, index) => {
        const object = objectMapRef.current.get(participant.id);
        const current = positions[participant.id] ?? defaultPosition(participant, index, confirmedParticipants);
        return {
          participant_id: participant.id,
          x: object ? object.left / canvas.getWidth() : current.x,
          y: object ? 1 - object.top / canvas.getHeight() : current.y,
          scale: clampScale(current.scale ?? 1),
          z_index: canvas.getObjects().findIndex((candidate) => candidate.participantId === participant.id),
          hidden: Boolean(current.hidden),
        };
      });
      const response = await fetch(`/api/events/${event.id}/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save lineup");
      setPositions(Object.fromEntries(items.map((item) => [item.participant_id, item])));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (saveError) {
      console.error(saveError);
      setError(saveError instanceof Error ? saveError.message : "Could not save lineup");
    } finally {
      setSaving(false);
    }
  }


  function canvasPoint(x: number, y: number) {
    const stage = stageRef.current;
    const canvasEl = canvasElementRef.current;
    if (!stage || !canvasEl) return { x, y };
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvasEl.getBoundingClientRect();
    return { x: canvasRect.left - stageRect.left + x, y: canvasRect.top - stageRect.top + y };
  }

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
  }

  return (
    <div ref={stageRef} className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-stone-950 shadow-2xl">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.28),transparent_55%),linear-gradient(to_bottom,rgba(250,248,245,0.98),rgba(213,205,198,0.98))]" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_45%,transparent_48%,rgba(20,16,14,0.12)_100%)]" />

      <div className="relative z-20 border-b border-white/50 bg-white/45 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-rose-800">Color harmony</p>
            <h2 className="font-serif text-lg text-stone-900">Your palette, in the room</h2>
          </div>
        </div>
        <div className="mb-3 flex justify-center">
          <div className="inline-flex rounded-full border border-white/60 bg-white/50 p-1 shadow-sm backdrop-blur-md" role="group" aria-label="Palette matching mode">
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("palette"); }}
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${paletteMatchMode === "palette" ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white/80"}`}
            >
              Palette Match
            </button>
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("family"); }}
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${paletteMatchMode === "family" ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white/80"}`}
            >
              Family Match
            </button>
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("other"); }}
              className={`rounded-full px-3 py-1.5 text-[10px] font-semibold transition ${paletteMatchMode === "other" ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white/80"}`}
            >
              Other
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {palette.map((swatch) => {
            const count = confirmedParticipants
              .filter((p) => p.role === "bridesmaid")
              .filter((p) => matchesSwatch(p, swatch, palette, paletteMatchMode))
              .length;
            const active = activeSwatch === swatch.id;
            return (
              <button
                key={swatch.id}
                ref={(node) => {
                  if (node) swatchRefs.current.set(swatch.id, node);
                  else swatchRefs.current.delete(swatch.id);
                }}
                type="button"
                onClick={() => { vibrate(); setActiveSwatch(active ? null : swatch.id); }}
                className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all duration-300 ${active ? "border-stone-800 bg-white shadow-md" : "border-white/70 bg-white/50 hover:bg-white/80"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="h-4 w-10 rounded-full border border-black/10 shadow-inner" style={{ backgroundColor: swatch.hex }} />
                  <span className="font-medium text-stone-800">{swatch.name}</span>
                  <span className="text-[10px] text-stone-400">{count}</span>
                </span>
                <span className="mt-1 flex min-h-3 items-center justify-center gap-1">
                  {confirmedParticipants
  .filter((participant) => participant.role === "bridesmaid")
  .filter((participant) => matchesSwatch(participant, swatch, palette, paletteMatchMode))
  .map((participant) => (
                      <span
                        key={participant.id}
                        title={`${participant.name} · ${participant.confirmed_dress_color_name ?? participant.confirmed_dress_primary_hex ?? "detected color"}`}
                        className="h-2.5 w-2.5 rounded-full border border-white/80 shadow-sm"
                        style={{ backgroundColor: participant.confirmed_dress_primary_hex ?? swatch.hex }}
                      />
                    ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-[460px] px-0 pb-24 pt-2 sm:min-h-[580px]">
        <canvas ref={canvasElementRef} className="relative z-10 block h-full w-full" />

        {scaleMode && !suggestionMode && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-[10px] font-medium text-stone-600 shadow-sm backdrop-blur-md">
            Scale mode · Press S to exit
          </div>
        )}

        {!suggestionMode && selectedParticipant && selectedId && (
          <div
            className="pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-2xl border border-white/65 bg-white/70 px-2 py-1.5 shadow-xl backdrop-blur-xl"
            style={{
              left: `${canvasPoint(geometryRef.current.get(selectedId)?.x ?? 0, geometryRef.current.get(selectedId)?.y ?? 80).x}px`,
              top: `${Math.max(68, canvasPoint(geometryRef.current.get(selectedId)?.x ?? 0, (geometryRef.current.get(selectedId)?.y ?? 80) - (geometryRef.current.get(selectedId)?.height ?? 160) * 0.55).y)}px`,
            }}
          >
            <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-white" title="Scale down" onClick={() => { vibrate(); updateSelectedScale(selectedScale - SCALE_STEP); }}><Minus size={13} /></button>
            <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-white" title="Scale up" onClick={() => { vibrate(); updateSelectedScale(selectedScale + SCALE_STEP); }}><Plus size={13} /></button>
            <span className="px-1 text-[10px] tabular-nums text-stone-500">{selectedScale.toFixed(1)}×</span>
            <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-white" title="Bring forward" onClick={() => { vibrate(); layer(1); }}><ArrowUp size={13} /></button>
            <button className="grid h-7 w-7 place-items-center rounded-full hover:bg-white" title="Send back" onClick={() => { vibrate(); layer(-1); }}><ArrowDown size={13} /></button>
            <button className="grid h-7 w-7 place-items-center rounded-full text-rose-600 hover:bg-rose-50" title="Remove from lineup" onClick={() => { vibrate(); removeSelected(); }}><Trash2 size={13} /></button>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/50 bg-white/35 px-3 py-1 text-[10px] font-medium text-stone-500 backdrop-blur-md">
          <GripVertical size={12} className="mr-1 inline" /> Drag people to place their feet on the floor
        </div>
      </div>

      {!suggestionMode && selectedId && (
        <div className="absolute bottom-20 left-1/2 z-30 w-[min(420px,90%)] -translate-x-1/2 rounded-2xl border border-white/65 bg-white/65 px-4 py-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                <span>Scale</span><span>{selectedScale.toFixed(1)}×</span>
              </div>
              <input
                className="mt-2 w-full accent-rose-700"
                type="range"
                min={MIN_SCALE}
                max={MAX_SCALE}
                step={SCALE_STEP}
                value={selectedScale}
                onChange={(e) => updateSelectedScale(Number(e.target.value))}
                aria-label={`Scale ${selectedParticipant?.name ?? "selected person"}`}
              />
            </div>
            <div className="flex items-center gap-1.5 text-stone-500">
              <button className="rounded-full p-2 hover:bg-white" title="Send backward one layer" onClick={() => { vibrate(); layer(-1); }}><ChevronDown size={15} /></button>
              <button className="rounded-full p-2 hover:bg-white" title="Bring forward one layer" onClick={() => { vibrate(); layer(1); }}><ChevronUp size={15} /></button>
            </div>
          </div>
        </div>
      )}

<div className="absolute inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-between gap-3 border-t border-white/60 bg-white/55 px-4 py-3 backdrop-blur-xl sm:px-6">
  <SuggestionTools
    eventId={event.id}
    currentParticipantId={bride?.id ?? null}
    target={selectedParticipant && selectedParticipant.id !== bride?.id ? selectedParticipant : null}
    onEnabledChange={syncSuggestionMode}
    className="w-full max-w-sm"
  />
  <div className="ml-auto flex items-center gap-2">
    <button
      type="button"
      onClick={() => {
        vibrate();
        downloadCanvas();
      }}
      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-white"
    >
      <Download size={15} /> Download
    </button>
    <button
      type="button"
      onClick={() => {
        vibrate();
        void saveLineup();
      }}
      disabled={saving}
      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-rose-950 disabled:cursor-wait disabled:opacity-60"
    >
      <Save size={15} /> {saving ? "Saving…" : saved ? "Saved" : "Save Lineup"}
    </button>
  </div>
</div>
      {error && (
        <div className="absolute bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-800 shadow-lg">
          {error}
        </div>
      )}

      <div key={geometryVersion} className="sr-only" aria-hidden="true" />
    </div>
  );
}