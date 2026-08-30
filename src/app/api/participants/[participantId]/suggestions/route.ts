import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function authorize(participantId: string, token: string | null) {
  const service = createServiceRoleClient();
  const { data: participant } = await service
    .from("participants")
    .select("id,event_id,user_id,name,role,status,confirmed_look_id,session_token")
    .eq("id", participantId)
    .maybeSingle();
  if (!participant) return { ok: false as const, status: 404, message: "Participant not found" };
  if (token && token === participant.session_token) return { ok: true as const, participant, service };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: event } = await service.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
    if (event?.owner_id === user.id && participant.role === "bride" && participant.user_id === user.id) {
      return { ok: true as const, participant, service };
    }
  }

  return { ok: false as const, status: 403, message: "Not authorized" };
}

async function readSuggestions(service: ReturnType<typeof createServiceRoleClient>, participantId: string, currentLookId: string | null) {
  if (!currentLookId) return [];
  const { data: rows, error } = await service
    .from("participant_suggestions")
    .select("id,from_participant_id,to_participant_id,text,created_at")
    .eq("to_participant_id", participantId)
    .eq("target_look_id", currentLookId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const senderIds = [...new Set((rows ?? []).map((row) => row.from_participant_id))];
  if (!senderIds.length) return [];
  const { data: senders, error: senderError } = await service
    .from("participants")
    .select("id,name")
    .in("id", senderIds);
  if (senderError) throw new Error(senderError.message);

  const nameById = new Map((senders ?? []).map((sender) => [sender.id, sender.name]));
  return (rows ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    created_at: row.created_at,
    from_participant_id: row.from_participant_id,
    from_name: nameById.get(row.from_participant_id) ?? "Someone",
  }));
}

export async function GET(req: NextRequest, { params }: { params: { participantId: string } }) {
  const auth = await authorize(params.participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const suggestions = await readSuggestions(auth.service, auth.participant.id, auth.participant.confirmed_look_id);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load suggestions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { participantId: string } }) {
  const auth = await authorize(params.participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  if (auth.participant.status !== "confirmed" || !auth.participant.confirmed_look_id) {
    return NextResponse.json({ error: "Confirm your look before sending suggestions." }, { status: 409 });
  }
  const body = (await req.json()) as { to_participant_id?: unknown; text?: unknown };
  const targetId = typeof body.to_participant_id === "string" ? body.to_participant_id : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!targetId || targetId === auth.participant.id) return NextResponse.json({ error: "Choose another participant." }, { status: 400 });
  if (!text || text.length > 500) return NextResponse.json({ error: "Suggestion must be between 1 and 500 characters." }, { status: 400 });

  const { data: target } = await auth.service
    .from("participants")
    .select("id,event_id,status,confirmed_look_id")
    .eq("id", targetId)
    .eq("event_id", auth.participant.event_id)
    .maybeSingle();
  if (!target || target.status !== "confirmed" || !target.confirmed_look_id) {
    return NextResponse.json({ error: "That participant is not currently in the confirmed lineup." }, { status: 409 });
  }

  const { data, error } = await auth.service
    .from("participant_suggestions")
    .insert({
      event_id: auth.participant.event_id,
      from_participant_id: auth.participant.id,
      to_participant_id: target.id,
      target_look_id: target.confirmed_look_id,
      text,
    })
    .select("id,text,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ suggestion: data }, { status: 201 });
}
