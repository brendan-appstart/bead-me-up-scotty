"use client";
import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { THEMES } from "@/lib/themes";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/icons";
import { useApp, type View } from "@/components/app-context";
import { useProjects } from "@/hooks/use-projects";
import { useSetStatus, useUpdateBead } from "@/hooks/use-beads";
import { BEAD_STATUSES, type Bead } from "@/lib/schema";
import { statusLabel, catColor, typeLabel } from "@/lib/beads-view";
import { QuickCapture } from "@/components/quick-capture";
import { PourDialog } from "@/components/pour-dialog";
import { listedFilterSets } from "@/components/filter-set-switcher";
import { useFilterSets } from "@/hooks/use-filter-sets";
import { useFormulas, useFormula } from "@/hooks/use-formulas";
import { useUrlState } from "@/hooks/use-url-state";
import { apply } from "@/lib/filter-sets";
import type { PourResult } from "@/lib/formulas";

export const PALETTE_VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "focus", label: "Focus", icon: "focus" },
  { key: "todos", label: "Todos", icon: "task" },
  { key: "board", label: "Board", icon: "board" },
  { key: "list", label: "List", icon: "list" },
  { key: "epics", label: "Epics", icon: "target" },
  { key: "workflows", label: "Workflows", icon: "feature" },
  { key: "graph", label: "Graph", icon: "graph" },
  { key: "insights", label: "Insights", icon: "milestone" },
  { key: "activity", label: "Activity", icon: "comment" },
  { key: "needsyou", label: "Needs You", icon: "user" },
  { key: "achievements", label: "Achievements", icon: "feature" },
  { key: "publish", label: "Publish", icon: "rocket" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export function paletteViewsForProject(meta?: { gamification?: boolean }) {
  return PALETTE_VIEWS.filter((v) => v.key !== "achievements" || meta?.gamification);
}

export const PALETTE_ACTIONS = {
  newTodo: "new todo quick capture",
  createBead: "create bead new",
  toggleTheme: "toggle theme dark light",
  changeTheme: "change theme palette dracula nord",
  switchProject: "switch project",
} as const;

export function paletteFilterSetValue(name: string) {
  return `filter set apply ${name}`;
}

export function palettePourValue(name: string) {
  return `pour formula ${name}`;
}

const PRIORITIES = ["Critical", "High", "Medium", "Low", "Backlog"];
const RECENTS_KEY = "bmus.palette.recentBeads";

// Recents are ephemeral UI state, so they live in localStorage (client-side)
// rather than the server-side app config.
function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 6) : [];
  } catch {
    return [];
  }
}
function pushRecent(id: string) {
  if (typeof window === "undefined") return;
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(0, 6);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

type Page = "root" | "bead" | "status" | "priority" | "projects" | "theme";

export function CommandPalette({
  open,
  onOpenChange,
  onView,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onView: (v: View) => void;
}) {
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [pourOpen, setPourOpen] = React.useState(false);
  const [pourName, setPourName] = React.useState<string | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-4rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-[var(--surface)] p-0 shadow-[var(--shadow-lg)] sm:max-w-[640px]"
          style={{ width: 640, maxWidth: "94vw" }}
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          {/* Mounted fresh on each open, so page/search state resets naturally. */}
          <PaletteBody
            onView={onView}
            close={() => onOpenChange(false)}
            onNewTodo={() => setCaptureOpen(true)}
            onPourFormula={(name) => {
              setPourName(name);
              setPourOpen(true);
            }}
          />
        </DialogContent>
      </Dialog>
      <QuickCapture open={captureOpen} onOpenChange={setCaptureOpen} />
      <PourBridge
        open={pourOpen}
        formulaName={pourName}
        onOpenChange={(next) => {
          setPourOpen(next);
          if (!next) setPourName(null);
        }}
      />
    </>
  );
}

function PourBridge({
  open,
  formulaName,
  onOpenChange,
}: {
  open: boolean;
  formulaName: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { projectId, index, openDetail, openEpic } = useApp();
  const detail = useFormula(projectId, open ? formulaName : null);
  const formula = detail.data ?? null;

  const onPoured = (result: PourResult) => {
    onOpenChange(false);
    const id = result.new_epic_id;
    if (!id) return;
    const bead = index.get(id);
    if (!bead || bead.issue_type === "epic") openEpic(id);
    else openDetail(id);
  };

  return (
    <PourDialog
      open={open && !!formula}
      formula={formula}
      onOpenChange={onOpenChange}
      onPoured={onPoured}
    />
  );
}

function PaletteBody({
  onView,
  close,
  onNewTodo,
  onPourFormula,
}: {
  onView: (v: View) => void;
  close: () => void;
  onNewTodo: () => void;
  onPourFormula: (name: string) => void;
}) {
  const { beads, index, openDetail, openCreate, projectId, meta } = useApp();
  const router = useRouter();
  const { mode, setTheme, toggle } = useTheme();
  const setStatus = useSetStatus();
  const update = useUpdateBead();
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];
  const { data: filterSetsData } = useFilterSets(projectId);
  const filterSets = listedFilterSets(projectId, filterSetsData?.sets ?? []);
  const { data: formulasData } = useFormulas(projectId);
  const formulas = formulasData?.formulas ?? [];
  const { updateUrl } = useUrlState();
  const views = paletteViewsForProject(meta);

  const [page, setPage] = React.useState<Page>("root");
  const [search, setSearch] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeBead = activeId ? index.get(activeId) : undefined;

  const run = (fn: () => void) => {
    fn();
    close();
  };
  const toBead = (id: string) => {
    setActiveId(id);
    setSearch("");
    setPage("bead");
  };
  const goBack = () => {
    setSearch("");
    setPage(page === "status" || page === "priority" ? "bead" : "root");
  };

  const recents = React.useMemo(
    () => loadRecents().map((id) => index.get(id)).filter(Boolean) as Bead[],
    [index],
  );

  return (
    <Command
      label="Command palette"
      className="flex min-h-0 w-full max-h-[min(680px,calc(100dvh-4rem))] flex-col"
      onKeyDown={(e) => {
        // Backspace on an empty query steps back out of a sub-page.
        if (e.key === "Backspace" && search === "" && page !== "root") {
          e.preventDefault();
          goBack();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        {page !== "root" ? (
          <button
            onClick={goBack}
            title="Back"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <Icon name="chevron" size={16} className="rotate-90" />
          </button>
        ) : (
          <Icon name="search" size={16} className="ml-1 text-[var(--text-3)]" />
        )}
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={
            page === "bead"
              ? `Action for ${activeBead?.id ?? ""}…`
              : page === "status"
                ? "Set status…"
                : page === "priority"
                  ? "Set priority…"
                  : page === "projects"
                    ? "Switch project…"
                    : page === "theme"
                      ? "Pick a theme…"
                      : "Search beads or run a command…"
          }
          className="h-12 flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
        />
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2 pb-4">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-[var(--text-3)]">
          No results.
        </Command.Empty>

        {page === "root" && (
          <>
            <Command.Group heading="Actions">
              <Item
                icon="task"
                value={PALETTE_ACTIONS.newTodo}
                onSelect={() => run(onNewTodo)}
              >
                New todo…
              </Item>
              <Item
                icon="plus"
                value={PALETTE_ACTIONS.createBead}
                onSelect={() => run(() => openCreate())}
              >
                Create bead…
              </Item>
              <Item
                icon={mode === "dark" ? "sun" : "moon"}
                value={PALETTE_ACTIONS.toggleTheme}
                onSelect={() => run(() => toggle())}
              >
                Toggle theme · {mode === "dark" ? "light" : "dark"}
              </Item>
              <Item
                icon="settings"
                value={PALETTE_ACTIONS.changeTheme}
                onSelect={() => { setSearch(""); setPage("theme"); }}
              >
                Change theme…
              </Item>
              <Item
                icon="logo"
                value={PALETTE_ACTIONS.switchProject}
                onSelect={() => { setSearch(""); setPage("projects"); }}
              >
                Switch project…
              </Item>
            </Command.Group>

            <Command.Group heading="Go to">
              {views.map((v) => (
                <Item key={v.key} icon={v.icon} value={`go ${v.label}`} onSelect={() => run(() => onView(v.key))}>
                  {v.label}
                </Item>
              ))}
            </Command.Group>

            {filterSets.length > 0 && (
              <Command.Group heading="Filter sets">
                {filterSets.map((set) => (
                  <Item
                    key={set.id}
                    icon="list"
                    value={paletteFilterSetValue(set.name)}
                    onSelect={() =>
                      run(() => updateUrl((params) => apply(params, set.snapshot)))
                    }
                  >
                    Apply filter · {set.name}
                  </Item>
                ))}
              </Command.Group>
            )}

            {formulas.length > 0 && (
              <Command.Group heading="Pour formula">
                {formulas.map((entry) => (
                  <Item
                    key={entry.name}
                    icon="feature"
                    value={palettePourValue(entry.name)}
                    onSelect={() =>
                      run(() => {
                        onView("workflows");
                        onPourFormula(entry.name);
                      })
                    }
                  >
                    Pour · {entry.name}
                  </Item>
                ))}
              </Command.Group>
            )}

            {recents.length > 0 && search === "" && (
              <Command.Group heading="Recent beads">
                {recents.map((b) => (
                  <BeadItem key={`r-${b.id}`} bead={b} valuePrefix="recent " onSelect={() => toBead(b.id)} />
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Beads">
              {beads.slice(0, 300).map((b) => (
                <BeadItem key={b.id} bead={b} onSelect={() => toBead(b.id)} />
              ))}
            </Command.Group>
          </>
        )}

        {page === "bead" && activeBead && (
          <Command.Group heading={`${activeBead.id} · ${activeBead.title.slice(0, 52)}`}>
            <Item
              icon="search"
              value="open details view"
              onSelect={() => { pushRecent(activeBead.id); run(() => openDetail(activeBead.id)); }}
            >
              Open details
            </Item>
            <Item
              icon="user"
              value="claim in progress"
              onSelect={() => run(() => setStatus.mutate({ id: activeBead.id, status: "in_progress" }))}
            >
              Claim · set In Progress
            </Item>
            <Item
              icon="check"
              value="close done"
              onSelect={() => run(() => setStatus.mutate({ id: activeBead.id, status: "closed" }))}
            >
              Close
            </Item>
            <Item icon="chevron" value="set status" onSelect={() => { setSearch(""); setPage("status"); }}>
              Set status…
            </Item>
            <Item icon="chevron" value="set priority" onSelect={() => { setSearch(""); setPage("priority"); }}>
              Set priority…
            </Item>
          </Command.Group>
        )}

        {page === "status" && activeBead && (
          <Command.Group heading="Set status">
            {BEAD_STATUSES.map((s) => (
              <Item
                key={s}
                dotColor={catColor(s)}
                value={`status ${statusLabel(s)}`}
                onSelect={() => run(() => setStatus.mutate({ id: activeBead.id, status: s }))}
              >
                {statusLabel(s)}
              </Item>
            ))}
          </Command.Group>
        )}

        {page === "priority" && activeBead && (
          <Command.Group heading="Set priority">
            {[0, 1, 2, 3, 4].map((p) => (
              <Item
                key={p}
                value={`priority ${p} ${PRIORITIES[p]}`}
                onSelect={() => run(() => update.mutate({ id: activeBead.id, patch: { priority: p } }))}
              >
                P{p} · {PRIORITIES[p]}
              </Item>
            ))}
          </Command.Group>
        )}

        {page === "projects" && (
          <Command.Group heading="Switch project">
            <Item icon="logo" value="project demo" onSelect={() => run(() => router.push("/p/demo"))}>
              Demo{projectId === "demo" ? " · current" : ""}
            </Item>
            {projects
              .filter((p) => p.id !== "demo")
              .map((p) => (
                <Item
                  key={p.id}
                  icon="logo"
                  value={`project ${p.name} ${p.id}`}
                  onSelect={() => run(() => router.push(`/p/${p.id}`))}
                >
                  {p.name}
                  {p.id === projectId ? " · current" : ""}
                </Item>
              ))}
          </Command.Group>
        )}

        {page === "theme" && (
          <Command.Group heading="Theme">
            {THEMES.map((t) => (
              <Item
                key={t.id}
                dotColor={t.swatch[2]}
                value={`theme ${t.name} ${t.id}`}
                onSelect={() => run(() => setTheme(t.id))}
              >
                {t.name}
              </Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}

function Item({
  icon,
  dotColor,
  value,
  children,
  onSelect,
}: {
  icon?: string;
  dotColor?: string;
  value?: string;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-[10px] rounded-[8px] px-3 py-[7px] text-[13.5px] text-[var(--text)] data-[selected=true]:bg-[var(--surface-2)]"
    >
      {dotColor ? (
        <span className="h-[8px] w-[8px] flex-shrink-0 rounded-full" style={{ background: dotColor }} />
      ) : icon ? (
        <Icon name={icon} size={15} className="flex-shrink-0 text-[var(--text-2)]" />
      ) : (
        <span className="w-[15px] flex-shrink-0" />
      )}
      <span className="flex-1 truncate">{children}</span>
    </Command.Item>
  );
}

function BeadItem({
  bead,
  onSelect,
  valuePrefix = "",
}: {
  bead: Bead;
  onSelect: () => void;
  valuePrefix?: string;
}) {
  return (
    <Command.Item
      value={`${valuePrefix}${bead.id} ${bead.title}`}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-[10px] rounded-[8px] px-3 py-[7px] text-[13.5px] data-[selected=true]:bg-[var(--surface-2)]"
    >
      <span
        className="h-[8px] w-[8px] flex-shrink-0 rounded-full"
        style={{ background: catColor(bead.status) }}
        title={statusLabel(bead.status)}
      />
      <span className="flex-shrink-0 font-mono text-[11px] text-[var(--text-3)]">{bead.id}</span>
      <span className="flex-1 truncate text-[var(--text)]">{bead.title}</span>
      <span className="flex-shrink-0 text-[10px] uppercase tracking-[.03em] text-[var(--text-3)]">
        {typeLabel(bead.issue_type)}
      </span>
    </Command.Item>
  );
}
