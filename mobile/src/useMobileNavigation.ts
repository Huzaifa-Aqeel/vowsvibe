import { useEffect, useMemo, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createNavigation } from "./platform/navigation";

export function useMobileNavigation() {
  const [path, setPath] = useState(window.location.pathname);
  const [revision, setRevision] = useState(0);
  const navigation = useMemo(() => createNavigation(setPath, () => setRevision((v) => v + 1)), []);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty("--mobile-keyboard-inset", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update); update();
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener("backButton", () => {
      const dialog = document.querySelector('.mobile-color-prompt, [role="dialog"]');
      const dismiss = dialog?.querySelector<HTMLButtonElement>('button[aria-label^="Close"]')
        ?? [...(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => /^(Cancel|Cancel upload)$/.test(button.textContent ?? ""));
      if (dismiss) { dismiss.click(); return; }
      if (navigation.canGoBack()) navigation.back(); else void NativeApp.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [navigation]);
  return { path, revision, navigation };
}
