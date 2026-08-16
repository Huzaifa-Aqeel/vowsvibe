import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json();
  if (!body.title || typeof body.title !== "string") return NextResponse.json({ error: "Event title is required" }, { status: 400 });
  const { data, error } = await supabase.from("events").insert({ owner_id: user.id, title: body.title, event_date: body.event_date || null, dress_style: body.dress_style || null, dress_length: body.dress_length || null, fabric_type: body.fabric_type || null, color_palette: body.color_palette ?? [], example_dresses: body.example_dresses ?? [] }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const admin = createServiceRoleClient();
  const { error: brideError } = await admin.from("participants").insert({ event_id: data.id, user_id: user.id, name: "Bride", role: "bride", status: "pending" });
  if (brideError) { await admin.from("events").delete().eq("id", data.id); return NextResponse.json({ error: brideError.message }, { status: 500 }); }
  return NextResponse.json({ event: data });
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase.from("events").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}
