"use client";
import * as React from "react";
import type { Bead } from "@/lib/schema";
import type { Meta } from "@/lib/api-client";

export type View = "board" | "epics" | "graph" | "settings";

interface AppContextValue {
  beads: Bead[];
  index: Map<string, Bead>;
  meta?: Meta;
  humanAllowlist: string[];
  loading: boolean;
  error?: string;
  openDetail: (id: string) => void;
  openCreate: (parent?: string) => void;
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
