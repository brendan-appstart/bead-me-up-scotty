"use client";
import { Check, ListFilter, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SidebarSwitcher } from "@/components/sidebar-switcher";
import {
  useCreateFilterSet,
  useDeleteFilterSet,
  useFilterSets,
  useRenameFilterSet,
} from "@/hooks/use-filter-sets";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useUrlState } from "@/hooks/use-url-state";
import { emptyFilters } from "@/lib/filters";
import {
  apply,
  equals,
  serialize,
  type FilterSet,
  type FilterSetSnapshot,
} from "@/lib/filter-sets";

/** Canned demo presets shown until the project has saved sets of its own. */
export const DEMO_FILTER_SETS: FilterSet[] = [
  {
    id: "demo-open-tasks",
    name: "Open tasks",
    snapshot: serialize({ ...emptyFilters, status: ["open"], type: ["task"] }, false),
  },
  {
    id: "demo-in-progress",
    name: "In progress",
    snapshot: serialize({ ...emptyFilters, status: ["in_progress"] }, false),
  },
  {
    id: "demo-archived",
    name: "Archived",
    snapshot: serialize(emptyFilters, true),
  },
];

/** Demo lists canned presets when the API has none; real projects do not. */
export function listedFilterSets(projectId: string, apiSets: FilterSet[]): FilterSet[] {
  if (projectId === "demo" && apiSets.length === 0) return DEMO_FILTER_SETS;
  return apiSets;
}

/** The saved set whose snapshot matches the current URL filters, if any. */
export function matchingFilterSet(
  sets: FilterSet[],
  snapshot: FilterSetSnapshot,
): FilterSet | undefined {
  return sets.find((set) => equals(set.snapshot, snapshot));
}

/** Trim a prompt result. Cancelled or blank names are rejected — including empty filters. */
export function promptedFilterSetName(input: string | null): string | null {
  const name = input?.trim() ?? "";
  return name.length > 0 ? name : null;
}

export function FilterSetSwitcher({ projectId }: { projectId: string }) {
  const { data } = useFilterSets(projectId);
  const create = useCreateFilterSet(projectId);
  const rename = useRenameFilterSet(projectId);
  const remove = useDeleteFilterSet(projectId);
  const { filters, showArchived } = useUrlFilters();
  const { updateUrl } = useUrlState();

  const apiSets = data?.sets ?? [];
  const sets = listedFilterSets(projectId, apiSets);
  const current = serialize(filters, showArchived);
  const active = matchingFilterSet(sets, current);
  const persistedIds = new Set(apiSets.map((set) => set.id));

  function applySet(snapshot: FilterSetSnapshot) {
    updateUrl((params) => apply(params, snapshot));
  }

  function saveCurrent() {
    const name = promptedFilterSetName(window.prompt("Name this filter set"));
    if (!name) return;
    const existing = sets.find((set) => set.name === name);
    if (existing && !window.confirm(`Overwrite filter set "${name}"?`)) return;
    create.mutate({ name, snapshot: current, overwrite: !!existing });
  }

  function renameSet(set: FilterSet) {
    const name = promptedFilterSetName(window.prompt("Rename filter set", set.name));
    if (!name || name === set.name) return;
    if (!persistedIds.has(set.id)) {
      create.mutate({ name, snapshot: set.snapshot });
      return;
    }
    rename.mutate({ id: set.id, name });
  }

  function deleteSet(set: FilterSet) {
    if (!window.confirm(`Delete filter set "${set.name}"?`)) return;
    remove.mutate({ id: set.id });
  }

  return (
    <SidebarSwitcher
      leading={
        <ListFilter size={14} className="flex-shrink-0 text-[var(--text-3)]" />
      }
      title={active?.name ?? "Filters"}
      subtitle="filter set"
      menuLabel="Filter sets"
    >
      {sets.length === 0 ? (
        <div className="px-1.5 py-1 text-xs text-muted-foreground">No saved sets</div>
      ) : (
        sets.map((set) => {
          const isActive = active?.id === set.id;
          return (
            <DropdownMenuItem key={set.id} onClick={() => applySet(set.snapshot)}>
              <span className="min-w-0 flex-1 truncate">{set.name}</span>
              {isActive ? <Check size={14} className="flex-shrink-0" /> : null}
            </DropdownMenuItem>
          );
        })
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={saveCurrent}>
        <Plus size={14} />
        <span>Save current…</span>
      </DropdownMenuItem>
      {active ? (
        <DropdownMenuItem onClick={() => renameSet(active)}>
          <Pencil size={14} />
          <span>Rename…</span>
        </DropdownMenuItem>
      ) : null}
      {active && persistedIds.has(active.id) ? (
        <DropdownMenuItem variant="destructive" onClick={() => deleteSet(active)}>
          <Trash2 size={14} />
          <span>Delete</span>
        </DropdownMenuItem>
      ) : null}
    </SidebarSwitcher>
  );
}
