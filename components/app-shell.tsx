"use client";
import * as React from "react";
import { toast } from "sonner";
import { type BeadType } from "@/lib/schema";
import Link from "next/link";
import { useBeads } from "@/hooks/use-beads";
import { useBeadsStream } from "@/hooks/use-beads-stream";
import { useLastView } from "@/hooks/use-last-view";
import { useTheme } from "@/components/theme-provider";
import { makeIndex } from "@/lib/beads-view";
import { AppProvider, type DetailAction } from "@/components/app-context";
import { Sidebar } from "@/components/sidebar";
import { Board } from "@/components/board/board";
import { FocusView } from "@/components/focus-view";
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
import { KeyboardLayer } from "@/components/keyboard-layer";
import { NotificationWatcher } from "@/components/notification-watcher";
import { ReadOnlyBanner } from "@/components/read-only-banner";
import { useViewerMode } from "@/hooks/use-viewer-mode";
import { useNotificationActivation } from "@/hooks/use-notifications";

export function AppShell({ projectId }: { projectId: string }) {
  const [view, setView] = useLastView();
  const { toggle: toggleTheme } = useTheme();
  // Drawer navigation TRAIL, not a single id: clicking a subtask from its
  // parent used to replace the drawer outright, leaving no way back (GH #15).
  // The visible bead is the last entry.
  //
  // Seeded from `?bead=<ID>` so a bead is URL-addressable (see the sync effect
  // below). Read during render rather than in a mount effect: the repo's React
  // Compiler lint forbids setState-in-effect, and the seed is safe to hydrate
  // with because the drawer's open state also depends on the bead being present
  // in `index` — react-query has no SSR prefetch here, so server and first
  // client render both see an empty index and render the drawer closed.
  const [openStack, setOpenStack] = React.useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const seed = new URLSearchParams(window.location.search).get("bead");
    return seed ? [seed] : [];
  });
  const rawOpenId = openStack.length ? openStack[openStack.length - 1] : null;
  const [selectedBeadId, selectBead] = React.useState<string | null>(null);
  const detailNonce = React.useRef(0);
  const [detailRequest, setDetailRequest] = React.useState<{
    id: string;
    action: DetailAction;
    nonce: number;
  } | null>(null);
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
  const viewerMode = useViewerMode();
  const readOnly = viewerMode.data?.readOnly ?? true;
  // Preserve the requested link until a successful response establishes whether
  // the bead exists. A network error must not erase a valid bookmark.
  const loaded = !isLoading && !error && !!data;
  const openId = rawOpenId && loaded && !index.has(rawOpenId) ? null : rawOpenId;
  const missingToasted = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!loaded) return;
    if (!rawOpenId || index.has(rawOpenId)) {
      missingToasted.current = null;
      return;
    }
    if (missingToasted.current === rawOpenId) return;
    missingToasted.current = rawOpenId;
    toast.error(`Bead ${rawOpenId} not found in this project`);
  }, [loaded, rawOpenId, index]);

  // RESET. Every caller outside the drawer (board, list, epics, activity,
  // needs-you, palette, assist panel) means "start here", not "continue a trail".
  const openDetail = React.useCallback((id: string, action: DetailAction = "view") => {
    selectBead(id);
    setOpenStack([id]);
    setDetailRequest({
      id,
      action: readOnly ? "view" : action,
      nonce: (detailNonce.current += 1),
    });
  }, [readOnly]);
  useNotificationActivation(projectId, openDetail);
  // PUSH. Drawer-internal navigation only, so back can return.
  const MAX_TRAIL = 25;
  const pushDetail = React.useCallback((id: string) => {
    if (openStack[openStack.length - 1] === id) return;
    selectBead(id);
    setOpenStack((s) => {
      if (s[s.length - 1] === id) return s; // re-clicking the current bead is a no-op
      const next = [...s, id];
      return next.length > MAX_TRAIL ? next.slice(next.length - MAX_TRAIL) : next;
    });
    setDetailRequest({ id, action: "view", nonce: (detailNonce.current += 1) });
  }, [openStack]);
  const closeDetail = React.useCallback(() => {
    setOpenStack([]);
    setDetailRequest(null);
  }, []);

  // Drawer changes replace the current URL entry, preserving its own Back
  // trail. View/filter entries can still restore their bead on browser Back.
  React.useEffect(() => {
    const restore = () => {
      const id = new URLSearchParams(window.location.search).get("bead");
      if (id === rawOpenId) return;
      setOpenStack(id ? [id] : []);
      setDetailRequest(null);
      selectBead(id);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [rawOpenId]);

  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("bead", openId);
    else url.searchParams.delete("bead");
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [openId, rawOpenId]);

  // POP. Skips entries whose bead has since been deleted/archived away, so back
  // can never land on an empty drawer; if nothing valid remains, it closes.
  const backDetail = React.useCallback(() => {
    setOpenStack((current) => {
      const next = current.slice(0, -1);
      while (next.length && !index.has(next[next.length - 1])) next.pop();
      return next;
    });
    selectBead(null);
    setDetailRequest(null);
  }, [index]);
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
  const clearFocusEpic = React.useCallback(() => setFocusEpic(null), []);
  const openEpic = React.useCallback(
    (epicId: string) => {
      setOpenStack([]); // close the detail drawer
      setDetailRequest(null);
      setView("epics");
      setFocusEpic({ id: epicId, nonce: (focusNonce.current += 1) });
    },
    [setView],
  );

  const openCreateFromKeyboard = React.useCallback(() => openCreate(), [openCreate]);
  const closeOverlays = React.useCallback(() => {
    setOpenStack([]);
    setDetailRequest(null);
    setCreate((current) => ({ ...current, open: false }));
  }, []);

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
        selectedBeadId,
        selectBead,
        openDetail,
        pushDetail,
        openCreate,
        openEpic,
      }}
    >
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground text-sm">
        <ReadOnlyBanner />
        <div className="flex min-h-0 flex-1 overflow-hidden">
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
              {view === "epics" && (
                <EpicsView focusEpic={focusEpic} onFocusHandledAction={clearFocusEpic} />
              )}
              {view === "focus" && <FocusView />}
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
            initialAction={detailRequest?.id === openId ? detailRequest.action : "view"}
            actionNonce={detailRequest?.id === openId ? detailRequest.nonce : 0}
            canGoBack={openStack.length > 1}
            backTo={openStack.length > 1 ? openStack[openStack.length - 2] : null}
            onBack={backDetail}
            onClose={closeDetail}
          />
        </main>
        </div>
      </div>

      <CreateBeadModal
        open={create.open && !readOnly}
        parent={create.parent}
        type={create.type}
        onOpenChange={(o) => setCreate((c) => ({ ...c, open: o }))}
      />

      <KeyboardLayer
        projectId={projectId}
        readOnly={readOnly}
        selectedId={selectedBeadId}
        selectIdAction={selectBead}
        setViewAction={setView}
        openDetailAction={openDetail}
        openCreateAction={openCreateFromKeyboard}
        closeOverlaysAction={closeOverlays}
        toggleThemeAction={toggleTheme}
      />
      <NotificationWatcher projectId={projectId} />
    </AppProvider>
  );
}
