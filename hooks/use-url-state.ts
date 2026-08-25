"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

export type UrlHistoryMode = "push" | "replace";
export type UrlParamsUpdater = (params: URLSearchParams) => void;
export type UrlUpdater = (url: URL) => void;

/**
 * Read and update view state in the current URL without causing a page reload.
 * Native history calls are supported by the Next.js App Router and update every
 * useSearchParams subscriber, including in response to back/forward navigation.
 */
export function useUrlState() {
  const searchParams = useSearchParams();

  const updateLocation = React.useCallback(
    (update: UrlUpdater, mode: UrlHistoryMode = "push") => {
      let url: URL;
      try {
        url = new URL(window.location.href);
      } catch {
        return;
      }
      update(url);

      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next === current) return;

      if (mode === "replace") window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
    },
    [],
  );

  const updateUrl = React.useCallback(
    (update: UrlParamsUpdater, mode: UrlHistoryMode = "push") => {
      updateLocation((url) => update(url.searchParams), mode);
    },
    [updateLocation],
  );

  return { searchParams, updateLocation, updateUrl };
}
