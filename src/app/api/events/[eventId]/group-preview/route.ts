import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { publicStorageUrl, uploadToStoragePath } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRESETS: Record<string, string> = {
  natural: "Use natural editorial lighting, realistic skin and fabric texture, and restrained color grading.",
  venue: "Preserve the supplied venue architecture and atmosphere faithfully.",
  cohesive: "Blend the people naturally into the scene with consistent perspective, scale, light, and contact shadows.",
  formal: "Create a polished formal wedding-party portrait with elegant, relaxed posture.",
};

async function ownedEvent(eventId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin.from("events").select("id").eq("id", eventId).eq("owner_id", user.id).maybeSingle();
  return data ? { admin, event: data } : null;
}

function generatedImageUrl(payload: Record<string, unknown>): string | null {
  const output = payload.output as Record<string, unknown> | undefined;
  const choices = output?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content as Array<Record<string, unknown>> | undefined;
  const image = content?.find((item) => typeof item.image === "string")?.image;
  return typeof image === "string" ? image : null;
}

function isTrustedDashScopeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith("aliyuncs.com");
  } catch {
    return false;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const admin = createServiceRoleClient();
  const { data } = await admin.from("events").select("group_preview_path,group_preview_updated_at").eq("id", eventId).maybeSingle();
  return NextResponse.json({
    previewUrl: data?.group_preview_path ? `${publicStorageUrl(data.group_preview_path)}?v=${encodeURIComponent(data.group_preview_updated_at ?? "")}` : null,
    updatedAt: data?.group_preview_updated_at ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const access = await ownedEvent(eventId);
  if (!access) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json() as { action?: string; image?: string; presets?: string[] };

  if (body.action === "venue") {
    if (!body.image?.startsWith("data:image/") || body.image.length > 5_500_000) return NextResponse.json({ error: "Invalid venue image" }, { status: 400 });
    const path = `group-previews/${eventId}/venue`;
    const uploaded = await uploadToStoragePath(path, body.image);
    const { error } = await access.admin.from("events").update({ group_preview_venue_path: path }).eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ venueUrl: `${uploaded.url}?v=${Date.now()}`, path });
  }

  if (body.action === "save") {
    if (!body.image || (!body.image.startsWith("data:image/") && !isTrustedDashScopeImageUrl(body.image))) {
      return NextResponse.json({ error: "Invalid preview image" }, { status: 400 });
    }
    const path = `group-previews/${eventId}/current.png`;
    const uploaded = await uploadToStoragePath(path, body.image);
    const updatedAt = new Date().toISOString();
    const { error } = await access.admin.from("events").update({ group_preview_path: path, group_preview_updated_at: updatedAt }).eq("id", eventId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ previewUrl: `${uploaded.url}?v=${encodeURIComponent(updatedAt)}`, path, updatedAt });
  }

  if (!body.image?.startsWith("data:image/") || body.image.length > 5_500_000) {
    return NextResponse.json({ error: "The flattened preview input is missing or too large" }, { status: 400 });
  }
  const selected = (body.presets ?? []).filter((id) => id in PRESETS).slice(0, 4);
  const prompt = [
    "Transform this flattened bridal-party composition into one photorealistic group portrait.",
    "The supplied image fixes the venue, people, dresses, relative placement, and lineup order. Preserve every person's identity, facial features, dress color/design, body proportions, and position. Do not add or remove people or change the venue.",
    "Remove cutout edges and make the composite look like a single professional photograph.",
    ...selected.map((id) => PRESETS[id]),
    "Return only the finished image.",
  ].join("\n");
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.DASHSCOPE_API_BASE ?? "").replace(/\/$/, "");
  if (!apiKey || !baseUrl) return NextResponse.json({ error: "DashScope Qwen Image is not configured" }, { status: 503 });
  const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_QWEN_IMAGE_MODEL ?? "qwen-image-3.0",
      input: {
        messages: [{ role: "user", content: [{ image: body.image }, { text: prompt }] }],
      },
      parameters: {
        n: 1,
        prompt_extend: true,
        prompt_extend_mode: "direct",
        enable_thinking: true,
        negative_prompt: "extra people, missing people, duplicate people, altered faces, changed dresses, changed dress colors, distorted anatomy, disfigured hands, text, logo, watermark, low quality",
        watermark: false,
      },
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    console.error("DashScope Qwen Image request failed", response.status, raw.slice(0, 1000));
    return NextResponse.json({ error: `Qwen generation failed (${response.status})` }, { status: 502 });
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Qwen returned an invalid response" }, { status: 502 }); }
  const imageUrl = generatedImageUrl(payload);
  if (!imageUrl) {
    console.error("DashScope Qwen Image response had no image", raw.slice(0, 1000));
    return NextResponse.json({ error: "Qwen did not return an image" }, { status: 502 });
  }
  if (!isTrustedDashScopeImageUrl(imageUrl)) return NextResponse.json({ error: "Qwen returned an untrusted image URL" }, { status: 502 });
  return NextResponse.json({ image: imageUrl });
}
