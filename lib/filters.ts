import type { Bead } from "./schema";
import { beadOrigin } from "./attribution";

/**
 * Shared bead filter model used by both the Board and List views. Every facet is
 * multi-select; an empty array means "no constraint" (show all). `search` matches
 * id / title / assignee.
 */
export interface Filters {
  status: string[];
  type: string[];
  priority: number[];
  origin: string[];
  labels: string[];
  assignee: string[];
  search: string;
}

export const emptyFilters: Filters = {
  status: [],
  type: [],
  priority: [],
  origin: [],
  labels: [],
  assignee: [],
  search: "",
};

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

/** Count of active facet selections (excludes free-text search). */
export function activeFilterCount(f: Filters): number {
  return (
    f.status.length +
    f.type.length +
    f.priority.length +
    f.origin.length +
    f.labels.length +
    f.assignee.length
  );
}

export function matchesFilters(b: Bead, f: Filters, humanAllowlist: string[]): boolean {
  if (f.status.length && !f.status.includes(b.status)) return false;
  if (f.type.length && !f.type.includes(b.issue_type)) return false;
  if (f.priority.length && !f.priority.includes(b.priority)) return false;
  if (f.origin.length && !f.origin.includes(beadOrigin(b, humanAllowlist))) return false;
  if (f.assignee.length && !f.assignee.includes(beadAssignee(b))) return false;
  // OR within the facet, like every other facet above; AND across facets.
  if (f.labels.length && !f.labels.some((l) => (b.labels ?? []).includes(l))) return false;
  const q = f.search.trim().toLowerCase();
  if (
    q &&
    !(
      b.title.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.assignee ?? "").toLowerCase().includes(q) ||
      (b.labels ?? []).some((l) => l.toLowerCase().includes(q))
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
