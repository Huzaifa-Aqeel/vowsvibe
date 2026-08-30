"use client";

import { useEffect, useState } from "react";
import { LineupRow } from "@/components/LineupRow";
import type { ParticipantRow } from "@/lib/types";

export function PublicLineupBoard({ eventId, eventTitle, currentParticipantId, currentParticipantToken }: {
  eventId: string;
  eventTitle: string;
  currentParticipantId?: string | null;
  currentParticipantToken?: string | null;
}) {
  const [participants, setParticipants] = useState<ParticipantRow[] | null>(null);
  const [view, setView] = useState<"lineup" | "preview">("lineup");
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}/lineup`)
      .then((r) => r.json())
      .then(({ participants }) => {
        if (!cancelled) setParticipants(participants ?? []);
      })
      .catch(() => {
        if (!cancelled) setParticipants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}/group-preview`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => { if (!cancelled) setPreviewUrl(body.previewUrl ?? null); })
      .catch(() => { if (!cancelled) setPreviewUrl(null); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (participants === null) {
    return <div className="lineup-expanded-scene w-full animate-pulse rounded-xl bg-stone-100" />;
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col pt-14">
      <div className="absolute left-1/2 top-1 z-[220] flex -translate-x-1/2 rounded-full border border-stone-200 bg-white/90 p-1 shadow-lg backdrop-blur-xl" role="group" aria-label="Lineup view">
        {(["lineup", "preview"] as const).map((option) => <button key={option} type="button" onClick={() => setView(option)} className={`min-h-10 rounded-full px-4 text-xs font-semibold transition-all duration-300 ${view === option ? "bg-stone-900 text-white shadow" : "text-stone-500 hover:text-stone-900"}`}>{option === "lineup" ? "Lineup" : "Group Preview"}</button>)}
      </div>
      <div className={view === "lineup" ? "flex min-h-0 flex-1" : "hidden"}>
        <LineupRow eventId={eventId} initialParticipants={participants} title={`${eventTitle}'s bridal party`} currentParticipantId={currentParticipantId} currentParticipantToken={currentParticipantToken} expanded />
      </div>
      {view === "preview" && (
        <div className="lineup-expanded-scene flex w-full items-center justify-center overflow-hidden rounded-xl bg-stone-200 p-3 shadow-[0_8px_24px_-14px_rgba(28,25,23,0.28)]">
          {previewUrl === undefined ? <div className="h-full w-full animate-pulse rounded-lg bg-stone-300" /> : previewUrl ? <img src={previewUrl} alt={`${eventTitle} group preview`} className="h-full w-full rounded-lg object-contain" /> : <div className="max-w-sm text-center"><p className="font-serif text-xl text-stone-700">Group preview coming soon</p><p className="mt-2 text-xs leading-5 text-stone-500">The bride has not saved a group preview for this event yet.</p></div>}
        </div>
      )}
    </div>
  );
}
