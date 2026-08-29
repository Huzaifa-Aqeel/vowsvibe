import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { LineupCanvas } from "@/components/LineupCanvas";
import { getParticipantsWithAttempts } from "@/lib/vto/participant";
import type { EventRow, LineupPosition, ParticipantRow } from "@/lib/types";

export default async function BrideLineupPage({ params }: { params: { eventId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", params.eventId)
    .eq("owner_id", user.id)
    .maybeSingle<EventRow>();
  if (!event) notFound();

  const admin = createServiceRoleClient();
  const { data: rows } = await admin
    .from("participants")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });
  const batch = await getParticipantsWithAttempts(admin, (rows ?? []).map((row) => row.id));
  const participants = batch.participants as ParticipantRow[];

  const initialPositions: Record<string, LineupPosition> = Object.fromEntries(
    participants.map((participant) => [participant.id, {
      participant_id: participant.id,
      x: participant.lineup_x ?? 0.5,
      y: participant.lineup_y ?? 0.07,
      scale: participant.lineup_scale ?? 1,
      z_index: participant.lineup_z_index ?? 0,
      hidden: participant.lineup_hidden ?? false,
    }]),
  );

  const pageParticipants = participants.map((participant) => ({
    ...participant,
    confirmed_dress_primary_hex: null,
    confirmed_dress_color_name: null,
  }));
  const confirmedLookIds = participants.map((participant) => participant.confirmed_look_id).filter(Boolean) as string[];
  if (confirmedLookIds.length) {
    const { data: attempts } = await admin
      .from("vto_attempts")
      .select("id,participant_dress_id,participant_id")
      .in("id", confirmedLookIds);
    const dressIds = (attempts ?? []).map((attempt) => attempt.participant_dress_id).filter(Boolean) as string[];
    const { data: dresses } = dressIds.length
      ? await admin.from("participant_dresses").select("id,primary_hex,color_name").in("id", dressIds)
      : { data: [] };
    const dressById = new Map((dresses ?? []).map((dress) => [dress.id, dress]));
    const attemptByParticipant = new Map((attempts ?? []).map((attempt) => [attempt.participant_id, attempt]));
    pageParticipants.forEach((participant) => {
      const attempt = attemptByParticipant.get(participant.id);
      const dress = attempt?.participant_dress_id ? dressById.get(attempt.participant_dress_id) : null;
      participant.confirmed_dress_primary_hex = dress?.primary_hex ?? null;
      participant.confirmed_dress_color_name = dress?.color_name ?? null;
    });
  }

  return (
    <main className="lineup-page-safe-studio min-h-screen bg-[#f7f2ee]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-1 sm:mb-2">
          <Link
            href={`/events/${event.id}`}
            className="inline-flex min-h-11 touch-manipulation items-center gap-2 text-xs font-semibold text-stone-500 transition active:text-stone-900 sm:hover:text-stone-900"
          >
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
          <h1 className="font-serif text-xl leading-none text-stone-900 sm:text-2xl lg:text-3xl">Compose the group photo</h1>
          <p className="mt-0.5 line-clamp-1 max-w-3xl text-xs leading-5 text-stone-500 sm:line-clamp-none">
            Arrange your bridal party just the way you want. Drag each look into place, and save your lineup. Everyone will see the latest arrangement in real time.
          </p>
        </div>
        <div className="lineup-bride-full-width">
          <LineupCanvas event={event} participants={pageParticipants} initialPositions={initialPositions} />
        </div>
      </div>
    </main>
  );
}
