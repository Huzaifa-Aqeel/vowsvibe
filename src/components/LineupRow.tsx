"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SuggestionTools } from "@/components/SuggestionTools";
import type { LineupPosition, ParticipantRow } from "@/lib/types";


/**
 * Arranges the confirmed party into a single centered line: bride in the middle,
 * bridesmaids split evenly to either side in the order they joined (earliest joiners —
 * i.e. whoever the bride invited first — stand closest to her). No manual reordering:
 * the line is entirely derived from confirmation state, so it's always accurate and
 * never drifts out of sync between the bride's dashboard and the public page.
 *
 * Only participants with a cutout are placed in the scene. A row can be "confirmed" for a
 * moment without a cutout only if it was confirmed before this feature existed — the
 * confirm request itself won't return success until the cutout exists, so this is a
 * backfill guard, not a state the app produces going forward.
 */
function centeredLineup(rows: ParticipantRow[]) {
  const confirmed = rows.filter((p) => p.status === "confirmed" && p.cutout_url);
  const bride = confirmed.find((p) => p.role === "bride") ?? null;
  const bridesmaids = confirmed
    .filter((p) => p.role !== "bride")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const right: ParticipantRow[] = [];
  const left: ParticipantRow[] = [];
  bridesmaids.forEach((p, i) => (i % 2 === 0 ? right : left).push(p));

  if (!bride) return [...left.slice().reverse(), ...right];
  return [...left.slice().reverse(), bride, ...right];
}

type VisibleImageBounds = {
  /** Full source-image height divided by the visible (non-transparent) person height. */
  imageToVisibleRatio: number;
  /** Source-image width divided by the visible person height. */
  imageWidthToVisibleHeightRatio: number;
  /** Transparent pixels below the person divided by the visible person height. */
  bottomPaddingToVisibleRatio: number;
};

const DEFAULT_VISIBLE_BOUNDS: VisibleImageBounds = {
  imageToVisibleRatio: 1,
  imageWidthToVisibleHeightRatio: 1,
  bottomPaddingToVisibleRatio: 0,
};

/**
 * Mirrors LineupCanvas.visiblePersonBounds for the plain-image public renderer. Cutouts can
 * contain very different amounts of transparent padding; measuring alpha keeps their visible
 * bodies at the same scale and lets saved y coordinates anchor their feet, not the PNG edge.
 */
function measureVisibleImageBounds(image: HTMLImageElement): VisibleImageBounds {
  if (!image.naturalWidth || !image.naturalHeight) return DEFAULT_VISIBLE_BOUNDS;

  try {
    const sampleHeight = Math.min(512, Math.max(1, image.naturalHeight));
    const sampleWidth = Math.max(1, Math.round((image.naturalWidth / image.naturalHeight) * sampleHeight));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return DEFAULT_VISIBLE_BOUNDS;
    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
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
    if (lastRow < firstRow) return DEFAULT_VISIBLE_BOUNDS;
    const visibleRows = Math.max(1, lastRow - firstRow + 1);
    return {
      imageToVisibleRatio: sampleHeight / visibleRows,
      imageWidthToVisibleHeightRatio: sampleWidth / visibleRows,
      bottomPaddingToVisibleRatio: Math.max(0, sampleHeight - lastRow - 1) / visibleRows,
    };
  } catch {
    // A storage host without image CORS cannot be sampled. The unadjusted cutout remains usable.
    return DEFAULT_VISIBLE_BOUNDS;
  }
}

/**
 * Horizontal center position for each figure, as a percent of scene width. Tighter than a
 * naive even spread — this is deliberately snugger than "safe" bounding-box math would
 * suggest, because the depth stagger below (alternating figures slightly back + smaller)
 * does the real work of keeping people from visually merging even when their footprints
 * overlap a little. That combination is what lets the group read as "close together" rather
 * than "lined up with gaps" — which is closer to how an actual group photo is composed.
 */
function slotPosition(index: number, total: number) {
  if (total <= 1) return 50;
  const step = Math.max(14, 25 - total * 1.3);
  const span = Math.min(86, step * (total - 1));
  const actualStep = span / (total - 1);
  return 50 - span / 2 + index * actualStep;
}

interface Props {
  eventId: string;
  initialParticipants: ParticipantRow[];
  /** Defaults to "The bridal party" — the public board passes something like "Jess's bridal party". */
  title?: string;
  currentParticipantId?: string | null;
  currentParticipantToken?: string | null;
  expanded?: boolean;
}

/**
 * The bridal party lineup, composited as one shared scene: each confirmed look has already
 * had its background removed (see src/lib/cutout/extract.ts, run inline at confirm time),
 * so the cutouts are simply layered onto a single backdrop, bride centered and bridesmaids
 * fanned out by join order — a group photo, not a row of individual cards. Both the bride's
 * dashboard and the public invite page render this same component. A realtime-safe lineup
 * event is emitted only when someone becomes confirmed, then the sanitized lineup is refreshed
 * once — there is no periodic polling.
 */
export function LineupRow({
  eventId,
  initialParticipants,
  title = "The bridal party",
  currentParticipantId = null,
  currentParticipantToken = null,
  expanded = false,
}: Props) {
  const [participants, setParticipants] = useState<ParticipantRow[]>(() => centeredLineup(initialParticipants));
  const [visibleBounds, setVisibleBounds] = useState<Record<string, VisibleImageBounds>>({});
  const [positions, setPositions] = useState<Record<string, LineupPosition>>(() => Object.fromEntries(
    initialParticipants.map((participant) => [participant.id, {
      participant_id: participant.id,
      x: participant.lineup_x ?? 0.5,
      y: participant.lineup_y ?? 0.07,
      z_index: participant.lineup_z_index ?? 0,
      hidden: participant.lineup_hidden ?? false,
    }]),
  ));

  const figureRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const seenIds = useRef(new Set<string>(initialParticipants.filter((p) => p.status === "confirmed" && p.cutout_url).map((p) => p.id)));
  const [suggestionTargetId, setSuggestionTargetId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // No polling: the database emits a safe lineup_updates row only when a participant
  // actually becomes confirmed. We then make one public lineup read to get the complete,
  // sanitized scene.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/lineup`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) {
          setParticipants(centeredLineup((json.participants ?? []) as ParticipantRow[]));
          setPositions((json.positions ?? {}) as Record<string, LineupPosition>);
        }
      } catch (err) {
        console.error("Could not refresh lineup", err);
      }
    };

    const channel = supabase
      .channel(`lineup:${eventId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lineup_updates", filter: `event_id=eq.${eventId}` },
        () => { void refresh(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  // FLIP for repositioning (the line recenters as people join), plus a fade-and-rise
  // entrance for anyone genuinely new to the scene, so the group photo fills in gently
  // rather than each new figure just popping into existence.
  useLayoutEffect(() => {
    participants.forEach((p) => {
      const el = figureRefs.current.get(p.id);
      if (!el) return;
      const next = el.getBoundingClientRect();
      const prev = prevRects.current.get(p.id);
      const isNew = !seenIds.current.has(p.id);

      if (isNew) {
        seenIds.current.add(p.id);
        el.style.transition = "none";
        el.style.opacity = "0";
        el.style.transform = "translateY(14px) scale(0.96)";
        requestAnimationFrame(() => {
          el.style.transition = "opacity 420ms ease-out, transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)";
          el.style.opacity = "1";
          el.style.transform = "";
        });
      } else if (prev) {
        const dx = prev.left - next.left;
        if (dx) {
          el.style.transition = "none";
          el.style.transform = `translateX(${dx}px)`;
          requestAnimationFrame(() => {
            el.style.transition = "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)";
            el.style.transform = "";
          });
        }
      }
      prevRects.current.set(p.id, next);
    });
  }, [participants]);

  const suggestionTarget = suggestionTargetId ? participants.find((p) => p.id === suggestionTargetId) ?? null : null;

  return (
    <div className={expanded ? "flex h-full min-h-0 w-full flex-col" : undefined}>
      {participants.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-stone-200 bg-stone-50/50">
          <div className="text-center">
            <p className="font-serif text-lg text-stone-700">Your lineup is taking shape.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-stone-400">When the bride or a bridesmaid confirms a VTO look, it appears here automatically. No manual refresh needed.</p>
          </div>
        </div>
      ) : (
        <div className={`relative w-full overflow-hidden rounded-xl bg-stone-300 shadow-[0_8px_24px_-14px_rgba(28,25,23,0.28)] ring-1 ring-inset ring-white/40 ${expanded ? "lineup-expanded-scene" : "aspect-[16/9] sm:aspect-[21/9]"}`}>
          <div
            className="lineup-pan-surface absolute inset-0"
            style={{ overflowX: participants.length > 6 ? "auto" : "hidden" }}
          >
            <div
              className="relative h-full bg-gradient-to-b from-stone-300 via-stone-200 to-stone-300"
              style={{ minWidth: participants.length > 6 ? `${participants.length * 16}%` : "100%" }}
            >
          {/* Soft studio-backdrop feel without requiring a real venue photo asset. */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(255,255,255,0.4),transparent_58%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,transparent_55%,rgba(28,25,23,0.10)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/12 to-transparent" />

          {participants.map((p, index) => {
            const left = slotPosition(index, participants.length);
            const isBack = p.role !== "bride" && index % 2 === 1;
            const bounds = visibleBounds[p.id] ?? DEFAULT_VISIBLE_BOUNDS;
            // Compose Studio fits every visible person to 82% of its canvas height.
            const visibleHeightPct = 82;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) figureRefs.current.set(p.id, el);
                  else figureRefs.current.delete(p.id);
                }}
                className={`absolute flex -translate-x-1/2 touch-manipulation flex-col items-center ${currentParticipantId && suggestionsOpen ? "cursor-pointer" : ""} ${suggestionTargetId === p.id ? "z-[40]" : ""}`}
                onClick={() => currentParticipantId && suggestionsOpen && setSuggestionTargetId(p.id === currentParticipantId ? null : p.id)}
                style={{
                  left: positions[p.id] ? `${positions[p.id].x * 100}%` : `${left}%`,
                  bottom: positions[p.id] ? `${positions[p.id].y * 100}%` : isBack ? "6%" : "4%",
                  height: `${visibleHeightPct}%`,
                  zIndex: positions[p.id]?.z_index ?? (p.role === "bride" ? 10 : isBack ? 3 : 6),
                  opacity: positions[p.id]?.hidden ? 0 : 1,
                }}
              >
                <div
                  className="relative h-full"
                  style={{ aspectRatio: bounds.imageWidthToVisibleHeightRatio }}
                >
                  {/* Contact shadow — the detail that sells "standing in the scene" over "pasted on". */}
                  <div className="absolute bottom-0 left-1/2 h-[6%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-sm" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, domain varies per project */}
                  <img
                    src={p.cutout_url!}
                    alt=""
                    crossOrigin="anonymous"
                    draggable={false}
                    onLoad={(event) => {
                      const measured = measureVisibleImageBounds(event.currentTarget);
                      setVisibleBounds((current) => {
                        const previous = current[p.id];
                        if (previous
                          && previous.imageToVisibleRatio === measured.imageToVisibleRatio
                          && previous.imageWidthToVisibleHeightRatio === measured.imageWidthToVisibleHeightRatio
                          && previous.bottomPaddingToVisibleRatio === measured.bottomPaddingToVisibleRatio) return current;
                        return { ...current, [p.id]: measured };
                      });
                    }}
                    className="absolute left-1/2 w-auto max-w-none -translate-x-1/2 select-none object-contain object-bottom drop-shadow-[0_10px_14px_rgba(28,25,23,0.28)]"
                    style={{
                      height: `${bounds.imageToVisibleRatio * 100}%`,
                      bottom: `${-bounds.bottomPaddingToVisibleRatio * 100}%`,
                      ...(isBack ? { filter: "brightness(0.94) saturate(0.94)" } : {}),
                    }}
                  />
                </div>
              </div>
            );
          })}
            </div>
          </div>

          {currentParticipantId && (
            <SuggestionTools
              eventId={eventId}
              currentParticipantId={currentParticipantId}
              currentParticipantToken={currentParticipantToken}
              target={suggestionTarget}
              onOpenChange={(open) => {
                setSuggestionsOpen(open);
                if (!open) setSuggestionTargetId(null);
              }}
              className="lineup-chat-controls absolute z-[200]"
            />
          )}
        </div>
      )}
    </div>
  );
}
