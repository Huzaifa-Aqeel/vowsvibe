import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantsWithAttempts, publicParticipant } from "@/lib/vto/participant";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateItem(item: Record<string, unknown>) {
  return (
    typeof item.participant_id === "string" &&
    isFiniteNumber(item.x) && item.x >= 0 && item.x <= 1 &&
    isFiniteNumber(item.y) && item.y >= 0 && item.y <= 1 &&
    Number.isInteger(item.z_index) &&
    typeof item.hidden === "boolean"
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const admin = createServiceRoleClient();
  const { data: rows, error } = await admin
    .from("participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const participantIds = (rows ?? []).map((row) => row.id);
  const batch = await getParticipantsWithAttempts(admin, participantIds);
  if (batch.error) return NextResponse.json({ error: batch.error.message }, { status: 500 });

  const participants = batch.participants.map((participant) => ({
    ...publicParticipant(participant),
    confirmed_dress_primary_hex: null as string | null,
    confirmed_dress_color_name: null as string | null,
  }));

  const lookIds = batch.participants.map((participant) => participant.confirmed_look_id).filter(Boolean) as string[];
  if (lookIds.length) {
    const { data: attempts } = await admin
      .from("vto_attempts")
      .select("id,participant_dress_id")
      .in("id", lookIds);
    const dressIds = (attempts ?? []).map((attempt) => attempt.participant_dress_id).filter(Boolean) as string[];
    if (dressIds.length) {
      const { data: dresses } = await admin
        .from("participant_dresses")
        .select("id,primary_hex,color_name")
        .in("id", dressIds);
      const dressById = new Map((dresses ?? []).map((dress: { id: string; primary_hex: string | null; color_name: string | null }) => [dress.id, dress]));
      const participantByLook = new Map<string, string>();
      batch.participants.forEach((participant) => {
        if (participant.confirmed_look_id) participantByLook.set(participant.confirmed_look_id, participant.id);
      });
      (attempts ?? []).forEach((attempt) => {
        const participantId = participantByLook.get(attempt.id);
        const participant = participants.find((item) => item.id === participantId);
        const dress = attempt.participant_dress_id ? dressById.get(attempt.participant_dress_id) : undefined;
        if (participant) {
          participant.confirmed_dress_primary_hex = dress?.primary_hex ?? null;
          participant.confirmed_dress_color_name = dress?.color_name ?? null;
        }
      });
    }
  }

  const positions = Object.fromEntries(
    batch.participants.map((participant) => [participant.id, {
      participant_id: participant.id,
      x: participant.lineup_x ?? 0.5,
      y: participant.lineup_y ?? 0.07,
      z_index: participant.lineup_z_index ?? 0,
      hidden: participant.lineup_hidden ?? false,
    }]),
  );

  return NextResponse.json({ participants, positions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createServiceRoleClient();
  const { data: event } = await admin
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const body = (await req.json()) as { items?: unknown };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "At least one lineup item is required" }, { status: 400 });
  }
  if (body.items.length > 50 || !body.items.every((item) => item && typeof item === "object" && validateItem(item as Record<string, unknown>))) {
    return NextResponse.json({ error: "Invalid lineup metadata" }, { status: 400 });
  }

  const { data: confirmed } = await admin
    .from("participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  const allowedIds = new Set((confirmed ?? []).map((row) => row.id));
  const items = (body.items as Array<Record<string, unknown>>).filter((item) => allowedIds.has(item.participant_id as string));
  if (!items.length) return NextResponse.json({ error: "No confirmed participants matched the lineup" }, { status: 400 });

  const results = await Promise.all(
    items.map((item) =>
      admin
        .from("participants")
        .update({
          lineup_x: item.x,
          lineup_y: item.y,
          lineup_z_index: item.z_index,
          lineup_hidden: item.hidden,
        })
        .eq("id", item.participant_id as string)
        .eq("event_id", eventId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  // The DB trigger emits lineup_updates for these participant changes. The browser never
  // subscribes to the private participants table, only to the sanitized signal.
  return NextResponse.json({ ok: true });
}
