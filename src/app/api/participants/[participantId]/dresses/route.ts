import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/storage/upload";

async function authorized(req: NextRequest, participantId: string) {
  const admin = createServiceRoleClient();
  const { data: participant } = await admin.from("participants").select("*").eq("id", participantId).maybeSingle();
  if (!participant) return null;
  const token = req.nextUrl.searchParams.get("token");
  if (token === participant.session_token) return { admin, participant };
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: event } = await admin.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
  return event?.owner_id === user.id ? { admin, participant } : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const auth = await authorized(req, participantId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { storage_path, primary_hex, color_name } = await req.json();
  if (!storage_path || typeof storage_path !== "string") return NextResponse.json({ error: "storage_path is required" }, { status: 400 });
  // Persist LLM output to participant_dresses. If the DB schema lacks the new column(s),
  // let the error surface so you can run the migration.
  const { data, error } = await auth.admin.from("participant_dresses").upsert({
    participant_id: participantId,
    storage_path,
    primary_hex: typeof primary_hex === "string" ? primary_hex : null,
    color_name: typeof color_name === "string" ? color_name.slice(0, 255) : null,
  }, { onConflict: "participant_id,storage_path" }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dress: data });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ participantId: string }> }) {
  const { participantId } = await params;
  const auth = await authorized(req, participantId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data, error } = await auth.admin.from("participant_dresses").select("*").eq("participant_id", participantId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dresses: (data ?? []).map((dress) => ({ ...dress, url: publicStorageUrl(dress.storage_path) })) });
}
