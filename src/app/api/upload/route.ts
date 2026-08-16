import { NextRequest, NextResponse } from "next/server";
import { isStorageFolder, uploadToStorage } from "@/lib/storage/upload";

export const runtime = "nodejs";
export const maxDuration = 30;

// Enforce 50MB limit matching your Supabase Bucket configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB in Bytes

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
      return NextResponse.json({ error: "Image must be under 50MB" }, { status: 400 });
    }

    // 2. Convert File to Buffer for Server Upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Generate a clean unique filename using timestamp & safe original name
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const publicId = `${Date.now()}_${sanitizedFileName.replace(/\.[^.]+$/, "")}`;

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
