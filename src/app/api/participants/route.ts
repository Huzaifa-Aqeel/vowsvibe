import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts } from "@/lib/vto/participant";

export async function POST(req: NextRequest) {
  const admin = createServiceRoleClient();
  const { event_id, name } = await req.json();
  if (!event_id || typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "event_id and name are required" }, { status: 400 });
  const cleanName = name.trim().slice(0, 255);
  const { data: event } = await admin.from("events").select("id").eq("invite_code", event_id).maybeSingle();
  const eventId = event?.id ?? event_id;
  const { data: eventExists } = await admin.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!eventExists) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const { data: existing } = await admin.from("participants").select("id").eq("event_id", eventId).ilike("name", cleanName).maybeSingle();
  if (existing) {
    const result = await getParticipantWithAttempts(admin, existing.id);
    return NextResponse.json({ participant: result.participant });
  }
  const { data, error } = await admin.from("participants").insert({ event_id: eventId, name: cleanName, role: "bridesmaid" }).select().single();
  if (error) {
    const { data: race } = await admin.from("participants").select("id").eq("event_id", eventId).ilike("name", cleanName).maybeSingle();
    if (race) { const result = await getParticipantWithAttempts(admin, race.id); return NextResponse.json({ participant: result.participant }); }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const result = await getParticipantWithAttempts(admin, data.id);
  return NextResponse.json({ participant: result.participant });
}
