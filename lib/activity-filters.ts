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

export interface StageSummary {
  id: string;
  /** Non-archived beads in this stage, epics included. */
  count: number;
  /** Non-epic beads (tasks, bugs, features…). */
  tasks: number;
  epics: number;
  /** Up to `maxIds` bead ids, most recently updated first. */
  ids: string[];
  more: number;
}

const updatedAt = (b: Bead) => Date.parse(b.updated_at || b.created_at || "") || 0;

/** Per-stage counts over every non-archived bead, epics included. */
export function summarizePipeline(
  beads: Bead[],
  stageIds: readonly string[],
  stageOf: (b: Bead) => string | null,
  maxIds = 4,
): StageSummary[] {
  const groups = new Map<string, Bead[]>(stageIds.map((id) => [id, []]));
  for (const b of beads) {
    if ((b.labels ?? []).includes("archived")) continue;
    const stage = stageOf(b);
    if (stage) groups.get(stage)?.push(b);
  }
  return stageIds.map((id) => {
    const all = [...(groups.get(id) ?? [])].sort((a, b) => updatedAt(b) - updatedAt(a));
    const epics = all.filter((b) => b.issue_type === "epic").length;
    const ids = all.slice(0, maxIds).map((b) => b.id);
    return { id, count: all.length, tasks: all.length - epics, epics, ids, more: all.length - ids.length };
  });
}
