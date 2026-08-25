import type { Bead } from "./schema";
import { beadOrigin } from "./attribution";
import { parentOf } from "./beads-view";

/**
 * Shared bead filter model used by both the Board and List views. Every facet is
 * multi-select; an empty array means "no constraint" (show all). `search` matches
 * id / title / assignee / labels / description / notes.
 */
export interface Filters {
  status: string[];
  type: string[];
  priority: number[];
  origin: string[];
  labels: string[];
  assignee: string[];
  epic: string[];
  search: string;
}

export const emptyFilters: Filters = {
  status: [],
  type: [],
  priority: [],
  origin: [],
  labels: [],
  assignee: [],
  epic: [],
  search: "",
};

const FILTER_PARAMS = [
  "status",
  "type",
  "priority",
  "origin",
  "label",
  "assignee",
  "epic",
  "q",
] as const;

type SearchParamsReader = Pick<URLSearchParams, "get" | "getAll">;

function distinctValues(params: SearchParamsReader, name: string): string[] {
  return [...new Set(params.getAll(name).filter(Boolean))];
}

/** Parse the shared Board/List filters from bookmarkable query parameters. */
export function filtersFromSearchParams(params: SearchParamsReader): Filters {
  return {
    status: distinctValues(params, "status"),
    type: distinctValues(params, "type"),
    priority: distinctValues(params, "priority")
      .map(Number)
      .filter(
        (priority) =>
          Number.isInteger(priority) && priority >= 0 && priority <= 4,
      ),
    origin: distinctValues(params, "origin"),
    labels: distinctValues(params, "label"),
    assignee: distinctValues(params, "assignee"),
    epic: distinctValues(params, "epic"),
    search: params.get("q") ?? "",
  };
}

/** Replace only filter-related parameters, preserving view and issue state. */
export function writeFiltersToSearchParams(
  params: URLSearchParams,
  filters: Filters,
): void {
  for (const name of FILTER_PARAMS) params.delete(name);
  for (const status of filters.status) params.append("status", status);
  for (const type of filters.type) params.append("type", type);
  for (const priority of filters.priority)
    params.append("priority", String(priority));
  for (const origin of filters.origin) params.append("origin", origin);
  for (const label of filters.labels) params.append("label", label);
  for (const assignee of filters.assignee) params.append("assignee", assignee);
  for (const epic of filters.epic) params.append("epic", epic);
  if (filters.search) params.set("q", filters.search);
}

/**
 * Sentinel facet value for beads with no assignee, so "Unassigned" is
 * selectable alongside real assignees in the same multi-select.
 */
export const UNASSIGNED = "__unassigned__";

/** A bead's assignee normalized to a facet value (empty/blank → UNASSIGNED). */
export function beadAssignee(b: Bead): string {
  return b.assignee?.trim() || UNASSIGNED;
}

/**
 * The distinct assignees in use across a bead set, sorted, as filter options —
 * with "Unassigned" first when any bead lacks one. Callers pass ALL beads (not
 * the filtered set), same as labelOptionsFrom.
 */
export function assigneeOptionsFrom(beads: Bead[]): { value: string; label: string }[] {
  const s = new Set<string>();
  let hasUnassigned = false;
  for (const b of beads) {
    const a = beadAssignee(b);
    if (a === UNASSIGNED) hasUnassigned = true;
    else s.add(a);
  }
  const opts = [...s].sort().map((a) => ({ value: a, label: a }));
  return hasUnassigned ? [{ value: UNASSIGNED, label: "Unassigned" }, ...opts] : opts;
}

/**
 * `archived` is state, not a tag — it has its own dedicated toggle in the
 * FilterBar and the views hide on it — so it never appears as a label facet
 * option.
 */
export const ARCHIVED_LABEL = "archived";

/**
 * The distinct labels in use across a bead set, sorted, as filter options.
 * Callers pass ALL beads (not the filtered set) so selecting one label doesn't
 * make the other options vanish from the dropdown.
 */
export function labelOptionsFrom(beads: Bead[]): { value: string; label: string }[] {
  const s = new Set<string>();
  for (const b of beads) for (const l of b.labels ?? []) if (l !== ARCHIVED_LABEL) s.add(l);
  return [...s].sort().map((l) => ({ value: l, label: l }));
}

/**
 * Epics in a bead set, sorted by title, as filter options. Callers pass ALL
 * beads (not the filtered set) so selecting one epic doesn't hide the rest.
 */
export function epicOptionsFrom(beads: Bead[]): { value: string; label: string }[] {
  return beads
    .filter((b) => b.issue_type === "epic")
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    .map((b) => ({ value: b.id, label: b.title || b.id }));
}

/** Count of active facet selections (excludes free-text search). */
export function activeFilterCount(f: Filters): number {
  return (
    f.status.length +
    f.type.length +
    f.priority.length +
    f.origin.length +
    f.labels.length +
    f.assignee.length +
    f.epic.length
  );
}

export function matchesFilters(
  b: Bead,
  f: Filters,
  humanAllowlist: string[],
  index: Map<string, Bead>,
): boolean {
  if (f.status.length && !f.status.includes(b.status)) return false;
  if (f.type.length && !f.type.includes(b.issue_type)) return false;
  if (f.priority.length && !f.priority.includes(b.priority)) return false;
  if (f.origin.length && !f.origin.includes(beadOrigin(b, humanAllowlist))) return false;
  if (f.assignee.length && !f.assignee.includes(beadAssignee(b))) return false;
  // OR within the facet, like every other facet above; AND across facets.
  if (f.labels.length && !f.labels.some((l) => (b.labels ?? []).includes(l))) return false;
  if (f.epic.length) {
    const parent = parentOf(b, index);
    if (!parent || !f.epic.includes(parent.id)) return false;
  }
  const q = f.search.trim().toLowerCase();
  if (
    q &&
    !(
      b.title.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.assignee ?? "").toLowerCase().includes(q) ||
      (b.labels ?? []).some((l) => l.toLowerCase().includes(q)) ||
      (b.description ?? "").toLowerCase().includes(q) ||
      (b.notes ?? "").toLowerCase().includes(q)
    )
  )
    return false;
  return true;
}

/** Immutable toggle of a value in a string array. */
export function toggleStr(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** Immutable toggle of a value in a number array. */
export function toggleNum(arr: number[], v: number): number[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}
