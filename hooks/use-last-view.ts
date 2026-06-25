"use client";
import * as React from "react";
import type { View } from "@/components/app-context";

const VIEWS: View[] = [
  "board",
  "list",
  "epics",
  "graph",
  "insights",
  "activity",
  "needsyou",
  "achievements",
  "publish",
  "settings",
];
const isView = (v: string | null): v is View => v != null && (VIEWS as string[]).includes(v);
const keyFor = (projectId: string) => `bmus.view.${projectId}`;
const EVT = "bmus:view";

/**
 * Remembers the active view per project in localStorage (bead 433). Uses
 * useSyncExternalStore so it's SSR-safe: the server and the first client render
 * both return "board" (matching the server HTML), then it syncs to the stored
 * value — no setState-in-effect and no hydration mismatch. Falls back to "board"
 * for unknown/removed view ids.
 */
export function useLastView(projectId: string): [View, (v: View) => void] {
  const key = keyFor(projectId);
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener(EVT, cb);
    window.addEventListener("storage", cb);
    return () => {
      window.removeEventListener(EVT, cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const getSnapshot = React.useCallback((): View => {
    const v = localStorage.getItem(key);
    return isView(v) ? v : "board";
  }, [key]);
  const view = React.useSyncExternalStore(subscribe, getSnapshot, () => "board" as View);
  const setView = React.useCallback(
    (v: View) => {
      localStorage.setItem(key, v);
      window.dispatchEvent(new Event(EVT)); // same-tab notify (storage event is cross-tab only)
    },
    [key],
  );
  return [view, setView];
}
