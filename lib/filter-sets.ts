import {
  writeFiltersToSearchParams,
  type Filters,
} from "./filters";

/** JSON-serializable Board/List filter state, including the archived toggle. */
export type FilterSetSnapshot = {
  status: string[];
  type: string[];
  priority: number[];
  origin: string[];
  labels: string[];
  assignee: string[];
  epic: string[];
  search: string;
  archived: boolean;
};

/** Snapshot Filters + archived for persistence. Empty facets are valid. */
export function serialize(
  filters: Filters,
  showArchived: boolean,
): FilterSetSnapshot {
  return {
    status: [...filters.status],
    type: [...filters.type],
    priority: [...filters.priority],
    origin: [...filters.origin],
    labels: [...filters.labels],
    assignee: [...filters.assignee],
    epic: [...filters.epic],
    search: filters.search,
    archived: showArchived,
  };
}

/** Write snapshot onto URL params using the same keys FilterBar already uses. */
export function apply(
  params: URLSearchParams,
  snapshot: FilterSetSnapshot,
): void {
  writeFiltersToSearchParams(params, {
    status: snapshot.status,
    type: snapshot.type,
    priority: snapshot.priority,
    origin: snapshot.origin,
    labels: snapshot.labels,
    assignee: snapshot.assignee,
    epic: snapshot.epic,
    search: snapshot.search,
  });
  if (snapshot.archived) params.set("archived", "1");
  else params.delete("archived");
}

function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** True when every persisted facet matches — used for the active checkmark. */
export function equals(a: FilterSetSnapshot, b: FilterSetSnapshot): boolean {
  return (
    sameList(a.status, b.status) &&
    sameList(a.type, b.type) &&
    sameList(a.priority, b.priority) &&
    sameList(a.origin, b.origin) &&
    sameList(a.labels, b.labels) &&
    sameList(a.assignee, b.assignee) &&
    sameList(a.epic, b.epic) &&
    a.search === b.search &&
    a.archived === b.archived
  );
}
