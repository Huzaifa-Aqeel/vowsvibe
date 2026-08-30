import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getClothTaskStatus } from "@/lib/youcam/client";
import { uploadToStorage, publicStorageUrl } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const lookId = req.nextUrl.searchParams.get("look_id");
  if (!lookId) return NextResponse.json({ error: "look_id is required" }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data: attempt, error: attemptError } = await admin.from("vto_attempts").select("*, participants!vto_attempts_participant_id_fkey!inner(id,event_id,role)").eq("id", lookId).eq("task_id", taskId).eq("participants.role", "bride").maybeSingle();  if (attemptError) console.error("bridal-look/status lookup failed", attemptError);
  if (!attempt) return NextResponse.json({ error: "Look not found" }, { status: 404 });
  const { data: event } = await admin.from("events").select("id").eq("id", attempt.participants.event_id).eq("owner_id", user.id).maybeSingle();
  if (!event) return NextResponse.json({ error: "Look not found" }, { status: 404 });
  if (attempt.status === "ready" || attempt.status === "confirmed") return NextResponse.json({ status: "success", render_url: publicStorageUrl(attempt.render_path) });
  try {
    const result = await getClothTaskStatus(taskId);
    if (result.status === "error") {
      await admin.from("vto_attempts").update({ status: "error" }).eq("id", attempt.id);
      return NextResponse.json({ status: "error", error: result.errorMessage });
    }
    if (result.status !== "success" || !result.resultImageUrl) return NextResponse.json({ status: result.status });
    const uploaded = await uploadToStorage(result.resultImageUrl, { folder: "vto-outputs/bride", publicId: `${attempt.participant_id}-${taskId}` });
    await admin.from("vto_attempts").update({ render_path: uploaded.path, status: "ready" }).eq("id", attempt.id);
    
    return NextResponse.json({ status: "success", render_url: uploaded.url });
  } catch (err) {
    console.error("Bridal VTO status failed", err);
    return NextResponse.json({ status: "error", error: "Could not check render status" }, { status: 502 });
  }
}
