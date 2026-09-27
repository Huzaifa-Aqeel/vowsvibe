import { beforeEach, expect, it, vi } from "vitest";
import { createNavigation } from "../../src/platform/navigation";

type HistoryState = Record<string, unknown> | null;

beforeEach(() => {
  let state: HistoryState = null;
  let href = "https://localhost/";
  const location = {
    get href() { return href; },
    get origin() { return new URL(href).origin; },
    get pathname() { return new URL(href).pathname; },
  };
  const history = {
    get state() { return state; },
    replaceState: vi.fn((next: HistoryState, _unused: string, url: URL | string) => { state = next; href = new URL(String(url), href).href; }),
    pushState: vi.fn((next: HistoryState, _unused: string, url: URL | string) => { state = next; href = new URL(String(url), href).href; }),
    back: vi.fn(),
  };
  vi.stubGlobal("window", { location, history, scrollTo: vi.fn() });
});

it("treats an external invite as a new navigation root", () => {
  const changed = vi.fn();
  const navigation = createNavigation(changed, vi.fn());
  navigation.push("/dashboard");
  expect(navigation.canGoBack()).toBe(true);

  navigation.reset("/invite/abc123");
  expect(window.location.pathname).toBe("/invite/abc123");
  expect(navigation.canGoBack()).toBe(false);
  navigation.back();
  expect(window.location.pathname).toBe("/invite/abc123");
});

it("keeps Back available for screens opened inside the app", () => {
  const navigation = createNavigation(vi.fn(), vi.fn());
  navigation.push("/dashboard");
  navigation.push("/events/wedding");
  expect(navigation.canGoBack()).toBe(true);
  navigation.back();
  expect(window.history.back).toHaveBeenCalledOnce();
});
