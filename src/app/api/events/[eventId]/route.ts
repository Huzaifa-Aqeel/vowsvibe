import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { removeManyFromStoragePaths, resolveStorageUrl, storagePathFromUrl } from "@/lib/storage/upload";
import type { ExampleDress } from "@/lib/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createServiceRoleClient();
  const { data, error } = await admin.from("events").select("*").eq("id", eventId).eq("owner_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const example_dresses = await Promise.all((data.example_dresses ?? []).map(async (dress: ExampleDress) => ({ ...dress, url: resolveStorageUrl(dress.storage_path ?? dress.url) ?? dress.url })));
  return NextResponse.json({ event: { ...data, example_dresses } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json(); const allowed = ["title","event_date","dress_style","dress_length","fabric_type","color_palette","example_dresses"];
  const patch = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
  const admin = createServiceRoleClient(); const { data, error } = await admin.from("events").update(patch).eq("id", eventId).eq("owner_id", user.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createServiceRoleClient();
  const { data: event } = await admin.from("events").select("id,example_dresses,group_preview_path,group_preview_venue_path").eq("id", eventId).eq("owner_id", user.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const paths: string[] = [];
  if (event.group_preview_path) paths.push(event.group_preview_path);
  if (event.group_preview_venue_path) paths.push(event.group_preview_venue_path);
  for (const dress of (event.example_dresses ?? []) as Array<{ storage_path?: string | null; url?: string | null }>) {
    const path = dress.storage_path ?? storagePathFromUrl(dress.url); if (path) paths.push(path);
  }
  const { data: participants, error: participantError } = await admin.from("participants").select("id,original_photo_path").eq("event_id", event.id);
  if (participantError) return NextResponse.json({ error: participantError.message }, { status: 500 });
  for (const p of participants ?? []) {
    if (p.original_photo_path) paths.push(p.original_photo_path);
  }
  const participantIds = (participants ?? []).map((p) => p.id);
  if (participantIds.length) {
    const { data: dresses, error: dressError } = await admin.from("participant_dresses").select("storage_path").in("participant_id", participantIds);
    if (dressError) return NextResponse.json({ error: dressError.message }, { status: 500 });
    for (const d of dresses ?? []) if (d.storage_path) paths.push(d.storage_path);
    const { data: attempts, error: attemptsError } = await admin.from("vto_attempts").select("dress_path,body_photo_path,render_path,cutout_path").in("participant_id", participantIds);
    if (attemptsError) return NextResponse.json({ error: attemptsError.message }, { status: 500 });
    for (const a of attempts ?? []) for (const path of [a.dress_path, a.body_photo_path, a.render_path, a.cutout_path]) if (path) paths.push(path);
  }
  try { await removeManyFromStoragePaths(paths); }
  catch (err) { console.error("Event Storage cleanup failed", err); return NextResponse.json({ error: "We could not fully delete this event's media. Nothing was deleted from the database." }, { status: 502 }); }

  // Keep event deletion explicit for suggestion messages as well as the existing
  // cascading cleanup. No realtime event is emitted because clients only subscribe
  // to INSERT on suggestion_updates.
  const { error: suggestionUpdatesDeleteError } = await admin
    .from("suggestion_updates")
    .delete()
    .eq("event_id", event.id);
  if (suggestionUpdatesDeleteError) {
    console.error("Suggestion realtime signal cleanup failed", suggestionUpdatesDeleteError);
    return NextResponse.json({ error: suggestionUpdatesDeleteError.message }, { status: 500 });
  }

  const { error: suggestionsDeleteError } = await admin
    .from("participant_suggestions")
    .delete()
    .eq("event_id", event.id);
  if (suggestionsDeleteError) {
    console.error("Suggestion message cleanup failed", suggestionsDeleteError);
    return NextResponse.json({ error: suggestionsDeleteError.message }, { status: 500 });
  }

  const { error: deleteError } = await admin.from("events").delete().eq("id", event.id).eq("owner_id", user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted_storage_objects: Array.from(new Set(paths)).length });
}
