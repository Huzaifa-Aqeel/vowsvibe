import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { storagePathFromUrl, publicStorageUrl } from "@/lib/storage/upload";
import { startClothTask, uploadImageFromUrl } from "@/lib/youcam/client";

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
  try {
    const dressPath = storagePathFromUrl(dress_url);
    const photoPublicUrl = publicStorageUrl(photoPath);
    const dressPublicUrl = dressPath ? publicStorageUrl(dressPath) : dress_url;
    if (!photoPublicUrl || !dressPublicUrl) throw new Error("Could not resolve VTO source images");
    const [personFileId, garmentFileId] = await Promise.all([uploadImageFromUrl(photoPublicUrl), uploadImageFromUrl(dressPublicUrl)]);
    const taskId = await startClothTask({ personFileId, garmentFileId, garmentCategory: "full_body" });
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
    const { data: attempt, error } = await admin.from("vto_attempts").insert({
      participant_id: bride.id, participant_dress_id: participantDressId, dress_path: dressPath,
      body_photo_path: photoPath, task_id: taskId, status: "processing"
    }).select().single();
    if (error) throw new Error(error.message);
    await admin.from("participants").update({ original_photo_path: photoPath }).eq("id", bride.id);
    return NextResponse.json({ task_id: taskId, look_id: attempt.id });
  } catch (err) {
    console.error("Bridal VTO start failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Virtual try-on could not be started" }, { status: 502 });
  }
}
