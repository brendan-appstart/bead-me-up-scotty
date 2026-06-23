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
  search: string;
}

export const emptyFilters: Filters = {
  status: [],
  type: [],
  priority: [],
  origin: [],
  search: "",
};

/** Count of active facet selections (excludes free-text search). */
export function activeFilterCount(f: Filters): number {
  return f.status.length + f.type.length + f.priority.length + f.origin.length;
}

export function matchesFilters(b: Bead, f: Filters, humanAllowlist: string[]): boolean {
  if (f.status.length && !f.status.includes(b.status)) return false;
  if (f.type.length && !f.type.includes(b.issue_type)) return false;
  if (f.priority.length && !f.priority.includes(b.priority)) return false;
  if (f.origin.length && !f.origin.includes(beadOrigin(b, humanAllowlist))) return false;
  const q = f.search.trim().toLowerCase();
  if (
    q &&
    !(
      b.title.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.assignee ?? "").toLowerCase().includes(q)
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
