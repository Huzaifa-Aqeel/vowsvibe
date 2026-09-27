const DEPTH_KEY = "vowsVibeMobileDepth";

export function initialiseNavigation() {
  if (!Number.isInteger(window.history.state?.[DEPTH_KEY])) {
    window.history.replaceState({ ...window.history.state, [DEPTH_KEY]: 0 }, "", window.location.href);
  }
}

export function createNavigation(onChange: (path: string) => void, refresh: () => void) {
  initialiseNavigation();
  function visit(path: string, replace = false, reset = false) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("External navigation must use the system browser.");
    const depth = Number(window.history.state?.[DEPTH_KEY] ?? 0);
    window.history[replace ? "replaceState" : "pushState"]({ [DEPTH_KEY]: reset ? 0 : depth + (replace ? 0 : 1) }, "", url);
    onChange(url.pathname);
    window.scrollTo(0, 0);
  }
  return {
    push: (path: string) => visit(path),
    replace: (path: string) => visit(path, true),
    // App links are new entry points, not children of whichever bride screen happened
    // to be open. Resetting prevents Back from exposing that previous private flow.
    reset: (path: string) => visit(path, true, true),
    refresh,
    back: () => {
      if (Number(window.history.state?.[DEPTH_KEY] ?? 0) > 0) { window.history.back(); return; }
    },
    canGoBack: () => Number(window.history.state?.[DEPTH_KEY] ?? 0) > 0,
  };
}
