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

function storageKey(projectId: string | null): string {
  return projectId ? `bmus.theme.${projectId}` : "bmus.theme";
}

/**
 * localStorage when in a browser, else undefined. Reached via `globalThis` on
 * purpose: a `typeof window === "undefined"` guard gets constant-folded to `true`
 * in the server bundle, which dead-code-eliminates the project-keyed read and
 * leaves the minifier emitting a temp before its declaration (TDZ during SSR).
 */
function getStore(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage;
}

function projectIdFromPath(pathname: string | null): string | null {
  const m = pathname?.match(/^\/p\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reads the saved theme id for a project, falling back to the legacy key, then default. */
function readThemeId(projectId: string | null): string {
  const store = getStore();
  const stored = store
    ? (store.getItem(storageKey(projectId)) ?? store.getItem(LEGACY_KEY))
    : null;
  return getTheme(stored).id;
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

  // localStorage (keyed by the active project) is the source of truth; this is a
  // bare re-render trigger for in-session changes. Reading the value in render —
  // rather than mirroring it into state — keeps us clear of the React Compiler
  // lints against setState-in-render / setState-in-effect, and means a project
  // switch (projectId changes → re-render) re-skins with no sync code at all.
  const [, bump] = React.useReducer((n: number) => n + 1, 0);

  const themeId = readThemeId(projectId);

  // Apply to <html>: data-theme drives the palette; .dark drives Tailwind/shadcn.
  React.useEffect(() => {
    const theme = getTheme(themeId);
    document.documentElement.dataset.theme = theme.id;
    document.documentElement.classList.toggle("dark", theme.mode === "dark");
  }, [themeId]);

  // Plain handlers (no manual memoization — React Compiler handles it, and the
  // provider only re-renders on a theme change or navigation). They write the
  // active project's key and bump to re-render.
  function setTheme(id: string) {
    getStore()?.setItem(storageKey(projectId), getTheme(id).id);
    bump();
  }
  // Quick Light<->Dark switch (sidebar button, T shortcut, launcher).
  function toggle() {
    const next = getTheme(readThemeId(projectId)).mode === "dark" ? "light" : "dark";
    getStore()?.setItem(storageKey(projectId), next);
    bump();
  }

  const theme = getTheme(themeId);

  return (
    <ThemeContext.Provider value={{ theme, mode: theme.mode, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => React.useContext(ThemeContext);
