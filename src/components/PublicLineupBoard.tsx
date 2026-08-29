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

  if (participants === null) {
    return <div className="lineup-expanded-scene w-full animate-pulse rounded-2xl bg-stone-100" />;
  }

  return (
    <LineupRow
      eventId={eventId}
      initialParticipants={participants}
      title={`${eventTitle}'s bridal party`}
      currentParticipantId={currentParticipantId}
      currentParticipantToken={currentParticipantToken}
      expanded
    />
  );
}
