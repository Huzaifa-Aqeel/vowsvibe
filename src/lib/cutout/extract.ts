import { removeBackground } from "@imgly/background-removal-node";
import { uploadToStorage, publicStorageUrl } from "@/lib/storage/upload";
import type { ParticipantRole } from "@/lib/types";

/**
 * Cuts the confirmed VTO render out of its background and stores the result as a
 * transparent PNG. This runs inline inside the confirm request 
 */
export async function extractCutout(renderPath: string, attemptId: string, role: ParticipantRole): Promise<string> {
  const renderUrl = publicStorageUrl(renderPath);
  if (!renderUrl) throw new Error("Confirmed render is missing — cannot extract a cutout");

  // Keep the higher-quality default model for fine dress, hair, and veil edges.
  // The smaller model noticeably degrades cutout detail even though it starts faster.
  const cutoutBlob = await removeBackground(renderUrl, { model: "medium" });
  const buffer = Buffer.from(await cutoutBlob.arrayBuffer());

  const folder = role === "bride" ? "vto-cutouts/bride" : "vto-cutouts/bridesmaid";
  const { path } = await uploadToStorage(buffer, {
    folder,
    publicId: attemptId,
    contentType: "image/png",
  });
  return path;
}
