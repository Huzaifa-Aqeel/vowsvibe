import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { extractCutout } from "@/lib/cutout/extract";

export async function POST(_req: Request, { params }: { params: { lookId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createServiceRoleClient();
  const { data: attempt, error: attemptError } = await admin
    .from("vto_attempts")
    .select("*, participants!vto_attempts_participant_id_fkey!inner(id,event_id,role)")
    .eq("id", params.lookId)
    .eq("participants.role", "bride")
    .maybeSingle();
  if (attemptError) console.error("bridal-look confirm lookup failed", attemptError);
  if (!attempt) return NextResponse.json({ error: "Look not found" }, { status: 404 });
  const { data: event } = await admin.from("events").select("id").eq("id", attempt.participants.event_id).eq("owner_id", user.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!["ready", "confirmed"].includes(attempt.status) || !attempt.render_path) return NextResponse.json({ error: "This preview is not ready to confirm" }, { status: 409 });

  // Cut the render out of its background before anything is marked confirmed. The
  // participant's status stays "pending" for the duration of this call — there is no
  // separate "processing" state to expose, just a request that takes a few seconds longer
  // than it used to. If extraction fails, nothing below runs and status never changes.
  let cutoutPath: string;
  try {
    cutoutPath = await extractCutout(attempt.render_path, attempt.id, "bride");
  } catch (err) {
    console.error("bridal-look cutout extraction failed", err);
    return NextResponse.json({ error: "Could not prepare this look for the group photo. Please try again." }, { status: 502 });
  }

  const { error: clearError } = await admin.from("vto_attempts").update({ status: "ready" }).eq("participant_id", attempt.participant_id).eq("status", "confirmed");
  if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });
  const { error: confirmError } = await admin.from("vto_attempts").update({ status: "confirmed", cutout_path: cutoutPath }).eq("id", attempt.id);
  if (confirmError) return NextResponse.json({ error: confirmError.message }, { status: 500 });
  const { error } = await admin.from("participants").update({
    confirmed_look_id: attempt.id, original_photo_path: attempt.body_photo_path, status: "confirmed"
  }).eq("id", attempt.participant_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
