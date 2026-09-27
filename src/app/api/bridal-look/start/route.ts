import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { event_id, photo_url, dress_url } = await req.json();
  if (!event_id || !photo_url || !dress_url) return NextResponse.json({ error: "event_id, photo_url, and dress_url are required" }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data: event } = await admin.from("events").select("id").eq("id", event_id).eq("owner_id", user.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const { data: bride } = await admin.from("participants").select("*").eq("event_id", event_id).eq("role", "bride").maybeSingle();
  if (!bride) return NextResponse.json({ error: "Bride participant is missing. Please recreate the event." }, { status: 409 });
  const photoPath = storagePathFromUrl(photo_url);
  if (!photoPath) return NextResponse.json({ error: "Your photo must be uploaded before starting a preview." }, { status: 400 });
  let attemptId: string | null = null;
  try {
    const plan = await participantAiPlan(admin, bride);
    const dressPath = storagePathFromUrl(dress_url);
    const photoPublicUrl = publicStorageUrl(photoPath);
    const dressPublicUrl = dressPath ? publicStorageUrl(dressPath) : dress_url;
    if (!photoPublicUrl || !dressPublicUrl) throw new Error("Could not resolve VTO source images");
    let participantDressId: string | null = null;
    if (dressPath) {
      const { data: participantDress, error: dressError } = await admin
        .from("participant_dresses")
        .upsert({ participant_id: bride.id, storage_path: dressPath }, { onConflict: "participant_id,storage_path" })
        .select("id")
        .single();
      if (dressError) throw new Error(dressError.message);
      participantDressId = participantDress.id;
    }
    const attempt = await reserveVtoAttempt(admin, plan, {
      participantId: bride.id,
      participantDressId,
      dressPath,
      bodyPhotoPath: photoPath,
    });
    attemptId = attempt.id;
    const [personFileId, garmentFileId] = await Promise.all([uploadImageFromUrl(photoPublicUrl), uploadImageFromUrl(dressPublicUrl)]);
    const taskId = await startClothTask({ personFileId, garmentFileId, garmentCategory: "full_body" });
    const { error: taskError } = await admin.from("vto_attempts").update({ task_id: taskId }).eq("id", attempt.id);
    if (taskError) throw new Error(taskError.message);
    await admin.from("participants").update({ original_photo_path: photoPath }).eq("id", bride.id);
    return NextResponse.json({ task_id: taskId, look_id: attempt.id });
  } catch (err) {
    await releaseVtoReservation(admin, attemptId);
    if (err instanceof VtoQuotaError) return NextResponse.json(vtoQuotaPayload(err), { status: 402 });
    if (err instanceof RevenueCatUnavailableError) {
      return NextResponse.json({ error: err.message, code: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
    }
    console.error("Bridal VTO start failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Virtual try-on could not be started" }, { status: 502 });
  }
}
