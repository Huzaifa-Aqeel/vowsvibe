import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const BUCKET_NAME = "vto-renders";

export const STORAGE_FOLDERS = [
  "user-photos/bride",
  "user-photos/bridesmaid",
  "catalog-dresses/bride",
  "user-dresses/bride",
  "user-dresses/bridesmaid",
  "vto-outputs/bride",
  "vto-outputs/bridesmaid",
  "vto-cutouts/bride",
  "vto-cutouts/bridesmaid",
] as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[number];

export interface StorageUploadResult { path: string; url: string; }

export function isStorageFolder(folder: string): folder is StorageFolder {
  return (STORAGE_FOLDERS as readonly string[]).includes(folder);
}

/** Stable storage reference only. URLs are never parsed or signed. */
export function storagePathFromUrl(reference: string | null | undefined): string | null {
  if (!reference) return null;
  if (!reference.startsWith("http://") && !reference.startsWith("https://")) return reference;
  try {
    const url = new URL(reference);
    const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const index = url.pathname.indexOf(marker);
    return index === -1 ? null : decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

export function publicStorageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(path).data.publicUrl;
}

export function resolveStorageUrl(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const path = storagePathFromUrl(reference);
  return path ? publicStorageUrl(path) : reference;
}

interface UploadOptions { folder: StorageFolder; publicId?: string; contentType?: string; }

export async function uploadToStorage(fileDataUrlOrBuffer: string | Buffer, options: UploadOptions): Promise<StorageUploadResult> {
  let buffer: Buffer;
  let contentType = options.contentType ?? "image/png";
  if (typeof fileDataUrlOrBuffer === "string") {
    const matches = fileDataUrlOrBuffer.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (matches) {
      contentType = matches[1];
      buffer = Buffer.from(matches[2], "base64");
    } else if (fileDataUrlOrBuffer.startsWith("http://") || fileDataUrlOrBuffer.startsWith("https://")) {
      const source = await fetch(fileDataUrlOrBuffer);
      if (!source.ok) throw new Error(`Could not fetch source image (${source.status})`);
      const sourceType = source.headers.get("content-type")?.split(";")[0];
      if (sourceType?.startsWith("image/")) contentType = sourceType;
      buffer = Buffer.from(await source.arrayBuffer());
    } else buffer = Buffer.from(fileDataUrlOrBuffer, "base64");
  } else buffer = fileDataUrlOrBuffer;

  const rawExt = contentType.split("/")[1] || "png";
  const ext = rawExt === "jpeg" ? "jpg" : rawExt;
  const fileName = options.publicId ? `${options.publicId}.${ext}` : `${Date.now()}_asset.${ext}`;
  const filePath = `${options.folder}/${fileName}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).upload(filePath, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return { path: filePath, url: publicStorageUrl(filePath)! };
}

export async function removeFromStoragePath(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove([path]);
  if (error) throw new Error(`Supabase deletion failed: ${error.message}`);
}

export async function removeManyFromStoragePaths(paths: Array<string | null | undefined>): Promise<void> {
  const unique = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove(unique.slice(i, i + 100));
    if (error) throw new Error(`Supabase bulk deletion failed: ${error.message}`);
  }
}
