"use client";
import * as React from "react";
import Link from "next/link";
import { useBeads } from "@/hooks/use-beads";
import { useBeadsStream } from "@/hooks/use-beads-stream";
import { makeIndex } from "@/lib/beads-view";
import { AppProvider, type View } from "@/components/app-context";
import { Sidebar } from "@/components/sidebar";
import { Board } from "@/components/board/board";
import { ListView } from "@/components/list-view";
import { EpicsView } from "@/components/epics-view";
import { GraphView } from "@/components/graph-view";
import { SettingsView } from "@/components/settings-view";
import { BeadDetailDrawer } from "@/components/bead-detail-drawer";
import { CreateBeadModal } from "@/components/create-bead-modal";

export function AppShell({ projectId }: { projectId: string }) {
  const [view, setView] = React.useState<View>("board");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [create, setCreate] = React.useState<{ open: boolean; parent: string }>({
    open: false,
    parent: "",
  });

  const { data, isLoading, error } = useBeads(projectId);
  // Live push: refetch the moment this project's .beads/ mutates, instead of
  // waiting for the fallback poll interval. `live` drives the sidebar indicator.
  const { live } = useBeadsStream(projectId);
  const beads = React.useMemo(() => data?.beads ?? [], [data]);
  const index = React.useMemo(() => makeIndex(beads), [beads]);

  const openDetail = React.useCallback((id: string) => setOpenId(id), []);
  const openCreate = React.useCallback((parent = "") => setCreate({ open: true, parent }), []);

  // keyboard: n = new, / = focus search, Esc = close overlays
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (e.key === "Escape") {
        setOpenId(null);
        setCreate((c) => ({ ...c, open: false }));
        return;
      }
      if (typing) return;
      if (e.key === "n") {
        e.preventDefault();
        openCreate();
      }
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[data-search]')?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate]);

  const errorMessage = error ? (error as Error).message : undefined;

  return (
    <AppProvider
      value={{
        projectId,
        beads,
        index,
        meta: data?.meta,
        humanAllowlist: data?.meta?.humanAllowlist ?? [],
        loading: isLoading,
        error: errorMessage,
        openDetail,
        openCreate,
      }}
    >
      <div className="flex h-full overflow-hidden bg-background text-foreground text-sm">
        <Sidebar
          view={view}
          onView={setView}
          kind={data?.meta?.kind}
          projectId={projectId}
          live={live}
        />
        <main className="relative flex min-w-0 flex-1 flex-col">
          {errorMessage && view !== "settings" ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center">
                <p className="text-sm font-medium text-destructive">Couldn’t open this project</p>
                <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  ← Back to projects
                </Link>
              </div>
            </div>
          ) : (
            <>
              {view === "board" && <Board />}
              {view === "list" && <ListView />}
              {view === "epics" && <EpicsView />}
              {view === "graph" && <GraphView />}
              {view === "settings" && <SettingsView />}
            </>
          )}

          <BeadDetailDrawer openId={openId} onClose={() => setOpenId(null)} />
        </main>
      </div>

      <CreateBeadModal
        open={create.open}
        parent={create.parent}
        onOpenChange={(o) => setCreate((c) => ({ ...c, open: o }))}
      />
    </AppProvider>
  );
}
