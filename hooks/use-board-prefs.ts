"use client";
import * as React from "react";
import type { BoardSortMode } from "@/lib/board-columns";
import type { UpdateChannel } from "@/lib/update-types";
const PREFS_KEY = "bmus.board";
const EVENT = "bmus.board.changed";
export type BlockedColumnMode = "auto" | "always";
export interface BoardPrefs {
  blockedColumn: BlockedColumnMode;
  sortMode: BoardSortMode;
  checkUpdates: boolean;
  updateChannel: UpdateChannel;
}
const DEFAULTS: BoardPrefs = { blockedColumn: "auto", sortMode: "manual", checkUpdates: true, updateChannel: "stable" };
function snapshot() {
  try { return globalThis.localStorage?.getItem(PREFS_KEY) || ""; } catch { return ""; }
}
function parse(raw: string): BoardPrefs {
  try {
    const stored = JSON.parse(raw || "{}");
    return { blockedColumn: stored?.blockedColumn === "always" ? "always" : "auto",
      sortMode: ["priority", "updated", "manual"].includes(stored?.sortMode) ? stored.sortMode : "manual",
      checkUpdates: typeof stored?.checkUpdates === "boolean" ? stored.checkUpdates : true,
      updateChannel: stored?.updateChannel === "development" ? "development" : "stable" };
  } catch { return DEFAULTS; }
}
export function loadBoardPrefs(): BoardPrefs { return parse(snapshot()); }
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); };
}
let sessionValue: string | undefined;
function clientSnapshot() { return sessionValue ?? snapshot(); }
function serverSnapshot() { return null; }
// Use a shared external store so Settings takes effect in the sidebar immediately.
export function useBoardPrefs() {
  const raw = React.useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const prefs = parse(raw || "");
  const setPrefs = React.useCallback((next: BoardPrefs) => {
    const value = JSON.stringify(next);
    try { localStorage.setItem(PREFS_KEY, value); sessionValue = undefined; }
    catch { sessionValue = value; }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { prefs, setPrefs, ready: raw !== null };
}
