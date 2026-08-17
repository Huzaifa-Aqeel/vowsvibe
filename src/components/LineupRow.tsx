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

/**
 * How tall each figure stands, as a percent of the scene's height. Shrinks modestly as the
 * party grows so a bigger lineup still fits without cramming — holds close to full size for
 * the common case of a bride plus a handful of bridesmaids.
 */
function figureHeightPct(total: number) {
  return Math.max(66, 90 - total * 3);
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
}: Props) {
  const [participants, setParticipants] = useState<ParticipantRow[]>(() => centeredLineup(initialParticipants));
  const [positions, setPositions] = useState<Record<string, LineupPosition>>(() => Object.fromEntries(
    initialParticipants.map((participant) => [participant.id, {
      participant_id: participant.id,
      x: participant.lineup_x ?? 0.5,
      y: participant.lineup_y ?? 0.07,
      scale: participant.lineup_scale ?? 1,
      z_index: participant.lineup_z_index ?? 0,
      hidden: participant.lineup_hidden ?? false,
    }]),
  ));

  const figureRefs = useRef(new Map<string, HTMLDivElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const seenIds = useRef(new Set<string>(initialParticipants.filter((p) => p.status === "confirmed" && p.cutout_url).map((p) => p.id)));
  const [suggestionTargetId, setSuggestionTargetId] = useState<string | null>(null);

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

  const baseHeightPct = figureHeightPct(participants.length);
  const suggestionTarget = suggestionTargetId ? participants.find((p) => p.id === suggestionTargetId) ?? null : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-rose-700">Confirmed looks</p>
          <h3 className="mt-1 font-serif text-2xl text-stone-900">{title}</h3>
          <p className="mt-1 text-xs text-stone-500">Only fully confirmed VTO looks are placed here.</p>
        </div>
        {currentParticipantId && (
          <SuggestionTools
            eventId={eventId}
            currentParticipantId={currentParticipantId}
            currentParticipantToken={currentParticipantToken}
            target={suggestionTarget}
            className="w-full max-w-sm"
          />
        )}
      </div>

      {participants.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/50">
          <div className="text-center">
            <p className="font-serif text-lg text-stone-700">Your lineup is taking shape.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-stone-400">When the bride or a bridesmaid confirms a VTO look, it appears here automatically. No manual refresh needed.</p>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-stone-300 via-stone-200 to-stone-300 shadow-[0_1px_2px_rgba(28,25,23,0.06),0_10px_28px_-8px_rgba(28,25,23,0.22)] ring-1 ring-inset ring-white/50 sm:aspect-[21/9]">
          {/* Soft studio-backdrop feel without requiring a real venue photo asset. */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(255,255,255,0.4),transparent_58%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,transparent_55%,rgba(28,25,23,0.10)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/12 to-transparent" />

          {participants.map((p, index) => {
            const left = slotPosition(index, participants.length);
const isBack = p.role !== "bride" && index % 2 === 1;
const heightPct = baseHeightPct;
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) figureRefs.current.set(p.id, el);
                  else figureRefs.current.delete(p.id);
                }}
                className={`absolute flex -translate-x-1/2 flex-col items-center ${currentParticipantId ? "cursor-pointer" : ""} ${suggestionTargetId === p.id ? "z-[40]" : ""}`}
                onClick={() => currentParticipantId && setSuggestionTargetId(p.id === currentParticipantId ? null : p.id)}
                style={{
                  left: positions[p.id] ? `${positions[p.id].x * 100}%` : `${left}%`,
                  bottom: positions[p.id] ? `${positions[p.id].y * 100}%` : isBack ? "6%" : "4%",
                  height: `${positions[p.id] ? heightPct * (positions[p.id].scale || 1) : heightPct}%`,
                  zIndex: positions[p.id]?.z_index ?? (p.role === "bride" ? 10 : isBack ? 3 : 6),
                  opacity: positions[p.id]?.hidden ? 0 : 1,
                }}
              >
                <div className="relative h-full">
                  {/* Contact shadow — the detail that sells "standing in the scene" over "pasted on". */}
                  <div className="absolute bottom-0 left-1/2 h-[6%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/25 blur-sm" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, domain varies per project */}
                  <img
                    src={p.cutout_url!}
                    alt=""
                    draggable={false}
                    className="relative h-full w-auto select-none object-contain object-bottom drop-shadow-[0_10px_14px_rgba(28,25,23,0.28)]"
                    style={isBack ? { filter: "brightness(0.94) saturate(0.94)" } : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
