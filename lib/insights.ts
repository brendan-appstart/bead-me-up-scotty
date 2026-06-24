import "server-only";
import type { Bead } from "./schema";
import { originOf, type Origin } from "./attribution";
import type { RawInteraction } from "./interactions";
import { BOARD_COLUMNS, colOf } from "./board-columns";
import { makeIndex } from "./beads-view";

/**
 * Flow metrics for the Insights dashboard, derived from the bead list plus the
 * interaction log (status transitions). Everything is computed server-side so
 * the client only renders. Reuses lib/interactions readInteractions output.
 */

const DAY = 86_400_000;

export interface DayPoint {
  date: string;
  human: number;
  agent: number;
  total: number;
}
export interface CreatedClosedPoint {
  date: string;
  created: number;
  closed: number;
}
export interface CycleStat {
  /** hours */
  p50: number;
  p90: number;
  count: number;
}
export interface AgingItem {
  id: string;
  title: string;
  days: number;
  origin: Origin;
}
export interface ColumnCount {
  id: string;
  name: string;
  color: string;
  count: number;
}
export interface InsightsData {
  days: number;
  throughput: DayPoint[];
  createdClosed: CreatedClosedPoint[];
  cycle: { overall: CycleStat; human: CycleStat; agent: CycleStat };
  aging: AgingItem[];
  columns: ColumnCount[];
  hasEvents: boolean;
}

const ms = (iso?: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 10) / 10;
}
function cycleStat(durations: number[]): CycleStat {
  const s = [...durations].sort((a, b) => a - b);
  return { p50: percentile(s, 50), p90: percentile(s, 90), count: s.length };
}

export function computeInsights(
  beads: Bead[],
  events: RawInteraction[],
  humanAllowlist: string[],
  days: number,
  now: number,
): InsightsData {
  const start = now - days * DAY;
  const index = makeIndex(beads);

  // Day buckets across the range (oldest → newest).
  const buckets: string[] = [];
  for (let t = start; t <= now; t += DAY) buckets.push(dayKey(t));
  const tp = new Map(buckets.map((d) => [d, { date: d, human: 0, agent: 0, total: 0 }]));
  const cc = new Map(buckets.map((d) => [d, { date: d, created: 0, closed: 0 }]));

  // From the interaction log: first in_progress per issue + close events.
  const firstInProgress = new Map<string, number>();
  const closeEvents: { issueId: string; at: number; actor?: string }[] = [];
  for (const ev of events) {
    if (ev.kind !== "field_change" || ev.extra?.field !== "status" || !ev.issue_id) continue;
    const at = ms(ev.created_at);
    if (at === null) continue;
    if (ev.extra.new_value === "in_progress") {
      const prev = firstInProgress.get(ev.issue_id);
      if (prev === undefined || at < prev) firstInProgress.set(ev.issue_id, at);
    } else if (ev.extra.new_value === "closed") {
      closeEvents.push({ issueId: ev.issue_id, at, actor: ev.actor });
    }
  }
  const hasEvents = closeEvents.length > 0 || firstInProgress.size > 0;

  // Closes: from the log when present, else synthesized from bead.closed_at.
  type Close = { bead: Bead; at: number; origin: Origin };
  const closes: Close[] = [];
  if (closeEvents.length > 0) {
    for (const ce of closeEvents) {
      const bead = index.get(ce.issueId);
      if (!bead) continue;
      closes.push({ bead, at: ce.at, origin: originOf(ce.actor, humanAllowlist) });
    }
  } else {
    for (const b of beads) {
      const at = ms(b.closed_at);
      if (at === null) continue;
      closes.push({ bead: b, at, origin: originOf(b.assignee || b.created_by, humanAllowlist) });
    }
  }

  // Throughput + closed counts.
  for (const c of closes) {
    if (c.at < start || c.at > now) continue;
    const k = dayKey(c.at);
    const point = tp.get(k);
    if (point) {
      point.total++;
      if (c.origin === "human") point.human++;
      else point.agent++;
    }
    const ccp = cc.get(k);
    if (ccp) ccp.closed++;
  }
  // Created counts.
  for (const b of beads) {
    const at = ms(b.created_at);
    if (at === null || at < start || at > now) continue;
    const ccp = cc.get(dayKey(at));
    if (ccp) ccp.created++;
  }

  // Cycle time (in_progress → close), falling back to created → close.
  const dur = { all: [] as number[], human: [] as number[], agent: [] as number[] };
  for (const c of closes) {
    if (c.at < start || c.at > now) continue;
    const startT =
      firstInProgress.get(c.bead.id) ?? ms(c.bead.started_at) ?? ms(c.bead.created_at);
    if (startT === null || c.at <= startT) continue;
    const hours = (c.at - startT) / 3_600_000;
    dur.all.push(hours);
    (c.origin === "human" ? dur.human : dur.agent).push(hours);
  }

  // Aging WIP: still in progress, time since work started.
  const aging: AgingItem[] = [];
  for (const b of beads) {
    if (b.status !== "in_progress" && b.status !== "hooked") continue;
    const startT =
      firstInProgress.get(b.id) ?? ms(b.started_at) ?? ms(b.updated_at) ?? ms(b.created_at);
    if (startT === null) continue;
    aging.push({
      id: b.id,
      title: b.title,
      days: Math.round(((now - startT) / DAY) * 10) / 10,
      origin: originOf(b.assignee || b.created_by, humanAllowlist),
    });
  }
  aging.sort((a, b) => b.days - a.days);

  // Column counts (current snapshot) for WIP limits.
  const counts = new Map(BOARD_COLUMNS.map((c) => [c.id, 0]));
  for (const b of beads) {
    const col = colOf(b, index);
    if (col) counts.set(col, (counts.get(col) ?? 0) + 1);
  }
  const columns = BOARD_COLUMNS.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    count: counts.get(c.id) ?? 0,
  }));

  return {
    days,
    throughput: buckets.map((d) => tp.get(d)!),
    createdClosed: buckets.map((d) => cc.get(d)!),
    cycle: { overall: cycleStat(dur.all), human: cycleStat(dur.human), agent: cycleStat(dur.agent) },
    aging: aging.slice(0, 12),
    columns,
    hasEvents,
  };
}
