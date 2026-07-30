"use client";

import * as React from "react";
import type { DetailAction, View } from "@/components/app-context";
import { CommandPalette, type PalettePage } from "@/components/command-palette";
import { KeyboardHelpDialog } from "@/components/keyboard-help-dialog";
import { useAppKeyboardShortcuts } from "@/hooks/use-app-keyboard";

export function KeyboardLayer({
  projectId,
  readOnly,
  selectedId,
  selectIdAction,
  setViewAction,
  openDetailAction,
  openCreateAction,
  closeOverlaysAction,
  toggleThemeAction,
}: {
  projectId: string;
  readOnly: boolean;
  selectedId: string | null;
  selectIdAction: (id: string | null) => void;
  setViewAction: (view: View) => void;
  openDetailAction: (id: string, action?: DetailAction) => void;
  openCreateAction: () => void;
  closeOverlaysAction: () => void;
  toggleThemeAction: () => void;
}) {
  const [helpOpen, setHelpOpen] = React.useState(false);
  const paletteNonce = React.useRef(0);
  const [paletteRequest, setPaletteRequest] = React.useState<{
    open: boolean;
    page: PalettePage;
    beadId: string | null;
    nonce: number;
  }>({ open: false, page: "root", beadId: null, nonce: 0 });

  const openPalette = React.useCallback((page: PalettePage = "root", beadId?: string) => {
    if (readOnly && (page === "status" || page === "priority")) return;
    setPaletteRequest((current) => ({
      open: page === "root" && !beadId && current.open ? false : true,
      page,
      beadId: beadId ?? null,
      nonce: (paletteNonce.current += 1),
    }));
  }, [readOnly]);
  const closeAll = React.useCallback(() => {
    setPaletteRequest((current) => ({ ...current, open: false }));
    setHelpOpen(false);
    closeOverlaysAction();
  }, [closeOverlaysAction]);

  const actions = React.useMemo(
    () => ({
      projectId,
      readOnly,
      selectedId,
      selectId: selectIdAction,
      setView: setViewAction,
      openDetail: openDetailAction,
      openCreate: openCreateAction,
      openPalette,
      openHelp: () => setHelpOpen(true),
      closeOverlays: closeAll,
      toggleTheme: toggleThemeAction,
    }),
    [
      projectId,
      readOnly,
      selectedId,
      selectIdAction,
      setViewAction,
      openDetailAction,
      openCreateAction,
      openPalette,
      closeAll,
      toggleThemeAction,
    ],
  );
  useAppKeyboardShortcuts(actions);

  return (
    <>
      <CommandPalette
        key={`${paletteRequest.nonce}-${readOnly ? "ro" : "rw"}`}
        open={paletteRequest.open}
        onOpenChangeAction={(open) =>
          setPaletteRequest((current) => ({ ...current, open }))
        }
        onViewAction={setViewAction}
        initialPage={paletteRequest.page}
        initialBeadId={paletteRequest.beadId}
      />
      <KeyboardHelpDialog open={helpOpen} onOpenChangeAction={setHelpOpen} />
    </>
  );
}
