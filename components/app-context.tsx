"use client";
import * as React from "react";
import { type BeadType } from "@/lib/schema";
import type { Bead } from "@/lib/schema";
import type { Meta } from "@/lib/api-client";

export type View =
  | "focus"
  | "board"
  | "list"
  | "epics"
  | "graph"
  | "insights"
  | "activity"
  | "needsyou"
  | "achievements"
  | "publish"
  | "settings";

interface AppContextValue {
  projectId: string;
  beads: Bead[];
  index: Map<string, Bead>;
  meta?: Meta;
  humanAllowlist: string[];
  /** Viewer mode (SCOTTY_READ_ONLY): hide write affordances; the server refuses writes anyway. */
  readOnly: boolean;
  loading: boolean;
  error?: string;
  /** Open a bead, STARTING A FRESH trail (clears any back history). */
  openDetail: (id: string) => void;
  /** Open a bead, PUSHING onto the trail so back returns here. Drawer-internal only. */
  pushDetail: (id: string) => void;
  /** Open the create dialog, optionally presetting the parent and/or the type. */
  openCreate: (opts?: { parent?: string; type?: BeadType }) => void;
  /** Jump to the Epics screen and focus a specific epic (bead 55b). */
  openEpic: (epicId: string) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProvider({
  value,
  children,
}: {
  value: AppContextValue;
  children: React.ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
