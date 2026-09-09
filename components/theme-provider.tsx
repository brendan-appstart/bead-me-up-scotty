"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { getTheme, type ThemeDef, type ThemeMode } from "@/lib/themes";

/**
 * Per-project theme (bead-me-up-scotty-81k). The chosen theme is stored per-device
 * in localStorage, keyed by the active project so different projects look different
 * and don't get confused. Project identity comes from the /p/<projectId> URL; the
 * launcher (no project) uses a shared key.
 */
const LEGACY_KEY = "bmus-theme";
const THEME_EVENT = "bmus:theme";

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function serverSnapshot(): string {
  return "light";
}

function storageKey(projectId: string | null): string {
  return projectId ? `bmus.theme.${projectId}` : "bmus.theme";
}

/**
 * localStorage when in a browser, else undefined. Reached via `globalThis` on
 * purpose: a `typeof window === "undefined"` guard gets constant-folded to `true`
 * in the server bundle, which dead-code-eliminates the project-keyed read and
 * leaves the minifier emitting a temp before its declaration (TDZ during SSR).
 *
 * Node >= 22 exposes a `globalThis.localStorage` stub during SSR that lacks the
 * Storage methods unless the process was started with `--localstorage-file`
 * (calling `getItem` on it throws "is not a function"), so the object is only
 * usable if it actually implements Storage. Both methods are checked, not just
 * `getItem`: the read path and the two `setItem` writers share this one guard,
 * so a partial stub would still throw on save.
 */
function getStore(): Storage | undefined {
  const store = (globalThis as { localStorage?: Storage }).localStorage;
  return typeof store?.getItem === "function" && typeof store.setItem === "function"
    ? store
    : undefined;
}

function projectIdFromPath(pathname: string | null): string | null {
  const m = pathname?.match(/^\/p\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reads the saved theme id for a project, falling back to the legacy key, then default. */
function readThemeId(projectId: string | null): string {
  try {
    const store = getStore();
    const stored = store
      ? (store.getItem(storageKey(projectId)) ?? store.getItem(LEGACY_KEY))
      : null;
    return getTheme(stored).id;
  } catch {
    return "light";
  }
}

interface ThemeContextValue {
  theme: ThemeDef;
  mode: ThemeMode;
  setTheme: (id: string) => void;
  toggle: () => void;
}

// Plain-literal default (no module-load-time function call — keeps the bundler's
// scope-hoisting from tripping a TDZ during SSR). Only used if a consumer renders
// with no provider mounted, which doesn't happen in practice.
const ThemeContext = React.createContext<ThemeContextValue>({
  theme: { id: "light", name: "Light", mode: "light", swatch: ["#f6f6f8", "#ffffff", "#6d5ef0"] },
  mode: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);

  // Hydration must match the server's light snapshot before reading browser
  // preferences. React then applies the saved project theme and subscribes to changes.
  const themeId = React.useSyncExternalStore(
    subscribe,
    () => readThemeId(projectId),
    serverSnapshot,
  );

  // Apply to <html>: data-theme drives the palette; .dark drives Tailwind/shadcn.
  React.useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.classList.toggle("dark", theme.mode === "dark");
  }, [themeId]);

  // Plain handlers (no manual memoization — React Compiler handles it, and the
  // provider updates from the external store). Notify this tab after saving;
  // the native storage event handles other tabs.
  function setTheme(id: string) {
    getStore()?.setItem(storageKey(projectId), getTheme(id).id);
    window.dispatchEvent(new Event(THEME_EVENT));
  }
  // Quick Light<->Dark switch (sidebar button, T shortcut, launcher).
  function toggle() {
    const next = getTheme(readThemeId(projectId)).mode === "dark" ? "light" : "dark";
    getStore()?.setItem(storageKey(projectId), next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const theme = getTheme(themeId);

  return (
    <ThemeContext.Provider value={{ theme, mode: theme.mode, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeContext);
