import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { publicStorageUrl, uploadToStoragePath } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRESETS: Record<string, string> = {
  natural: "Use natural editorial lighting, realistic skin and fabric texture, and restrained color grading.",
  venue: "Preserve the supplied venue architecture and atmosphere faithfully.",
  cohesive: "Blend the people naturally into the scene with consistent perspective, scale, light, and contact shadows.",
  formal: "Adjust only the existing people toward a polished formal portrait with elegant, relaxed posture.",
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

function isTrustedDashScopeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "aliyuncs.com" || url.hostname.endsWith(".aliyuncs.com"));
  } catch {
    return false;
  }
}

function networkErrorCode(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const cause = error.cause as { code?: unknown; errors?: Array<{ code?: unknown }> } | undefined;
  if (typeof cause?.code === "string") return cause.code;
  const nestedCode = cause?.errors?.find((item) => typeof item.code === "string")?.code;
  return typeof nestedCode === "string" ? nestedCode : null;
}

function safeErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "Unknown network error";
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
    if (!body.image?.startsWith("data:image/")) {
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
    "EDIT the supplied image. Do not create a new wedding party.",
    "PERSON PRESERVATION IS THE HIGHEST PRIORITY. The only people allowed in the output are the people already visible in the supplied image. Preserve every existing person exactly once.",
    "Do not add, duplicate, clone, remove, merge, replace, or invent any person. Do not add background guests, partial bodies, reflections containing people, extra faces, or any additional human anywhere in the image. Keep intentional empty space empty.",
    "IDENTITY AND WARDROBE: Preserve each existing person's face, skin tone, hair, body proportions, dress color, neckline, silhouette, fabric appearance, and dress length.",
    "VENUE AND COMPOSITION: Preserve the supplied venue and background. Preserve the existing left-to-right person order and each person's approximate region. Do not substantially redesign the composition.",
    "POSE EDIT ONLY: Re-pose only the existing people into a natural bridal group photo. Bring them moderately closer, allow subtle overlap, use slight inward shoulder and body angles, gentle inward leaning, relaxed posture, and natural arms and hands. Do not introduce a new person to fill space or complete a pose.",
    "If a pose would require inventing, duplicating, replacing, merging, or removing someone, do not make that pose. Retain the existing person instead and use a smaller, safer pose adjustment.",
    "PHOTOGRAPHIC INTEGRATION: Remove cutout edges while preserving every person. Ground existing feet naturally, and make perspective, camera height, lighting, contact shadows, depth, and overlap consistent with the supplied venue. The result should remain an edit of this exact image, not a newly generated scene.",
    "PRIORITY ORDER: person preservation > identity and wardrobe preservation > natural posing > photographic polish.",
    ...selected.map((id) => PRESETS[id]),
    "Return only the finished image.",
  ].join("\n");
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseUrl = (process.env.DASHSCOPE_API_BASE ?? "").replace(/\/$/, "");
  const model = process.env.DASHSCOPE_QWEN_IMAGE_MODEL ?? "qwen-image-3.0-pro";
  if (!apiKey || !baseUrl) return NextResponse.json({ error: "DashScope Qwen Image is not configured" }, { status: 503 });
  const requestStartedAt = Date.now();
  let endpointHost = "invalid-endpoint";
  try { endpointHost = new URL(baseUrl).host; } catch { /* Configuration error is reported by fetch below. */ }
  console.info(
    `[group-preview:${eventId}] Sending Qwen request model=${model} endpoint=${endpointHost} inputChars=${body.image.length} presets=${selected.join(",") || "none"}`,
  );

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: { messages: [{ role: "user", content: [{ image: body.image }, { text: prompt }] }] },
        parameters: {
          n: 1,
          // This prompt is intentionally detailed; automatic rewriting can weaken
          // identity, wardrobe, person-count, and posing constraints.
          prompt_extend: false,
          negative_prompt: "extra person, extra woman, extra bride, extra bridesmaid, crowd, guests, background people, cloned person, duplicated person, duplicated face, duplicated body, missing person, merged people, replacement person, additional human, reflection containing person, altered face, changed dress, changed dress color, extra limbs, distorted anatomy, stiff front-facing lineup, mannequin pose, collage, pasted cutouts, floating feet",
          watermark: false,
        },
      }),
      // Leave enough of the route's 300-second budget to download and return the image.
      signal: AbortSignal.timeout(145_000),
    });
  } catch (error) {
    const code = networkErrorCode(error);
    // Do not pass undici's raw AggregateError/DOMException to Next's dev logger.
    // Its `message` can be read-only, while the logger attempts to annotate it.
    console.error(`DashScope Qwen Image network failure [${code ?? "unknown"}]: ${safeErrorMessage(error)}`);
    const detail = code === "ETIMEDOUT"
      ? "The connection to the Alibaba Cloud workspace timed out. Check that your server can reach the configured region."
      : code === "EAI_AGAIN" || code === "ENOTFOUND"
        ? "The Alibaba Cloud workspace hostname could not be resolved by the server."
        : "The server could not connect to the Alibaba Cloud workspace.";
    return NextResponse.json({ error: detail, code: code ?? "DASHSCOPE_NETWORK_ERROR" }, { status: 504 });
  }
  console.info(
    `[group-preview:${eventId}] Qwen responded status=${response.status} requestId=${response.headers.get("x-request-id") ?? "unavailable"} durationMs=${Date.now() - requestStartedAt}`,
  );
  const raw = await response.text();
  if (!response.ok) {
    console.error("DashScope Qwen Image request failed", response.status, raw.slice(0, 1000));
    return NextResponse.json({ error: `Qwen generation failed (${response.status})` }, { status: 502 });
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Qwen returned an invalid response" }, { status: 502 }); }
  const imageUrl = generatedImageUrl(payload);
  if (!imageUrl || !isTrustedDashScopeImageUrl(imageUrl)) {
    console.error("DashScope Qwen Image response had no trusted image URL", raw.slice(0, 1000));
    return NextResponse.json({ error: "Qwen did not return a valid image" }, { status: 502 });
  }

  let generated: Response;
  try {
    generated = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    const code = networkErrorCode(error);
    console.error(`Could not connect to Qwen image storage [${code ?? "unknown"}]: ${safeErrorMessage(error)}`);
    return NextResponse.json({ error: "Could not connect to Alibaba image storage", code: code ?? "DASHSCOPE_DOWNLOAD_ERROR" }, { status: 504 });
  }
  const contentType = generated.headers.get("content-type")?.split(";")[0] ?? "";
  if (!generated.ok || !contentType.startsWith("image/")) {
    console.error("Could not download Qwen image", generated.status, contentType);
    return NextResponse.json({ error: "Could not download the generated Qwen image" }, { status: 502 });
  }
  const bytes = Buffer.from(await generated.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) return NextResponse.json({ error: "The generated Qwen image is too large" }, { status: 502 });
  console.info(
    `[group-preview:${eventId}] Qwen image downloaded contentType=${contentType} bytes=${bytes.length} totalDurationMs=${Date.now() - requestStartedAt}`,
  );
  return NextResponse.json({ image: `data:${contentType};base64,${bytes.toString("base64")}` });
}
