/** Keep multipart requests below Vercel Functions' fixed 4.5 MB payload ceiling. */
export const VERCEL_SAFE_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Shrinks large camera images in the browser before they enter a Vercel Function.
 * Smaller files are preserved byte-for-byte; oversized images become orientation-aware
 * JPEGs with a bounded longest edge and progressively reduced quality.
 */
export async function prepareImageUpload(file: File, maxDimension = 2400, maxBytes = VERCEL_SAFE_IMAGE_BYTES): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Only image files are supported");
  if (file.size <= maxBytes) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image format could not be prepared. Please choose a JPEG, PNG, or WebP image.");
  }

  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= maxBytes) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
      }
    }
    throw new Error("Image is still too large after resizing. Please choose a smaller image.");
  } finally {
    bitmap.close();
  }
}
