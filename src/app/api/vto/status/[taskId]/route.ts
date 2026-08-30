import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getClothTaskStatus } from "@/lib/youcam/client";
import { uploadToStorage, publicStorageUrl } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const participantId = req.nextUrl.searchParams.get("participant_id");
  const token = req.nextUrl.searchParams.get("token");
  if (!participantId || !token) return NextResponse.json({ error: "participant_id and token are required" }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data: participant } = await admin.from("participants").select("id,session_token").eq("id", participantId).maybeSingle();
  if (!participant || participant.session_token !== token) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data: attempt } = await admin.from("vto_attempts").select("*").eq("participant_id", participantId).eq("task_id", taskId).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "VTO attempt not found" }, { status: 404 });
  if (attempt.status === "ready" || attempt.status === "confirmed") return NextResponse.json({ status: "success", render_url: publicStorageUrl(attempt.render_path) });
  try {
    const result = await getClothTaskStatus(taskId);
    if (result.status === "error") {
      await admin.from("vto_attempts").update({ status: "error" }).eq("id", attempt.id);
      return NextResponse.json({ status: "error", error: result.errorMessage });
    }
    if (result.status !== "success" || !result.resultImageUrl) return NextResponse.json({ status: result.status });
    const folder = (await admin.from("participants").select("role").eq("id", participantId).single()).data?.role === "bride" ? "vto-outputs/bride" : "vto-outputs/bridesmaid";
    const uploaded = await uploadToStorage(result.resultImageUrl, { folder, publicId: `${participantId}-${taskId}` });
    await admin.from("vto_attempts").update({ render_path: uploaded.path, status: "ready" }).eq("id", attempt.id);
    return NextResponse.json({ status: "success", render_url: uploaded.url });
  } catch (err) {
    console.error("VTO status failed", err);
    return NextResponse.json({ status: "error", error: "Could not check render status" }, { status: 502 });
  }
}
