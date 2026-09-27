const DEPTH_KEY = "vowsVibeMobileDepth";

export function initialiseNavigation() {
  if (!Number.isInteger(window.history.state?.[DEPTH_KEY])) {
    window.history.replaceState({ ...window.history.state, [DEPTH_KEY]: 0 }, "", window.location.href);
  }
}

export function createNavigation(onChange: (path: string) => void, refresh: () => void) {
  initialiseNavigation();
  function visit(path: string, replace = false) {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("External navigation must use the system browser.");
    const depth = Number(window.history.state?.[DEPTH_KEY] ?? 0);
    window.history[replace ? "replaceState" : "pushState"]({ [DEPTH_KEY]: depth + (replace ? 0 : 1) }, "", url);
    onChange(url.pathname);
    window.scrollTo(0, 0);
  }
  return {
    push: (path: string) => visit(path),
    replace: (path: string) => visit(path, true),
    refresh,
    back: () => {
      if (Number(window.history.state?.[DEPTH_KEY] ?? 0) > 0) { window.history.back(); return; }
      if (window.location.pathname !== "/") visit("/", true);
    },
    canGoBack: () => Number(window.history.state?.[DEPTH_KEY] ?? 0) > 0 || window.location.pathname !== "/",
  };
}
