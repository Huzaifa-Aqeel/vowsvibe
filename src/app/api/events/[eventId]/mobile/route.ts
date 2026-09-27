import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getParticipantWithAttempts } from "@/lib/vto/participant";
import { publicStorageUrl, resolveStorageUrl } from "@/lib/storage/upload";
import type { EventRow } from "@/lib/types";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to open your event." }, { status: 401 });
  const { data: event, error } = await supabase.from("events").select("*").eq("id", eventId).eq("owner_id", user.id).maybeSingle<EventRow>();
  if (error) return NextResponse.json({ error: "Could not load this event." }, { status: 500 });
  if (!event) return NextResponse.json({ error: "This event was not found in your account." }, { status: 404 });
  const admin = createServiceRoleClient();
  const { data: bride, error: brideError } = await admin.from("participants").select("id").eq("event_id", eventId).eq("role", "bride").maybeSingle();
  if (brideError || !bride) return NextResponse.json({ error: "The bride's fitting room is unavailable." }, { status: 500 });
  const result = await getParticipantWithAttempts(admin, bride.id);
  if (result.error || !result.participant) return NextResponse.json({ error: "Could not load the bride's lookbook." }, { status: 500 });
  // This response is owner-only; other participants' private photos/tokens are omitted.
  return NextResponse.json({ event: { ...event,
    example_dresses: (event.example_dresses ?? []).map((dress) => ({ ...dress, url: resolveStorageUrl(dress.storage_path ?? dress.url) ?? dress.url })),
    group_preview_path: resolveStorageUrl(event.group_preview_path),
    group_preview_venue_path: resolveStorageUrl(event.group_preview_venue_path),
  }, bride: result.participant, looks: result.attempts.map((attempt) => ({ ...attempt,
    original_photo_url: publicStorageUrl(attempt.body_photo_path), dress_url: publicStorageUrl(attempt.dress_path),
    vto_render_url: publicStorageUrl(attempt.render_path),
  })) }, { headers: { "Cache-Control": "no-store" } });
}
