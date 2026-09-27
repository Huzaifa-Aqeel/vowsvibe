import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { browserFileActions, type FileActionAdapter } from "@/lib/platform/file-actions";
export const mobileFileActions: FileActionAdapter = {
  async saveDataUrl(dataUrl, fileName) {
    if (!Capacitor.isNativePlatform()) return browserFileActions.saveDataUrl(dataUrl, fileName);
    if (!/^data:image\/png;base64,/.test(dataUrl)) throw new Error("Only PNG image exports are supported.");
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
    const file = await Filesystem.writeFile({ path: `lineups/${Date.now()}-${safeName}`, data: dataUrl.split(",")[1], directory: Directory.Cache, recursive: true });
    await Share.share({ title: "Vows & Vibe lineup", files: [file.uri], dialogTitle: "Save or share your bridal party" });
  },
};
