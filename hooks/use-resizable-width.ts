"use client";
import * as React from "react";

/**
 * Width state for a resizable surface (dialog / drawer), persisted per browser.
 *
 * `startResize` is a pointerdown handler for a drag handle. `deltaFactor` maps
 * pointer dx → width delta:
 *   - centered dialog, handle on the right edge → 2 (both sides grow, tracks cursor)
 *   - right-anchored drawer, handle on the left edge → -1 (grows leftward 1:1)
 *
 * The persisted width is read lazily in the initializer (SSR-guarded). These
 * surfaces only mount when opened, i.e. after hydration, so there is no
 * server/client markup mismatch.
 */
export function useResizableWidth(opts: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  deltaFactor: number;
}) {
  const { storageKey, defaultWidth, min, max, deltaFactor } = opts;
  const clamp = React.useCallback((w: number) => Math.min(max, Math.max(min, w)), [min, max]);

  const [width, setWidthState] = React.useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === null) return defaultWidth;
      const n = Number(saved);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const widthRef = React.useRef(width);
  const setWidth = React.useCallback((w: number) => {
    widthRef.current = w;
    setWidthState(w);
  }, []);

  const startResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (ev: PointerEvent) => {
        setWidth(clamp(startWidth + (ev.clientX - startX) * deltaFactor));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        try {
          window.localStorage.setItem(storageKey, String(Math.round(widthRef.current)));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clamp, deltaFactor, storageKey, setWidth],
  );

  return { width, startResize };
}
