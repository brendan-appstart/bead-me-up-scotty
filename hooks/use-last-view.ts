"use client";
import * as React from "react";
import type { View } from "@/components/app-context";
import { useDefaultFocus } from "@/hooks/use-default-view";

/**
 * Start each project visit in the selected default, then allow normal navigation.
 * Old last-view storage is deliberately ignored: visiting Focus is not opt-in.
 * The hook name is retained for the AppShell integration.
 */
export function useLastView(projectId: string): [View, (v: View) => void] {
  const { enabled } = useDefaultFocus();
  const [selection, setSelection] = React.useState<{ projectId: string; view: View } | null>(null);
  const view = selection?.projectId === projectId ? selection.view : enabled ? "focus" : "board";
  const setView = React.useCallback((v: View) => setSelection({ projectId, view: v }), [projectId]);
  return [view, setView];
}
