"use client";
import * as React from "react";
import { isView, type View } from "@/lib/views";
import { useDefaultFocus } from "@/hooks/use-default-view";
import { useUrlState } from "@/hooks/use-url-state";

/** Explicit view links win; ordinary project links use the user's default. */
export function useLastView(): [View, (v: View) => void] {
  const { enabled } = useDefaultFocus();
  const { searchParams, updateUrl } = useUrlState();
  const requested = searchParams.get("view");
  const view = isView(requested) ? requested : enabled ? "focus" : "board";
  const setView = React.useCallback((next: View) => {
    updateUrl(params => params.set("view", next));
  }, [updateUrl]);
  return [view, setView];
}
