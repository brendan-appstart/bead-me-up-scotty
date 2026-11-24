import type { ActivityItem } from "./api-client";
import type { Bead } from "./schema";

/**
 * Activity view filters: the Agents row and the Pipeline row above the feed.
 * Each card is a toggle; selected actors OR together, selected stages OR
 * together, and the two groups AND. State lives in repeatable URL params that
 * the Board/List filters (lib/filters.ts FILTER_PARAMS) never read.
 *
 * Pure and type-only imports, so `node scripts/test-activity-filters.mjs` can
 * load it with native TypeScript. Column membership is passed in (`columnOf`)
 * rather than imported, so the view decides which column model applies.
 */

export const ACTIVITY_PARAMS = { actor: "actor", stage: "stage" } as const;

export interface ActivityFilters {
  actors: string[];
  stages: string[];
}

export const emptyActivityFilters: ActivityFilters = { actors: [], stages: [] };

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/** Read the filters from the URL; unknown stages are dropped. */
export function activityFiltersFromParams(
  sp: Pick<URLSearchParams, "getAll">,
  stageIds: readonly string[],
): ActivityFilters {
  return {
    actors: uniq(sp.getAll(ACTIVITY_PARAMS.actor).filter(Boolean)),
    stages: uniq(sp.getAll(ACTIVITY_PARAMS.stage).filter((s) => stageIds.includes(s))),
  };
}

/** Write the filters into `params`, leaving every other param alone. */
export function writeActivityFilters(params: URLSearchParams, f: ActivityFilters): void {
  params.delete(ACTIVITY_PARAMS.actor);
  params.delete(ACTIVITY_PARAMS.stage);
  for (const a of f.actors) params.append(ACTIVITY_PARAMS.actor, a);
  for (const s of f.stages) params.append(ACTIVITY_PARAMS.stage, s);
}

export function hasActivityFilters(f: ActivityFilters): boolean {
  return f.actors.length > 0 || f.stages.length > 0;
}

/**
 * Keep the events that match. A stage filter tests the bead's *current* column;
 * an event whose bead no longer exists never matches a stage filter.
 */
export function filterActivity(
  items: ActivityItem[],
  f: ActivityFilters,
  stageOfIssue: (issueId: string) => string | null,
): ActivityItem[] {
  if (!hasActivityFilters(f)) return items;
  return items.filter((it) => {
    if (f.actors.length > 0 && !f.actors.includes(it.actor)) return false;
    if (f.stages.length > 0) {
      const stage = stageOfIssue(it.issueId);
      if (!stage || !f.stages.includes(stage)) return false;
    }
    return true;
  });
}

export interface AgentSummary {
  actor: string;
  origin: ActivityItem["origin"];
  /** The actor's most recent event. */
  last: ActivityItem;
  events: number;
}

/** One entry per actor, most recently active first. */
export function summarizeAgents(items: ActivityItem[]): AgentSummary[] {
  const byActor = new Map<string, AgentSummary>();
  for (const it of items) {
    const cur = byActor.get(it.actor);
    if (!cur) {
      byActor.set(it.actor, { actor: it.actor, origin: it.origin, last: it, events: 1 });
      continue;
    }
    cur.events += 1;
    if (Date.parse(it.at) > Date.parse(cur.last.at)) {
      cur.last = it;
      cur.origin = it.origin;
    }
  }
  return [...byActor.values()].sort(
    (a, b) => Date.parse(b.last.at) - Date.parse(a.last.at) || a.actor.localeCompare(b.actor),
  );
}

export type Freshness = "active" | "quiet" | "silent";

export const ACTIVE_MS = 5 * 60_000;
export const QUIET_MS = 30 * 60_000;

/** Active under 5 minutes, quiet up to 30, silent after. */
export function freshness(at: string, now: number): Freshness {
  const age = now - Date.parse(at);
  if (!(age < QUIET_MS)) return "silent";
  return age < ACTIVE_MS ? "active" : "quiet";
}

/** Archived beads are hidden from the Pipeline, so they never match a stage either. */
export function isArchived(b: Pick<Bead, "labels">): boolean {
  return (b.labels ?? []).includes("archived");
}

export interface TypeCount {
  type: string;
  count: number;
}

export interface StageSummary {
  id: string;
  /** Non-archived beads in this stage, epics included. */
  count: number;
  /** Count per bead type, most common first, epics always last. */
  types: TypeCount[];
  /** Up to `maxIds` bead ids, most recently updated first. */
  ids: string[];
  more: number;
}

const updatedAt = (b: Bead) => Date.parse(b.updated_at || b.created_at || "") || 0;

function typeCounts(beads: Bead[]): TypeCount[] {
  const counts = new Map<string, number>();
  for (const b of beads) {
    const type = b.issue_type || "task";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort(
      (a, b) =>
        Number(a.type === "epic") - Number(b.type === "epic") ||
        b.count - a.count ||
        a.type.localeCompare(b.type),
    );
}

/** Per-stage counts over every non-archived bead, epics included. */
export function summarizePipeline(
  beads: Bead[],
  stageIds: readonly string[],
  stageOf: (b: Bead) => string | null,
  maxIds = 4,
): StageSummary[] {
  const groups = new Map<string, Bead[]>(stageIds.map((id) => [id, []]));
  for (const b of beads) {
    if (isArchived(b)) continue;
    const stage = stageOf(b);
    if (stage) groups.get(stage)?.push(b);
  }
  return stageIds.map((id) => {
    const all = [...(groups.get(id) ?? [])].sort((a, b) => updatedAt(b) - updatedAt(a));
    const ids = all.slice(0, maxIds).map((b) => b.id);
    return { id, count: all.length, types: typeCounts(all), ids, more: all.length - ids.length };
  });
}

/** "1 task", "2 bugs", "3 stories". */
export function pluralType(type: string, count: number): string {
  if (count === 1) return `${count} ${type}`;
  const plural = /[^aeiou]y$/.test(type) ? `${type.slice(0, -1)}ies` : `${type}s`;
  return `${count} ${plural}`;
}

/**
 * The card's one-line breakdown: up to `maxParts` non-epic types, the rest
 * folded into "N other", then epics. "9 tasks · 2 bugs · 1 other · 2 epics".
 */
export function typeBreakdown(types: TypeCount[], maxParts = 2): string {
  const epics = types.find((t) => t.type === "epic");
  const rest = types.filter((t) => t.type !== "epic");
  const shown = rest.length > maxParts + 1 ? rest.slice(0, maxParts) : rest;
  const other = rest.slice(shown.length).reduce((n, t) => n + t.count, 0);
  return [
    ...shown.map((t) => pluralType(t.type, t.count)),
    other > 0 ? `${other} other` : "",
    epics ? pluralType("epic", epics.count) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
