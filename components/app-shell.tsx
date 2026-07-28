"use client";
import * as React from "react";
import { type BeadType } from "@/lib/schema";
import Link from "next/link";
import { useBeads } from "@/hooks/use-beads";
import { useBeadsStream } from "@/hooks/use-beads-stream";
import { useLastView } from "@/hooks/use-last-view";
import { useTheme } from "@/components/theme-provider";
import { makeIndex } from "@/lib/beads-view";
import { AppProvider } from "@/components/app-context";
import { Sidebar } from "@/components/sidebar";
import { Board } from "@/components/board/board";
import { ListView } from "@/components/list-view";
import { EpicsView } from "@/components/epics-view";
import { GraphView } from "@/components/graph-view";
import { InsightsView } from "@/components/insights-view";
import { ActivityView } from "@/components/activity-view";
import { NeedsYouView } from "@/components/needs-you-view";
import { AchievementsView } from "@/components/achievements-view";
import { PublishView } from "@/components/publish-view";
import { SettingsView } from "@/components/settings-view";
import { BeadDetailDrawer } from "@/components/bead-detail-drawer";
import { CreateBeadModal } from "@/components/create-bead-modal";
import { CommandPalette } from "@/components/command-palette";
import { NotificationWatcher } from "@/components/notification-watcher";

export function AppShell({ projectId }: { projectId: string }) {
  const [view, setView] = useLastView(projectId);
  const { toggle: toggleTheme } = useTheme();
  // Drawer navigation TRAIL, not a single id: clicking a subtask from its
  // parent used to replace the drawer outright, leaving no way back (GH #15).
  // The visible bead is the last entry.
  const [openStack, setOpenStack] = React.useState<string[]>([]);
  const openId = openStack.length ? openStack[openStack.length - 1] : null;
  const [palette, setPalette] = React.useState(false);
  const [create, setCreate] = React.useState<{
    open: boolean;
    parent: string;
    type?: BeadType;
  }>({ open: false, parent: "" });

  const { data, isLoading, error } = useBeads(projectId);
  // Live push: refetch the moment this project's .beads/ mutates, instead of
  // waiting for the fallback poll interval. `live` drives the sidebar indicator.
  const { live } = useBeadsStream(projectId);
  const beads = React.useMemo(() => data?.beads ?? [], [data]);
  const index = React.useMemo(() => makeIndex(beads), [beads]);

  // RESET. Every caller outside the drawer (board, list, epics, activity,
  // needs-you, palette, assist panel) means "start here", not "continue a trail".
  const openDetail = React.useCallback((id: string) => setOpenStack([id]), []);
  // PUSH. Drawer-internal navigation only, so back can return.
  const MAX_TRAIL = 25;
  const pushDetail = React.useCallback(
    (id: string) =>
      setOpenStack((s) => {
        if (s[s.length - 1] === id) return s; // re-clicking the current bead is a no-op
        const next = [...s, id];
        return next.length > MAX_TRAIL ? next.slice(next.length - MAX_TRAIL) : next;
      }),
    [],
  );
  const closeDetail = React.useCallback(() => setOpenStack([]), []);
  // POP. Skips entries whose bead has since been deleted/archived away, so back
  // can never land on an empty drawer; if nothing valid remains, it closes.
  const backDetail = React.useCallback(() => {
    setOpenStack((s) => {
      const next = s.slice(0, -1);
      while (next.length && !index.has(next[next.length - 1])) next.pop();
      return next;
    });
  }, [index]);
  // Viewer mode: every create entry point (board/list buttons, drawer subtask,
  // palette, the `n` key) funnels through openCreate, so one guard covers all.
  const readOnly = data?.meta?.readOnly ?? false;
  // Options object rather than positional args so future presets (assignee,
  // priority) can be added without churning every call site again.
  const openCreate = React.useCallback(
    (opts: { parent?: string; type?: BeadType } = {}) => {
      if (readOnly) return;
      setCreate({ open: true, parent: opts.parent ?? "", type: opts.type });
    },
    [readOnly],
  );

  // Jump to the Epics screen and focus an epic (bead 55b). The nonce makes each
  // request distinct so clicking the same epic again re-triggers the scroll.
  const [focusEpic, setFocusEpic] = React.useState<{ id: string; nonce: number } | null>(null);
  const focusNonce = React.useRef(0);
  const openEpic = React.useCallback(
    (epicId: string) => {
      setOpenStack([]); // close the detail drawer
      setView("epics");
      setFocusEpic({ id: epicId, nonce: (focusNonce.current += 1) });
    },
    [setView],
  );

  // keyboard: Cmd/Ctrl+K = command palette, n = new, / = focus search, t = toggle theme, Esc = close overlays
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      // Cmd/Ctrl+K toggles the palette — works even while typing in a field.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (e.key === "Escape") {
        setOpenStack([]);
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
      if (e.key === "t" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate, toggleTheme]);

  const errorMessage = error ? (error as Error).message : undefined;

  return (
    <AppProvider
      value={{
        projectId,
        beads,
        index,
        meta: data?.meta,
        humanAllowlist: data?.meta?.humanAllowlist ?? [],
        readOnly,
        loading: isLoading,
        error: errorMessage,
        openDetail,
        pushDetail,
        openCreate,
        openEpic,
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
              {view === "epics" && <EpicsView focusEpic={focusEpic} />}
              {view === "graph" && <GraphView />}
              {view === "insights" && <InsightsView />}
              {view === "activity" && <ActivityView />}
              {view === "needsyou" && <NeedsYouView />}
              {view === "achievements" && <AchievementsView />}
              {view === "publish" && <PublishView />}
              {view === "settings" && <SettingsView />}
            </>
          )}

          <BeadDetailDrawer
            openId={openId}
            canGoBack={openStack.length > 1}
            backTo={openStack.length > 1 ? openStack[openStack.length - 2] : null}
            onBack={backDetail}
            onClose={closeDetail}
          />
        </main>
      </div>

      <CreateBeadModal
        open={create.open}
        parent={create.parent}
        type={create.type}
        onOpenChange={(o) => setCreate((c) => ({ ...c, open: o }))}
      />

      <CommandPalette open={palette} onOpenChange={setPalette} onView={setView} />
      <NotificationWatcher projectId={projectId} />
    </AppProvider>
  );
}
