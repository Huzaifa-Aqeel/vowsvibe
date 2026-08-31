"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Download,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  PanelLeftOpen,
  Save,
  Sparkles,
  Upload,
  Trash2,
  X,
} from "lucide-react";
import { SuggestionTools } from "@/components/SuggestionTools";
import type { EventRow, LineupPosition, ParticipantRow, SwatchColor } from "@/lib/types";
import { classifyBridalPaletteBadge, classifyPaletteRelationship, matchesPaletteMode } from "@/lib/color/palette-matching";
import { browserFileActions } from "@/lib/platform/file-actions";
import { prepareImageUpload } from "@/lib/images/prepare-upload";

const FABRIC_CDN = "https://cdn.jsdelivr.net/npm/fabric@6.7.1/dist/index.min.js";
const SAME_FAMILY_OTHER_FILTER_ID = "same-family-other";
const CUSTOM_OTHER_FILTER_ID = "custom-other";

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
  getElement?: () => CanvasImageSource;
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
    return { participant_id: participant.id, x: 0.5, y: 0.07, z_index: 100, hidden: false };
  }

  const bridesmaids = participants.filter((p) => p.role === "bridesmaid");
  const brideIndex = participants.findIndex((p) => p.role === "bride");
  const ordinal = Math.max(0, bridesmaids.findIndex((p) => p.id === participant.id));
  const side = ordinal % 2 === 0 ? 1 : -1;
  const distance = 0.12 + Math.floor(ordinal / 2) * 0.115;
  const x = Math.max(0.06, Math.min(0.94, 0.5 + side * distance));
  return { participant_id: participant.id, x, y: 0.07, z_index: brideIndex >= 0 ? 50 - index : 50 - ordinal, hidden: false };
}

function responsiveCanvasHeight(width: number, element: HTMLCanvasElement) {
  const viewportHeight = document.documentElement.clientHeight;
  const canvasTop = element.getBoundingClientRect().top;
  // On desktop the lineup is the primary workspace: target 75dvh and bound it
  // so very tall or short monitors still get a balanced composition. Mobile and
  // short landscape screens continue to use only the measured remaining space.
  if (width >= 768 && viewportHeight >= 700) {
    return Math.round(Math.max(480, Math.min(760, viewportHeight * 0.75)));
  }
  // Reserve room for the overlaid action bar and the page's bottom breathing room.
  const availableHeight = viewportHeight - canvasTop - 88;
  return Math.max(280, Math.min(Math.round(width * 0.53), availableHeight));
}

function visiblePersonBounds(image: FabricImageLike) {
  const source = image.getElement?.();
  if (!source || !image.width || !image.height) return { height: image.height, bottomPadding: 0 };

  try {
    const sampleHeight = Math.min(512, Math.max(1, Math.round(image.height)));
    const sampleWidth = Math.max(1, Math.round((image.width / image.height) * sampleHeight));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return { height: image.height, bottomPadding: 0 };
    context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let firstRow = sampleHeight;
    let lastRow = -1;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] > 16) {
          firstRow = Math.min(firstRow, y);
          lastRow = Math.max(lastRow, y);
        }
      }
    }
    if (lastRow < firstRow) return { height: image.height, bottomPadding: 0 };
    const sourceUnitsPerRow = image.height / sampleHeight;
    return {
      height: Math.max(1, (lastRow - firstRow + 1) * sourceUnitsPerRow),
      bottomPadding: Math.max(0, (sampleHeight - lastRow - 1) * sourceUnitsPerRow),
    };
  } catch {
    return { height: image.height, bottomPadding: 0 };
  }
}

export function LineupCanvas({ event, participants, initialPositions }: Props) {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<FabricCanvasLike | null>(null);
  const lineupSnapshotRef = useRef<string | null>(null);
  const objectMapRef = useRef(new Map<string, FabricImageLike>());
  const baselineOffsetRef = useRef(new Map<string, number>());
  const stageRef = useRef<HTMLDivElement | null>(null);
  const swatchRefs = useRef(new Map<string, HTMLButtonElement>());
  const geometryRef = useRef(new Map<string, { x: number; y: number; width: number; height: number }>());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [positions, setPositions] = useState<Record<string, LineupPosition>>(initialPositions);
  const [activeSwatch, setActiveSwatch] = useState<string | null>(null);
  const [paletteMatchMode, setPaletteMatchMode] = useState<"palette" | "family" | "other">("palette");
  const [geometryVersion, setGeometryVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const suggestionModeRef = useRef(false);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [venueDataUrl, setVenueDataUrl] = useState<string | null>(event.group_preview_venue_path ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(event.group_preview_path ?? null);
  const [generatedPreview, setGeneratedPreview] = useState<string | null>(null);
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewSaving, setPreviewSaving] = useState(false);
  const [previewSaved, setPreviewSaved] = useState(false);
  const [previewPresets, setPreviewPresets] = useState<string[]>(["natural", "venue", "cohesive"]);

  const confirmedParticipants = useMemo(
    () => participants.filter((p) => p.status === "confirmed" && p.cutout_url),
    [participants],
  );

  const palette = useMemo(() => event.color_palette ?? [], [event.color_palette]);
  const selectedParticipant = selectedId ? confirmedParticipants.find((p) => p.id === selectedId) ?? null : null;
  // Suggestions belong to the bride even when her older participant row has no
  // generated cutout and therefore is not rendered on the canvas.
  const bride = participants.find((p) => p.role === "bride") ?? null;

  const otherIds = useMemo(
    () => new Set(
      confirmedParticipants
        .filter((participant) => participant.role === "bridesmaid")
        .filter((participant) => classifyPaletteRelationship(
          participant.confirmed_dress_color_name,
          participant.confirmed_dress_primary_hex ?? null,
          palette,
        ) === "other")
        .map((participant) => participant.id),
    ),
    [confirmedParticipants, palette],
  );

  const sameFamilyOtherIds = useMemo(
    () => new Set(
      confirmedParticipants
        .filter((participant) => participant.role === "bridesmaid")
        .filter((participant) => classifyBridalPaletteBadge(
          participant.confirmed_dress_color_name,
          participant.confirmed_dress_primary_hex ?? null,
          palette,
        ) === "same-family")
        .map((participant) => participant.id),
    ),
    [confirmedParticipants, palette],
  );

  const customOtherIds = useMemo(
    () => new Set([...otherIds].filter((id) => !sameFamilyOtherIds.has(id))),
    [otherIds, sameFamilyOtherIds],
  );

const filteredIds = useMemo(() => {
  if (paletteMatchMode === "other") {
    // Selecting the top-level Other tab only changes the people list. Opacity
    // changes begin when the bride selects one of its two explicit subfilters.
    if (!activeSwatch) return null;
    if (activeSwatch === SAME_FAMILY_OTHER_FILTER_ID) return sameFamilyOtherIds;
    if (activeSwatch === CUSTOM_OTHER_FILTER_ID) return customOtherIds;
    return null;
  }

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
  otherIds,
  sameFamilyOtherIds,
  customOtherIds,
]);

  const filteredPeople = useMemo(() => {
    const categoryMatches = confirmedParticipants
      .filter((participant) => participant.role === "bridesmaid")
      .filter((participant) => classifyPaletteRelationship(
        participant.confirmed_dress_color_name,
        participant.confirmed_dress_primary_hex ?? null,
        palette,
      ) === paletteMatchMode);

    return filteredIds
      ? categoryMatches.filter((participant) => filteredIds.has(participant.id))
      : categoryMatches;
  }, [confirmedParticipants, filteredIds, palette, paletteMatchMode]);

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
      selectedIdRef.current = null;
      setSelectedId(null);
    }
    canvas.requestRenderAll();
    refreshGeometry();
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
        const height = responsiveCanvasHeight(width, canvasElementRef.current);
        canvasElementRef.current.width = width;
        canvasElementRef.current.height = height;

        const canvas = new fabric.Canvas(canvasElementRef.current, {
          selection: false,
          preserveObjectStacking: true,
          enableRetinaScaling: true,
          allowTouchScrolling: true,
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
            const visibleBounds = visiblePersonBounds(image);
            const baseScale = (height * 0.82) / visibleBounds.height;
            const baselineOffset = visibleBounds.bottomPadding * baseScale;
            image.set({
              participantId: participant.id,
              originX: "center",
              originY: "bottom",
              left: width * position.x,
              top: height * (1 - position.y) + baselineOffset,
              scaleX: baseScale,
              scaleY: baseScale,
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
            baselineOffsetRef.current.set(participant.id, baselineOffset);
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
          selectedIdRef.current = id;
          setSelectedId(id);
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
              selectedIdRef.current = null;
              setSelectedId(null);
              refreshGeometry();
              return;
            }
            selectedIdRef.current = id;
            setSelectedId(id);
            refreshGeometry();
            return;
          }
        });
        canvas.on("selection:created", (e) => select(e.target));
        canvas.on("selection:updated", (e) => select(e.target));
        canvas.on("selection:cleared", () => {
          selectedIdRef.current = null;
          setSelectedId(null);
          refreshGeometry();
        });
        canvas.on("object:moving", (e) => {
          if (!e.target?.participantId) return;
          const baselineOffset = baselineOffsetRef.current.get(e.target.participantId) ?? 0;
          const visibleBottom = e.target.top - baselineOffset;
          // Fabric positions the transparent PNG bottom, while the studio guide and saved y
          // position refer to the person's visible feet. Keep that visible baseline inside
          // the canvas even when cutouts have different amounts of transparent bottom padding.
          if (visibleBottom > canvas.getHeight()) e.target.set({ top: canvas.getHeight() + baselineOffset });
          else if (visibleBottom < 0) e.target.set({ top: baselineOffset });
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
          const baselineOffset = baselineOffsetRef.current.get(e.target.participantId) ?? 0;
          const visibleBottom = e.target.top - baselineOffset;
          if (visibleBottom > canvas.getHeight()) e.target.set({ top: canvas.getHeight() + baselineOffset });
          else if (visibleBottom < 0) e.target.set({ top: baselineOffset });
          e.target.setCoords();
          geometryRef.current.set(e.target.participantId, {
            x: e.target.left,
            y: e.target.top,
            width: e.target.getScaledWidth(),
            height: e.target.getScaledHeight(),
          });
          const next = { ...(positions[e.target.participantId] ?? { participant_id: e.target.participantId, x: 0.5, y: 0.07, z_index: 0, hidden: false }) };
          next.x = e.target.left / canvas.getWidth();
          next.y = 1 - (e.target.top - baselineOffset) / canvas.getHeight();
          setPositions((current) => ({ ...current, [e.target!.participantId!]: next }));
          refreshGeometry();
        });

        const resize = () => {
          const p = canvasElementRef.current?.parentElement;
          const canvasElement = canvasElementRef.current;
          if (!p || !canvasElement) return;
          const nextWidth = p.clientWidth;
          // Preview mode uses `display: none` for the live workspace. Ignore the
          // resulting zero-width observation so Fabric keeps its backing-store
          // dimensions and can restore the lineup without rescaling from zero.
          if (nextWidth < 1) return;
          const nextHeight = responsiveCanvasHeight(nextWidth, canvasElement);
          const oldWidth = canvas.getWidth();
          const oldHeight = canvas.getHeight();
          if (!oldWidth || !oldHeight) return;
          // Overlay changes (such as opening Suggestions) can notify the observer
          // without changing the available canvas width. Do not recreate Fabric's
          // backing store in that case; it causes a visible size jump on mobile.
          if (Math.abs(nextWidth - oldWidth) < 1) return;
          canvas.setDimensions({ width: nextWidth, height: nextHeight });
          canvas.getObjects().forEach((object) => {
            const heightRatio = nextHeight / oldHeight;
            const id = object.participantId ?? "";
            object.set({
              left: (object.left / oldWidth) * nextWidth,
              top: (object.top / oldHeight) * nextHeight,
              scaleX: object.scaleX * heightRatio,
              scaleY: object.scaleY * heightRatio,
            });
            baselineOffsetRef.current.set(id, (baselineOffsetRef.current.get(id) ?? 0) * heightRatio);
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
      baselineOffsetRef.current.clear();
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
      // Once a concrete swatch/subfilter is selected, only its matching
      // bridesmaids remain fully visible. This intentionally dims every other
      // canvas participant, including the bride, so the shortlisted dresses are
      // the sole visual focus. Merely selecting a top-level category does not
      // activate opacity filtering because filteredIds remains null.
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
  }, [bride?.id, filteredIds, positions]);

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
    setPositions((current) => ({ ...current, [id]: { ...(current[id] ?? { participant_id: id, x: object.left / canvas.getWidth(), y: 1 - object.top / canvas.getHeight(), hidden: false }), z_index: z } }));
    canvas.requestRenderAll();
  }

  function removeSelected() {
    const id = selectedId;
    const canvas = canvasRef.current;
    if (!id || !canvas) return;
    const object = objectMapRef.current.get(id);
    if (!object) return;
    object.set({ opacity: 0 });
    setPositions((current) => ({ ...current, [id]: { ...(current[id] ?? { participant_id: id, x: object.left / canvas.getWidth(), y: 1 - object.top / canvas.getHeight(), z_index: 0 }), hidden: true } }));
    canvas.discardActiveObject?.();
    setSelectedId(null);
    canvas.requestRenderAll();
  }


  async function downloadCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);
    try {
      const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
      await browserFileActions.saveDataUrl(
        dataUrl,
        `${event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "bridal-lineup"}.png`,
      );
    } catch (downloadError) {
      console.error(downloadError);
      setError("Could not download the lineup canvas. Please try again.");
    }
  }

  async function readVenue(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try { file = await prepareImageUpload(file, 1800, 3 * 1024 * 1024); }
    catch (venueError) { setError(venueError instanceof Error ? venueError.message : "Could not prepare venue image"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setVenueDataUrl(reader.result);
      void fetch(`/api/events/${event.id}/group-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "venue", image: reader.result }),
      }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not save venue");
        // Keep the local data URL for canvas composition. Replacing it with the
        // public Storage URL can make the browser reject the later canvas load
        // under CORS, preventing the generation POST from ever being sent.
      }).catch((venueError) => setError(venueError instanceof Error ? venueError.message : "Could not save venue"));
    };
    reader.onerror = () => setError("Could not read that venue image.");
    reader.readAsDataURL(file);
  }

  async function flattenPreviewInput(): Promise<string> {
    const canvas = canvasRef.current;
    if (!canvas || !venueDataUrl) throw new Error("Choose a venue image first.");
    const lineup = lineupSnapshotRef.current ?? canvas.toDataURL({ format: "png", multiplier: 1 });
    const load = (src: string, label: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      if (src.startsWith("http")) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load the ${label} image for generation. Please upload it again.`));
      image.src = src;
    });
    const [venue, people] = await Promise.all([load(venueDataUrl, "venue"), load(lineup, "lineup")]);
    const output = document.createElement("canvas");
    // Preview mode hides the live Fabric workspace, so its measured dimensions can
    // collapse to zero. The captured lineup image retains the canonical dimensions.
    const maxDimension = 1600;
    const outputScale = Math.min(1, maxDimension / Math.max(people.naturalWidth, people.naturalHeight));
    output.width = Math.max(1, Math.round(people.naturalWidth * outputScale));
    output.height = Math.max(1, Math.round(people.naturalHeight * outputScale));
    const context = output.getContext("2d");
    if (!context) throw new Error("This browser could not compose the preview input.");
    const scale = Math.max(output.width / venue.naturalWidth, output.height / venue.naturalHeight);
    const width = venue.naturalWidth * scale;
    const height = venue.naturalHeight * scale;
    context.drawImage(venue, (output.width - width) / 2, (output.height - height) / 2, width, height);
    context.drawImage(people, 0, 0, output.width, output.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const dataUrl = output.toDataURL("image/jpeg", quality);
      if (dataUrl.startsWith("data:image/jpeg;base64,") && dataUrl.length <= 4_000_000) return dataUrl;
    }
    throw new Error("The composed preview is too large. Please choose a smaller venue image.");
  }

  async function generatePreview() {
    setPreviewGenerating(true);
    setPreviewSaved(false);
    setError(null);
    try {
      const image = await flattenPreviewInput();
      const response = await fetch(`/api/events/${event.id}/group-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", image, presets: previewPresets }),
        signal: AbortSignal.timeout(180_000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not generate preview");
      setPreviewUrl(body.image);
      setGeneratedPreview(body.image);
    } catch (previewError) {
      setError(
        previewError instanceof DOMException && previewError.name === "TimeoutError"
          ? "Preview generation took too long. Please try again."
          : previewError instanceof Error ? previewError.message : "Could not generate preview",
      );
    } finally {
      setPreviewGenerating(false);
    }
  }

  function openGroupPreview() {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.discardActiveObject?.();
      canvas.requestRenderAll();
      lineupSnapshotRef.current = canvas.toDataURL({ format: "png", multiplier: 1 });
    }
    setPreviewMode(true);
    setPeopleOpen(false);
  }

  async function previewAsDataUrl(image: string): Promise<string> {
    if (image.startsWith("data:image/")) return image;
    const response = await fetch(image, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Could not download the generated preview (${response.status}).`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("The generated preview was not an image.");
    if (blob.size > 20 * 1024 * 1024) throw new Error("The generated preview is too large to save.");
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the generated preview."));
      reader.onerror = () => reject(new Error("Could not read the generated preview."));
      reader.readAsDataURL(blob);
    });
  }

  async function savePreview() {
    if (!generatedPreview) return;
    setPreviewSaving(true);
    setError(null);
    try {
      const image = await previewAsDataUrl(generatedPreview);
      const response = await fetch(`/api/events/${event.id}/group-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", image }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save preview");
      setPreviewUrl(body.previewUrl);
      setPreviewSaved(true);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not save preview");
    } finally {
      setPreviewSaving(false);
    }
  }

  async function downloadPreview() {
    if (!previewUrl) return;
    setError(null);
    try {
      const image = await previewAsDataUrl(previewUrl);
      await browserFileActions.saveDataUrl(image, `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "bridal"}-group-preview.png`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not download preview");
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
          y: object ? 1 - (object.top - (baselineOffsetRef.current.get(participant.id) ?? 0)) / canvas.getHeight() : current.y,
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

  function selectPerson(participantId: string) {
    if (suggestionModeRef.current) return;
    const canvas = canvasRef.current;
    const object = objectMapRef.current.get(participantId);
    if (!canvas || !object) return;
    selectedIdRef.current = participantId;
    setSelectedId(participantId);
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    refreshGeometry();
  }

  function dropPerson(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (suggestionModeRef.current) return;
    const participantId = event.dataTransfer.getData("application/x-lineup-participant");
    const canvas = canvasRef.current;
    const canvasElement = canvasElementRef.current;
    const object = objectMapRef.current.get(participantId);
    if (!participantId || !canvas || !canvasElement || !object) return;

    const rect = canvasElement.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.getWidth(), event.clientX - rect.left));
    const visibleBottom = Math.max(0, Math.min(canvas.getHeight(), event.clientY - rect.top));
    const baselineOffset = baselineOffsetRef.current.get(participantId) ?? 0;
    object.set({ left: x, top: visibleBottom + baselineOffset, opacity: 1 });
    object.setCoords();
    canvas.setActiveObject(object);
    setPositions((current) => ({
      ...current,
      [participantId]: {
        ...(current[participantId] ?? { participant_id: participantId, z_index: 0 }),
        x: x / canvas.getWidth(),
        y: 1 - visibleBottom / canvas.getHeight(),
        hidden: false,
      },
    }));
    selectedIdRef.current = participantId;
    setSelectedId(participantId);
    canvas.requestRenderAll();
    refreshGeometry();
  }

  return (
    <div ref={stageRef} className="lineup-studio-shell relative flex min-w-0 overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-[#f4eee6] shadow-[0_20px_60px_-32px_rgba(41,32,27,0.45)]">
      {peopleOpen && !previewMode && (
        <button type="button" aria-label="Close People panel" onClick={() => setPeopleOpen(false)} className="lineup-people-scrim absolute inset-0 z-[70] hidden bg-stone-950/20 backdrop-blur-[2px]" />
      )}

      {previewMode && (
        <aside className="lineup-people-panel relative z-[80] flex w-[300px] shrink-0 flex-col border-r border-stone-200/80 bg-[#fffdf9]/95">
          <div className="border-b border-stone-200/70 px-5 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-rose-800">Compose Studio</p>
            <h2 className="mt-0.5 font-serif text-xl text-stone-900">Group Preview</h2>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">Venue</p>
              <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center">
                {venueDataUrl ? <img src={venueDataUrl} alt="Selected venue" className="h-28 w-full object-cover" /> : <><Upload size={18} className="text-stone-500" /><span className="mt-2 text-xs font-semibold text-stone-700">Upload venue image</span></>}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void readVenue(e.target.files?.[0])} />
              </label>
              {venueDataUrl && <p className="mt-1.5 text-[10px] text-stone-400">Your event venue is ready. The flattened generation input is never stored.</p>}
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">Finish</p>
              <div className="mt-2 space-y-2">
                {[{id:"natural",label:"Natural editorial light"},{id:"venue",label:"Preserve venue details"},{id:"cohesive",label:"Cohesive shadows & scale"},{id:"formal",label:"Formal portrait polish"}].map((preset) => (
                  <label key={preset.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-xs text-stone-700">
                    <input type="checkbox" checked={previewPresets.includes(preset.id)} onChange={() => setPreviewPresets((current) => current.includes(preset.id) ? current.filter((id) => id !== preset.id) : [...current, preset.id])} className="accent-rose-800" />
                    {preset.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2 border-t border-stone-200/70 p-4">
            <button type="button" disabled={previewGenerating || !venueDataUrl} onClick={() => void generatePreview()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {previewGenerating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{previewGenerating ? "Generating…" : previewUrl ? "Regenerate Preview" : "Generate Preview"}
            </button>
            <button type="button" onClick={() => setPreviewMode(false)} className="min-h-10 w-full text-xs font-semibold text-stone-500">Back to lineup</button>
          </div>
        </aside>
      )}

      <aside className={`lineup-people-panel relative z-[80] ${previewMode ? "hidden" : "flex"} w-[300px] shrink-0 flex-col border-r border-stone-200/80 bg-[#fffdf9]/95 transition-[margin,transform] duration-300 ${peopleOpen ? "ml-0 translate-x-0" : "-ml-[300px] -translate-x-full"}`} aria-hidden={!peopleOpen || previewMode}>
        <div className="flex items-center justify-between border-b border-stone-200/70 px-5 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-rose-800">Bridal party</p>
            <h2 className="mt-0.5 font-serif text-xl text-stone-900">People</h2>
          </div>
          <button type="button" onClick={() => setPeopleOpen(false)} className="grid h-10 w-10 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-900" aria-label="Collapse People panel">
            <ChevronLeft className="hidden md:block" size={18} /><X className="md:hidden" size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">Filter by color</p>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1" role="group" aria-label="Palette matching mode">
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("palette"); setActiveSwatch(null); }}
                className={`min-h-9 rounded-lg px-1.5 py-1 text-[9px] font-semibold transition ${paletteMatchMode === "palette" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
            >
              Palette Match
            </button>
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("family"); setActiveSwatch(null); }}
                className={`min-h-9 rounded-lg px-1.5 py-1 text-[9px] font-semibold transition ${paletteMatchMode === "family" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
            >
              Family Match
            </button>
            <button
              type="button"
              onClick={() => { vibrate(); setPaletteMatchMode("other"); setActiveSwatch(null); }}
                className={`min-h-9 rounded-lg px-1.5 py-1 text-[9px] font-semibold transition ${paletteMatchMode === "other" ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
            >
              Other
            </button>
            </div>
          <div className="mt-2 space-y-1.5">
          {paletteMatchMode === "other" ? (
            <div className="space-y-1.5">
              <p className="px-1 text-[10px] leading-4 text-stone-400">
                Shades outside an exact or close-enough palette match.
              </p>
              {[
                {
                  id: SAME_FAMILY_OTHER_FILTER_ID,
                  label: "Related shade",
                  description: "Same color family, but too far from the palette shade.",
                  count: sameFamilyOtherIds.size,
                },
                {
                  id: CUSTOM_OTHER_FILTER_ID,
                  label: "Different family",
                  description: "A custom color from outside the palette families.",
                  count: customOtherIds.size,
                },
              ].map((option) => {
                const active = activeSwatch === option.id;
                const hasMatches = option.count > 0;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!hasMatches}
                    onClick={() => {
                      vibrate();
                      setActiveSwatch(active ? null : option.id);
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${active ? "border-rose-200 bg-rose-50 ring-1 ring-rose-100" : hasMatches ? "border-stone-200 bg-white hover:border-stone-300" : "cursor-not-allowed border-stone-100 bg-stone-50 opacity-45"}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-stone-800">{option.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-stone-400">{option.description}</span>
                    </span>
                    <span className="mt-0.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">{option.count}</span>
                  </button>
                );
              })}
            </div>
          ) : palette.map((swatch) => {
            const count = confirmedParticipants
              .filter((p) => p.role === "bridesmaid")
              .filter((p) => matchesSwatch(p, swatch, palette, paletteMatchMode))
              .length;
            const active = activeSwatch === swatch.id;
            const hasMatches = count > 0;
            return (
              <button
                key={swatch.id}
                ref={(node) => {
                  if (node) swatchRefs.current.set(swatch.id, node);
                  else swatchRefs.current.delete(swatch.id);
                }}
                type="button"
                disabled={!hasMatches}
                onClick={() => { vibrate(); setActiveSwatch(active ? null : swatch.id); }}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${active ? "border-rose-200 bg-rose-50 ring-1 ring-rose-100" : hasMatches ? "border-stone-200 bg-white hover:border-stone-300" : "cursor-not-allowed border-stone-100 bg-stone-50 opacity-45"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border border-black/10 shadow-inner" style={{ backgroundColor: swatch.hex }} />
                  <span className="font-medium text-stone-800">{swatch.name}</span>
                  <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">{count}</span>
                </span>
                <span className="hidden">
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

          <div className="my-4 h-px bg-stone-200/80" />
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400">In this lineup</p>
            <span className="text-[10px] tabular-nums text-stone-400">{filteredPeople.length}</span>
          </div>
          <div className="space-y-2">
            {filteredPeople.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-xs leading-5 text-stone-400">
                No bridesmaids in this category.
              </p>
            ) : filteredPeople.map((participant) => (
                <div
                  key={participant.id}
                  draggable={!suggestionMode}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-lineup-participant", participant.id);
                    event.dataTransfer.effectAllowed = "move";
                    selectPerson(participant.id);
                  }}
                  onClick={() => selectPerson(participant.id)}
                  className={`group flex cursor-grab items-center gap-3 rounded-xl border bg-white p-2 shadow-sm transition active:cursor-grabbing ${selectedId === participant.id ? "border-rose-300 ring-2 ring-rose-100" : "border-stone-200 hover:border-stone-300"}`}
                >
                  <div className="grid h-12 w-11 shrink-0 place-items-end overflow-hidden rounded-lg bg-[#eee7df]">
                    <img src={participant.cutout_url ?? ""} alt="" className="h-full w-full object-contain object-bottom" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-stone-900">{participant.name}</p>
                    <p className="mt-0.5 truncate text-[10px] capitalize text-stone-400">{participant.role}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: participant.confirmed_dress_primary_hex ?? "#d6d3d1" }} />
                      <span className="truncate text-[10px] text-stone-600">{participant.confirmed_dress_color_name ?? "Dress color"}</span>
                    </div>
                  </div>
                  <GripVertical size={15} className="shrink-0 text-stone-300 transition group-hover:text-stone-500" />
                </div>
              ))}
          </div>
        </div>
        <p className="border-t border-stone-200/70 px-5 py-3 text-[10px] leading-4 text-stone-400">Drag a person onto the studio, or select them to arrange layers.</p>
      </aside>

      {previewMode && (
        <div className="relative flex min-h-[520px] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#e9e1d8] p-5 pb-24 sm:p-8 sm:pb-24">
          {previewUrl ? <img src={previewUrl} alt="Generated bridal party group preview" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" /> : <div className="max-w-sm text-center text-stone-500"><ImageIcon className="mx-auto mb-3" size={30} /><p className="font-serif text-xl text-stone-800">Your group preview will appear here</p><p className="mt-2 text-xs leading-5">Choose a venue and finishing options, then generate a polished portrait.</p></div>}
          {previewGenerating && <div className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs font-semibold text-stone-700 shadow"><Loader2 size={14} className="animate-spin" /> Creating preview</div>}
          {previewUrl && <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-end gap-2 border-t border-white/70 bg-[#fffdf9]/85 p-4 backdrop-blur-xl"><button type="button" onClick={() => void downloadPreview()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm font-semibold"><Download size={15}/>Download Preview</button>{generatedPreview && <button type="button" disabled={previewSaving} onClick={() => void savePreview()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-60"><Save size={15}/>{previewSaving ? "Saving…" : previewSaved ? "Saved" : "Save Preview"}</button>}</div>}
        </div>
      )}

      <div className={`relative min-w-0 flex-1 overflow-hidden bg-[#f3ede5] ${previewMode ? "hidden" : "block"}`} onDragOver={(event) => event.preventDefault()} onDrop={dropPerson}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_24%,rgba(255,255,255,0.96),rgba(250,247,241,0.76)_48%,rgba(226,216,205,0.82)_100%)]" />
        <div className="pointer-events-none absolute inset-x-[8%] bottom-[12%] h-px bg-stone-500/15 shadow-[0_1px_14px_rgba(80,65,55,0.12)]" />
        {!peopleOpen && (
          <button type="button" onClick={() => setPeopleOpen(true)} className="absolute left-4 top-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3.5 text-xs font-semibold text-stone-800 shadow-md backdrop-blur-xl transition hover:bg-white">
            <PanelLeftOpen size={15} /><span>People</span>
          </button>
        )}

      <div className="relative min-h-[280px] px-0 pb-20">
        <canvas ref={canvasElementRef} className="lineup-drag-surface relative z-10 block h-full w-full" />

        {!suggestionMode && selectedParticipant && selectedId && (
          <div
            className="pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-2xl border border-white/65 bg-white/70 px-2 py-1.5 shadow-xl backdrop-blur-xl"
            style={{
              left: `${canvasPoint(geometryRef.current.get(selectedId)?.x ?? 0, geometryRef.current.get(selectedId)?.y ?? 80).x}px`,
              top: `${Math.max(68, canvasPoint(geometryRef.current.get(selectedId)?.x ?? 0, (geometryRef.current.get(selectedId)?.y ?? 80) - (geometryRef.current.get(selectedId)?.height ?? 160) * 0.55).y)}px`,
            }}
          >
            <button className="grid h-11 w-11 touch-manipulation place-items-center rounded-full active:bg-white sm:hover:bg-white" title="Bring forward" onClick={() => { vibrate(); layer(1); }}><ArrowUp size={15} /></button>
            <button className="grid h-11 w-11 touch-manipulation place-items-center rounded-full active:bg-white sm:hover:bg-white" title="Send back" onClick={() => { vibrate(); layer(-1); }}><ArrowDown size={15} /></button>
            <button className="grid h-11 w-11 touch-manipulation place-items-center rounded-full text-rose-600 active:bg-rose-50 sm:hover:bg-rose-50" title="Remove from lineup" onClick={() => { vibrate(); removeSelected(); }}><Trash2 size={15} /></button>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-[10px] font-medium text-stone-500 backdrop-blur-md">
          <GripVertical size={12} className="mr-1 inline" /> Drag people to place their feet on the floor
        </div>
      </div>

<SuggestionTools
  eventId={event.id}
  currentParticipantId={bride?.id ?? null}
  target={selectedParticipant && selectedParticipant.id !== bride?.id ? selectedParticipant : null}
  onOpenChange={syncSuggestionMode}
  className="lineup-suggestions-controls absolute right-4 top-4 z-50"
/>
<div className="lineup-sticky-actions absolute inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-end gap-3 border-t border-white/70 bg-[#fffdf9]/80 px-4 pt-3 backdrop-blur-xl sm:px-6">
  <div className="ml-auto flex items-center gap-2">
    <button type="button" onClick={() => { vibrate(); openGroupPreview(); }} className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition active:bg-white sm:hover:bg-white"><Sparkles size={15} /> Group Preview</button>
    <button
      type="button"
      onClick={() => {
        vibrate();
        void downloadCanvas();
      }}
      className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm transition active:bg-white sm:hover:bg-white"
    >
      <Download size={15} /> Download PNG
    </button>
    <button
      type="button"
      onClick={() => {
        vibrate();
        void saveLineup();
      }}
      disabled={saving}
      className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition active:bg-rose-950 disabled:cursor-wait disabled:opacity-60 sm:hover:bg-rose-950"
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
    </div>
  );
}
