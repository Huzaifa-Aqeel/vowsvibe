/** Optional client-only adapter. The web app defaults to the normal browser fetch. */
let adapter: { request: typeof fetch; cameraKitAllowed?: boolean; mobileMode?: boolean; demoMode?: boolean; captureSelfie?: () => Promise<File | null> } | null = null;
export function configureClientRuntime(value: NonNullable<typeof adapter>) { adapter = value; }
export const clientFetch: typeof fetch = (input, init) => adapter ? adapter.request(input, init) : globalThis.fetch(input, init);
export function canOpenCameraKit() { return adapter?.cameraKitAllowed !== false; }
export function isMobileRuntime() { return adapter?.mobileMode === true; }
export function isDemoRuntime() { return adapter?.demoMode === true; }
export function nativeSelfieCapture() { return adapter?.captureSelfie; }
