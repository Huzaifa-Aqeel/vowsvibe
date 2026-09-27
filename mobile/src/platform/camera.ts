import { Camera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";

export async function captureSelfie(): Promise<File | null> {
  try {
    const photo = await Camera.getPhoto({ source: CameraSource.Camera, direction: CameraDirection.Front,
      resultType: CameraResultType.Uri, quality: 90, width: 1600, height: 1600, correctOrientation: true,
      saveToGallery: false });
    if (!photo.webPath) throw new Error("The camera did not return an image. Please upload a selfie instead.");
    const response = await globalThis.fetch(photo.webPath);
    if (!response.ok) throw new Error("Could not read your camera photo. Please upload a selfie instead.");
    const image = await response.blob();
    return new File([image], `selfie.${photo.format || "jpeg"}`, { type: image.type || "image/jpeg" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
    if (/cancel(?:led|ed)?|no image picked/i.test(message)) return null;
    throw new Error(/permission|denied/i.test(message)
      ? "Camera access was denied. Enable it in Android settings or upload a selfie instead."
      : message || "Could not open the camera. Please upload a selfie instead.");
  }
}
