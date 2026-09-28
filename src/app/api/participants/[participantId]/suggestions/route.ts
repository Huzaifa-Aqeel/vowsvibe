import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { participantAiPlan } from "@/lib/billing/plan";
import { RevenueCatUnavailableError } from "@/lib/billing/revenuecat";
import { canExchangeSuggestion } from "@/lib/suggestions/permissions";

async function authorize(participantId: string, token: string | null) {
  const service = createServiceRoleClient();
  const { data: participant } = await service
    .from("participants")
    .select("id,event_id,user_id,name,role,status,confirmed_look_id,session_token")
    .eq("id", participantId)
    .maybeSingle();
  if (!participant) return { ok: false as const, status: 404, message: "Participant not found" };
  if (token && token === participant.session_token) return { ok: true as const, participant, service };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: event } = await service.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
    if (event?.owner_id === user.id && participant.role === "bride" && participant.user_id === user.id) {
      return { ok: true as const, participant, service };
    }
  }

  return { ok: false as const, status: 403, message: "Not authorized" };
}

async function readSuggestions(
  service: ReturnType<typeof createServiceRoleClient>,
  participant: { id: string; event_id: string },
) {
  const { data: rows, error } = await service
    .from("participant_suggestions")
    .select("id,from_participant_id,to_participant_id,target_look_id,text,created_at")
    .eq("event_id", participant.event_id)
    .or(`from_participant_id.eq.${participant.id},to_participant_id.eq.${participant.id}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const { data: party, error: partyError } = await service
    .from("participants")
    .select("id,name,role,status,confirmed_look_id")
    .eq("event_id", participant.event_id);
  if (partyError) throw new Error(partyError.message);

  const partyById = new Map((party ?? []).map((person) => [person.id, person]));
  return (rows ?? []).flatMap((row) => {
    const sender = partyById.get(row.from_participant_id);
    const recipient = partyById.get(row.to_participant_id);
    const brideAndBridesmaid = sender && recipient && canExchangeSuggestion(sender.role, recipient.role);

    // Old cross-bridesmaid records are intentionally hidden. Messages also belong to
    // the recipient's current confirmed look, matching the existing stale-look behavior.
    if (!brideAndBridesmaid || recipient.status !== "confirmed" || recipient.confirmed_look_id !== row.target_look_id) return [];
    return [{
      id: row.id,
      text: row.text,
      created_at: row.created_at,
      from_participant_id: row.from_participant_id,
      to_participant_id: row.to_participant_id,
      from_name: sender.name,
      to_name: recipient.name,
    }];
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const auth = await authorize(participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const suggestions = await readSuggestions(auth.service, auth.participant);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load suggestions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const auth = await authorize(participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const plan = await participantAiPlan(auth.service, auth.participant);
    if (plan.tier !== "pro") {
      return NextResponse.json({
        error: auth.participant.role === "bride"
          ? "Party collaboration requires an active Vows & Vibe Pro Wedding Pass."
          : "The bride needs an active Vows & Vibe Pro Wedding Pass before the party can send suggestions.",
        code: "PRO_REQUIRED",
        upgrade_required: true,
      }, { status: 402 });
    }
  } catch (error) {
    if (error instanceof RevenueCatUnavailableError) {
      return NextResponse.json({ error: error.message, code: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
    }
    throw error;
  }

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
    .select("id,event_id,role,status,confirmed_look_id")
    .eq("id", targetId)
    .eq("event_id", auth.participant.event_id)
    .maybeSingle();
  if (!target || target.status !== "confirmed" || !target.confirmed_look_id) {
    return NextResponse.json({ error: "That participant is not currently in the confirmed lineup." }, { status: 409 });
  }
  const validDirection = canExchangeSuggestion(auth.participant.role, target.role);
  if (!validDirection) {
    return NextResponse.json({ error: "Suggestions can only be exchanged between the bride and a bridesmaid." }, { status: 400 });
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const auth = await authorize(participantId, req.nextUrl.searchParams.get("token"));
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as { suggestion_id?: unknown } | null;
  const suggestionId = typeof body?.suggestion_id === "string" ? body.suggestion_id : "";
  if (!suggestionId) return NextResponse.json({ error: "Suggestion ID is required." }, { status: 400 });

  // A participant may permanently remove only messages delivered to their own inbox.
  // Using both predicates also prevents a valid session from probing/deleting other rows.
  const { data, error } = await auth.service
    .from("participant_suggestions")
    .delete()
    .eq("id", suggestionId)
    .eq("to_participant_id", auth.participant.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
