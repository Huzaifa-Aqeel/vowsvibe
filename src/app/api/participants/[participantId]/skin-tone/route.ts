import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { uploadImageBuffer, startSkinToneTask, pollSkinToneTask } from "@/lib/youcam/client";
import { classifySkinTone } from "@/lib/color/undertone";

export const runtime = "nodejs";
// Budget: multipart parse + one YouCam file upload + skin-tone poll (capped at 14s). There
// is no Storage fetch and no background-removal crop in front of this anymore — the selfie
// arrives as raw bytes in the request body and goes straight to YouCam, so this route is
// strictly lighter than it was when it depended on cropFaceRegionForSkinTone.
export const maxDuration = 20;

// A selfie, not a full-res camera export — keep this well under the 50MB the dress/photo
// uploader allows, since this file is never persisted and only needs to be "good enough"
// for a face-color read.
const MAX_SELFIE_BYTES = 15 * 1024 * 1024;

// Same dual-auth shape as /api/participants/[participantId]: a bridesmaid's session_token,
// OR the signed-in owner (bride, authenticated via Supabase cookie session — she has no
// session_token of her own since her studio is gated by owning the event).
async function authorize(participantId: string, token: string | null) {
  const service = createServiceRoleClient();
  const { data: participant } = await service
    .from("participants")
    .select("id,event_id,session_token")
    .eq("id", participantId)
    .maybeSingle();
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

/**
 * Triggered from the "selfie" face of the photo flip card (see SelfieUpload /
 * PhotoFlipCard) — a separate photo from the full-body VTO shot, submitted the moment she
 * takes/picks it. The selfie is a real face photo (not a full-body shot), so it needs no
 * face-region heuristic before analysis: we read the multipart bytes into memory, hand them
 * straight to YouCam, and let the buffer go once this request ends. It is never written to
 * Supabase Storage and never referenced by path anywhere in the DB — only the derived
 * skin_tone_hex / undertone / depth get persisted, on the participant row itself.
 */
export async function POST(req: NextRequest, { params }: { params: { participantId: string } }) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const tokenField = formData?.get("token");
  const token = typeof tokenField === "string" ? tokenField : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No selfie provided" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are supported" }, { status: 400 });
  }
  if (file.size > MAX_SELFIE_BYTES) {
    return NextResponse.json({ error: "Selfie must be under 15MB" }, { status: 400 });
  }

  const auth = await authorize(params.participantId, token);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { participant, service: admin } = auth;

  try {
    // In-memory only for the lifetime of this request — never written to Storage, never
    // saved to disk, discarded as soon as we return.
    const selfieBytes = Buffer.from(await file.arrayBuffer());

    const fileId = await uploadImageBuffer(selfieBytes, file.type || "image/jpeg", "skin-tone-selfie.jpg");
    const taskId = await startSkinToneTask(fileId);
    const result = await pollSkinToneTask(taskId);

    if (result.status !== "success" || !result.colors?.skinColor) {
      // Non-fatal: swallow analysis failures rather than surfacing them to her — the
      // palette just stays in its original order, the rest of the flow is unaffected.
      console.error("Skin tone analysis did not succeed", result.errorMessage);
      return NextResponse.json({ status: "error", error: result.errorMessage ?? "Analysis failed" }, { status: 200 });
    }

    const { undertone, depth } = classifySkinTone(result.colors.skinColor);
    // hairColor comes back from the SAME skin-tone-analysis task/response as skinColor — no
    // second YouCam call. Nullable: the model may not have found hair in the frame.
    const hairHex = result.colors.hairColor ?? null;
    const hairColorName = result.colors.hairColorName ?? null;
    await admin
      .from("participants")
      .update({
        skin_tone_hex: result.colors.skinColor,
        skin_undertone: undertone,
        skin_depth: depth,
        hair_tone_hex: hairHex,
        hair_color_name: hairColorName,
      })
      .eq("id", participant.id);

    return NextResponse.json({
      status: "success",
      skin_tone_hex: result.colors.skinColor,
      undertone,
      depth,
      hair_tone_hex: hairHex,
      hair_color_name: hairColorName,
    });
  } catch (err) {
    console.error("Skin tone analysis failed", err);
    // Same non-fatal shape as above — a 200 with status: "error" so the client doesn't
    // treat this as a hard failure worth retrying aggressively or surfacing as an error toast.
    return NextResponse.json({ status: "error", error: "Could not analyze photo" }, { status: 200 });
  }
}
