/**
 * YouCam AI Clothes Changer API client (Perfect Corp S2S APIs).
 * Server: https://yce-api-01.makeupar.com
 */

const YOUCAM_BASE = process.env.YOUCAM_API_BASE ?? "https://yce-api-01.makeupar.com";
const YOUCAM_REQUEST_TIMEOUT_MS = 15_000;
const YOUCAM_UPLOAD_TIMEOUT_MS = 20_000;

function authHeaders() {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new Error("YOUCAM_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

interface FileUploadTicket {
  file_id: string;
  upload_url: string;
}

/**
 * Step 1: Register a file with YouCam and get a one-time upload URL + file_id.
 */
async function requestUploadTicket(params: {
  contentType: string;
  fileName: string;
  fileSizeBytes: number;
}): Promise<FileUploadTicket> {
  const res = await fetch(`${YOUCAM_BASE}/s2s/v2.0/file`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      files: [
        {
          content_type: params.contentType,
          file_name: params.fileName,
          file_size: params.fileSizeBytes,
        },
      ],
    }),
    signal: AbortSignal.timeout(YOUCAM_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`YouCam file registration failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const first = json?.data?.files?.[0] ?? json?.result?.files?.[0] ?? json?.files?.[0];

  if (!first?.file_id || !(first?.url || first?.requests?.[0]?.url)) {
    throw new Error(`Unexpected YouCam file registration response: ${JSON.stringify(json)}`);
  }

  return {
    file_id: first.file_id,
    upload_url: first.url ?? first.requests[0].url,
  };
}

/**
 * Step 2: PUT the raw bytes to the signed upload URL.
 */
async function uploadBytes(uploadUrl: string, bytes: Buffer, contentType: string): Promise<void> {
  const body = new Blob([Uint8Array.from(bytes)], { type: contentType });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
    signal: AbortSignal.timeout(YOUCAM_UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`YouCam file upload failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Registers + uploads raw image bytes already in memory to YouCam. Used when the bytes
 * were never written to Storage (e.g. a transient crop that shouldn't be persisted).
 */
export async function uploadImageBuffer(bytes: Buffer, contentType = "image/jpeg", fileName = "image.jpg"): Promise<string> {
  const ticket = await requestUploadTicket({ contentType, fileName, fileSizeBytes: bytes.byteLength });
  await uploadBytes(ticket.upload_url, bytes, contentType);
  return ticket.file_id;
}

/**
 * Registers + uploads an image from a public URL to YouCam.
 */
export async function uploadImageFromUrl(imageUrl: string, contentType = "image/jpeg"): Promise<string> {
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(YOUCAM_UPLOAD_TIMEOUT_MS) });
  if (!imgRes.ok) throw new Error(`Could not fetch source image at ${imageUrl}`);
  const arrayBuffer = await imgRes.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  return uploadImageBuffer(bytes, contentType, imageUrl.split("/").pop() ?? "image.jpg");
}

// Category options supported by YouCam Cloth V4 API
export type GarmentCategory = "full_body" | "upper_body" | "lower_body" | "shoes" | "outerwear" | "auto";

interface StartClothTaskParams {
  /** Person/Bride photo: Pass file_id OR direct public URL */
  personFileId?: string;
  personUrl?: string;

  /** Dress photo: Pass file_id OR direct public URL */
  garmentFileId?: string;
  garmentUrl?: string;

  garmentCategory?: GarmentCategory;
}

/**
 * Step 3: Kick off the async virtual try-on render (Uses V4 API).
 */
export async function startClothTask(params: StartClothTaskParams): Promise<string> {
  const payload: Record<string, string> = {
    garment_category: params.garmentCategory ?? "full_body",
  };

  if (params.personUrl) {
    payload.src_file_url = params.personUrl;
  } else if (params.personFileId) {
    payload.src_file_id = params.personFileId;
  }

  if (params.garmentUrl) {
    payload.ref_file_url = params.garmentUrl;
  } else if (params.garmentFileId) {
    payload.ref_file_id = params.garmentFileId;
  }

  const res = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/cloth-v4`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(YOUCAM_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`YouCam task start failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const taskId = json?.data?.task_id ?? json?.result?.task_id ?? json?.task_id;
  if (!taskId) throw new Error(`Unexpected YouCam task response: ${JSON.stringify(json)}`);
  return taskId;
}

export type YouCamTaskStatus = "queued" | "processing" | "success" | "error";

export interface YouCamTaskResult {
  status: YouCamTaskStatus;
  resultImageUrl?: string;
  errorMessage?: string;
}

/**
 * Step 4: Poll single task status on V4 endpoint.
 */
export async function getClothTaskStatus(taskId: string): Promise<YouCamTaskResult> {
  const res = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/cloth-v4/${taskId}`, {
    method: "GET",
    headers: authHeaders(),
    signal: AbortSignal.timeout(YOUCAM_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`YouCam task status check failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const data = json?.data ?? json?.result ?? json;
  const status: YouCamTaskStatus = data?.task_status ?? data?.status;

  // Handles both object ({ url: "..." }) and array ([{ url: "..." }]) responses defensively
  const resultImageUrl =
    data?.results?.url ??
    data?.results?.[0]?.url ??
    data?.results?.[0]?.output_url ??
    data?.output_url ??
    data?.result_url;

  return {
    status,
    resultImageUrl,
    errorMessage: status === "error" ? data?.error ?? data?.error_message ?? "VTO render failed" : undefined,
  };
}

// ── AI Facial Color Tones Analyzer ──────────────────────────────────────────
// https://docs.perfectcorp.com/reference/ai_skin_tone_analysis.md
// Separate task family from cloth-v4 above, but shares the same file registration
// (requestUploadTicket/uploadBytes) and auth — hence uploadImageFromUrl is reused as-is.

export interface SkinToneColors {
  eyeColor?: string;
  eyeColorName?: string;
  lipColor?: string;
  eyebrowColor?: string;
  skinColor?: string;
  hairColor?: string;
  hairColorName?: string;
}

export type SkinToneTaskStatus = "running" | "success" | "error";

export interface SkinToneTaskResult {
  status: SkinToneTaskStatus;
  colors?: SkinToneColors;
  errorMessage?: string;
}

/**
 * Kicks off skin-tone analysis for an already-uploaded file. Returns a task_id to poll,
 * same async pattern as startClothTask/getClothTaskStatus above.
 */
export async function startSkinToneTask(fileId: string): Promise<string> {
  const res = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/skin-tone-analysis`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ src_file_id: fileId }),
    signal: AbortSignal.timeout(YOUCAM_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`YouCam skin-tone task start failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const taskId = json?.data?.task_id ?? json?.result?.task_id ?? json?.task_id;
  if (!taskId) throw new Error(`Unexpected YouCam skin-tone task response: ${JSON.stringify(json)}`);
  return taskId;
}

export async function getSkinToneTaskStatus(taskId: string): Promise<SkinToneTaskResult> {
  const res = await fetch(`${YOUCAM_BASE}/s2s/v2.0/task/skin-tone-analysis/${taskId}`, {
    method: "GET",
    headers: authHeaders(),
    signal: AbortSignal.timeout(YOUCAM_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`YouCam skin-tone status check failed (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  const data = json?.data ?? json?.result ?? json;
  const status: SkinToneTaskStatus = data?.task_status ?? data?.status;
  const color = data?.results?.color;

  return {
    status,
    colors: color
      ? {
          eyeColor: color.eye_color,
          eyeColorName: color.eye_color_name,
          lipColor: color.lip_color,
          eyebrowColor: color.eyebrow_color,
          skinColor: color.skin_color,
          hairColor: color.hair_color,
          hairColorName: color.hair_color_name,
        }
      : undefined,
    // data.error_message is the human-readable description; data.error is just the error
    // code enum (e.g. "error_no_face") — prefer the message, fall back to the code.
    errorMessage: status === "error" ? data?.error_message ?? data?.error ?? "Skin tone analysis failed" : undefined,
  };
}

/**
 * Polls a skin-tone task to completion. Analysis is fast (typically a few seconds), so
 * this runs the whole poll loop server-side inside the request instead of pushing polling
 * back to the client — there's no render to preview mid-flight the way VTO has, so there's
 * nothing useful to show her before it resolves anyway.
 */
export async function pollSkinToneTask(
  taskId: string,
  { intervalMs = 1500, timeoutMs = 14000 }: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<SkinToneTaskResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await getSkinToneTaskStatus(taskId);
    if (result.status === "success" || result.status === "error") return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { status: "error", errorMessage: "Skin tone analysis timed out" };
}
