"use client";
import * as React from "react";

const KEY = "bmus.default-focus";
const EVENT = "bmus:default-view";
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
function snapshot(): boolean {
  try { return globalThis.localStorage?.getItem(KEY) === "true"; }
  catch { return false; }
}
function save(enabled: boolean) {
  // Let the caller report storage failures instead of pretending it was saved.
  localStorage.setItem(KEY, String(enabled));
  window.dispatchEvent(new Event(EVENT));
}

/** A viewing preference for this browser, shared across projects. */
export function useDefaultFocus() {
  const enabled = React.useSyncExternalStore(subscribe, snapshot, () => false);
  return { enabled, save };
}
