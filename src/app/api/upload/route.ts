import { NextRequest, NextResponse } from "next/server";
import { isStorageFolder, uploadToStorage } from "@/lib/storage/upload";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { participantAiPlan } from "@/lib/billing/plan";
import { RevenueCatUnavailableError } from "@/lib/billing/revenuecat";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vercel Functions reject request bodies above 4.5 MB before this handler runs.
// Clients resize camera images to this safe ceiling before building multipart data.
const MAX_FILE_SIZE = 4 * 1024 * 1024;

/**
 * Accepts a multipart/form-data upload (bridesmaid photo, custom dress, catalog dress)
 * and uploads it securely to Supabase Storage using server-side credentials.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const folder = formData.get("folder");

    // 1. Basic File Validations
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (typeof folder !== "string" || !isStorageFolder(folder)) {
      return NextResponse.json({ error: "Invalid upload destination" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are supported" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image must be under 4MB" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const participantId = formData.get("participant_id");
    const token = formData.get("token");
    const admin = createServiceRoleClient();
    let participant: { id: string; event_id: string; session_token: string; role: "bride" | "bridesmaid" } | null = null;
    if (typeof participantId === "string") {
      const result = await admin.from("participants").select("id,event_id,session_token,role").eq("id", participantId).maybeSingle();
      participant = result.data;
    }
    if (!user) {
      if (typeof participantId !== "string" || typeof token !== "string" || !token) {
        return NextResponse.json({ error: "Sign in or open your fitting room before uploading." }, { status: 401 });
      }
      if (!participant || participant.session_token !== token || participant.role !== "bridesmaid") {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
      if (!["user-photos/bridesmaid", "user-dresses/bridesmaid"].includes(folder)) {
        return NextResponse.json({ error: "Invalid upload destination for a bridesmaid." }, { status: 403 });
      }
    } else if (participant) {
      const { data: event } = await admin.from("events").select("owner_id").eq("id", participant.event_id).maybeSingle();
      if (event?.owner_id !== user.id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (folder.startsWith("user-dresses/")) {
      if (!participant) return NextResponse.json({ error: "Open the fitting room before adding a dress." }, { status: 400 });
      try {
        const plan = await participantAiPlan(admin, participant);
        if (plan.tier === "locked") {
          return NextResponse.json({
            error: "The bride needs an active Vows & Vibe Pro Wedding Pass before bridesmaids can add dresses.",
            code: "PRO_REQUIRED",
            upgrade_required: true,
          }, { status: 402 });
        }
        if (plan.tier === "free") {
          const { count, error: countError } = await admin.from("participant_dresses")
            .select("id", { count: "exact", head: true }).eq("participant_id", participant.id);
          if (countError) throw new Error(countError.message);
          if ((count ?? 0) >= 2) {
            return NextResponse.json({
              error: "The free bride plan includes two dress uploads. Buy a one-time Vows & Vibe Pro Wedding Pass to add more.",
              code: "DRESS_LIMIT_REACHED",
              upgrade_required: true,
              limit: 2,
            }, { status: 402 });
          }
        }
      } catch (error) {
        if (error instanceof RevenueCatUnavailableError) {
          return NextResponse.json({ error: error.message, code: "MEMBERSHIP_UNAVAILABLE" }, { status: 503 });
        }
        throw error;
      }
    }

    // 2. Convert File to Buffer for Server Upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Generate a clean unique filename using a UUID and safe original name
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const publicId = `${crypto.randomUUID()}_${sanitizedFileName.replace(/\.[^.]+$/, "")}`;

    // 4. Upload directly to Supabase Storage via Server Admin Client
    const uploaded = await uploadToStorage(buffer, {
      folder,
      publicId,
      contentType: file.type,
    });

    // Returns a permanent public URL for immediate UI display
    return NextResponse.json({ url: uploaded.url, path: uploaded.path });

  } catch (err) {
    console.error("Supabase Storage Upload Failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
