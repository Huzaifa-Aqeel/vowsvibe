import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts } from "@/lib/vto/participant";

export async function POST(req: NextRequest) {
  const admin = createServiceRoleClient();
  const { event_id, name } = await req.json();
  if (!event_id || typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "event_id and name are required" }, { status: 400 });
  const cleanName = name.trim().slice(0, 255);
  const { data: event } = await admin.from("events").select("id").eq("invite_code", event_id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  const eventId = event.id;
  const { data: existing } = await admin.from("participants").select("id").eq("event_id", eventId).ilike("name", cleanName).maybeSingle();
  if (existing) {
    // Knowing someone's name must never reveal her private session token or photos.
    return NextResponse.json({ error: "That name has already joined. Return using the original browser or use a distinct name." }, { status: 409 });
  }
  const { data, error } = await admin.from("participants").insert({ event_id: eventId, name: cleanName, role: "bridesmaid" }).select().single();
  if (error) {
    const { data: race } = await admin.from("participants").select("id").eq("event_id", eventId).ilike("name", cleanName).maybeSingle();
    if (race) return NextResponse.json({ error: "That name has already joined. Use a distinct name." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const result = await getParticipantWithAttempts(admin, data.id);
  return NextResponse.json({ participant: result.participant });
}
