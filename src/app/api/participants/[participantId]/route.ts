import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts } from "@/lib/vto/participant";
import { extractCutout } from "@/lib/cutout/extract";

async function authorize(participantId: string, token: string | null) {
  const service = createServiceRoleClient();
  const { data: participant } = await service.from("participants").select("*").eq("id", participantId).maybeSingle();
  if (!participant) return { ok: false as const, status: 404, message: "Participant not found" };
  if (token && token === participant.session_token) return { ok: true as const, participant, service };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: event } = await service.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
    if (event?.owner_id === user.id) return { ok: true as const, participant, service };
  }
  return { ok: false as const, status: 403, message: "Not authorized" };
}

export async function GET(req: NextRequest, { params }: { params: { participantId: string } }) {
  const auth = await authorize(params.participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const result = await getParticipantWithAttempts(auth.service, params.participantId);
  return NextResponse.json({ participant: result.participant });
}

const ALLOWED_FIELDS = ["original_photo_path", "status"] as const;

export async function PATCH(req: NextRequest, { params }: { params: { participantId: string } }) {
  const auth = await authorize(params.participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body = await req.json();
  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([k]) => (ALLOWED_FIELDS as readonly string[]).includes(k))
  );

  if (body.status === "confirmed") {
    const attemptId = typeof body.confirmed_look_id === "string" ? body.confirmed_look_id : null;
    if (!attemptId) return NextResponse.json({ error: "confirmed_look_id is required" }, { status: 400 });
    const { data: attempt } = await auth.service
      .from("vto_attempts")
      .select("id,participant_id,status,render_path,body_photo_path")
      .eq("id", attemptId)
      .eq("participant_id", params.participantId)
      .maybeSingle();
    if (!attempt || !["ready", "confirmed"].includes(attempt.status) || !attempt.render_path) {
      return NextResponse.json({ error: "A completed VTO preview is required." }, { status: 409 });
    }

    // Same rule as the bride's confirm route: extraction runs inline, right here, before
    // status ever moves off "pending". No polling, no intermediate state to reconcile —
    // either this request finishes with a cutout in hand and confirms, or it fails and the
    // participant is exactly as pending as they were before they clicked confirm.
    let cutoutPath: string;
    try {
      cutoutPath = await extractCutout(attempt.render_path, attempt.id, auth.participant.role);
    } catch (err) {
      console.error("participant cutout extraction failed", err);
      return NextResponse.json({ error: "Could not prepare this look for the group photo. Please try again." }, { status: 502 });
    }

    await auth.service.from("vto_attempts").update({ status: "ready" }).eq("participant_id", params.participantId).eq("status", "confirmed");
    const { error: attemptError } = await auth.service.from("vto_attempts").update({ status: "confirmed", cutout_path: cutoutPath }).eq("id", attemptId);
    if (attemptError) return NextResponse.json({ error: attemptError.message }, { status: 500 });
    patch.confirmed_look_id = attemptId;
    patch.original_photo_path = attempt.body_photo_path;
    patch.status = "confirmed";
  }

  const { data, error } = await auth.service.from("participants").update(patch).eq("id", params.participantId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result = await getParticipantWithAttempts(auth.service, data.id);
  return NextResponse.json({ participant: result.participant });
}
