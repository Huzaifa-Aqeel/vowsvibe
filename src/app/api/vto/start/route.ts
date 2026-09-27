import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { storagePathFromUrl, publicStorageUrl } from "@/lib/storage/upload";
import { startClothTask, uploadImageFromUrl } from "@/lib/youcam/client";
import {
  participantAiPlan,
  releaseVtoReservation,
  reserveVtoAttempt,
  VtoQuotaError,
  vtoQuotaPayload,
} from "@/lib/billing/plan";
import { RevenueCatUnavailableError } from "@/lib/billing/revenuecat";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { participant_id, token, photo_url, dress_url, dress_primary_hex, dress_color_name } = await req.json();
  if (!participant_id || !token || !photo_url || !dress_url) return NextResponse.json({ error: "participant_id, token, photo_url, and dress_url are required" }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data: participant } = await admin.from("participants").select("*").eq("id", participant_id).maybeSingle();
  if (!participant || participant.session_token !== token) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const photoPath = storagePathFromUrl(photo_url);
  if (!photoPath) return NextResponse.json({ error: "Your photo must be uploaded before starting a try-on." }, { status: 400 });
  let attemptId: string | null = null;
  try {
    const plan = await participantAiPlan(admin, participant);
    const dressPath = storagePathFromUrl(dress_url);
    const photoPublicUrl = publicStorageUrl(photoPath);
    const dressPublicUrl = dressPath ? publicStorageUrl(dressPath) : dress_url;
    if (!photoPublicUrl || !dressPublicUrl) throw new Error("Could not resolve VTO source images");
    let participantDressId: string | null = null;
    if (dressPath) {
      // dress_primary_hex/dress_color_name: resolved from the user-entered dress palette
      // before this VTO request — not re-derived from the image here.
      const { data: participantDress, error: dressError } = await admin
        .from("participant_dresses")
        .upsert(
          {
            participant_id,
            storage_path: dressPath,
            ...(typeof dress_primary_hex === "string" ? { primary_hex: dress_primary_hex } : {}),
            ...(typeof dress_color_name === "string" ? { color_name: dress_color_name } : {}),
          },
          { onConflict: "participant_id,storage_path" }
        )
        .select("id")
        .single();
      if (dressError) throw new Error(dressError.message);
      participantDressId = participantDress.id;
    }
    const attempt = await reserveVtoAttempt(admin, plan, {
      participantId: participant_id,
      participantDressId,
      dressPath,
      bodyPhotoPath: photoPath,
    });
    attemptId = attempt.id;
    const [personFileId, garmentFileId] = await Promise.all([uploadImageFromUrl(photoPublicUrl), uploadImageFromUrl(dressPublicUrl)]);
    const taskId = await startClothTask({ personFileId, garmentFileId, garmentCategory: "full_body" });
    const { error: taskError } = await admin.from("vto_attempts").update({ task_id: taskId }).eq("id", attempt.id);
    if (taskError) throw new Error(taskError.message);
    await admin.from("participants").update({ original_photo_path: photoPath }).eq("id", participant_id);
    return NextResponse.json({ task_id: taskId, attempt_id: attempt.id });
  } catch (err) {
    await releaseVtoReservation(admin, attemptId);
    if (err instanceof VtoQuotaError) return NextResponse.json(vtoQuotaPayload(err), { status: 402 });
    if (err instanceof RevenueCatUnavailableError) {
      return NextResponse.json({ error: err.message, code: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
    }
    console.error("VTO start failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "VTO task could not be started" }, { status: 502 });
  }
}
