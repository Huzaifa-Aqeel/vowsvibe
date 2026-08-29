export interface FileActionAdapter {
  saveDataUrl(dataUrl: string, fileName: string): Promise<void>;
}

/**
 * Browser implementation kept behind an adapter so a future Capacitor build can
 * replace it with Filesystem/Share plugins without changing lineup components.
 */
export const browserFileActions: FileActionAdapter = {
  async saveDataUrl(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
};
