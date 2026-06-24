import "server-only";
import { type Bead, BLOCKING_DEP_TYPES } from "./schema";
import { originOf, type Origin } from "./attribution";
import type { RawInteraction } from "./interactions";

/**
 * Gamification stats engine. Everything is DERIVED from bd history — closes
 * (from the interaction log, or bead.closed_at as a fallback) weighted by
 * priority and by how many beads each close unblocked. No state is stored.
 * Produces XP/levels, daily streaks, badges, and a per-actor leaderboard.
 */

const PRIORITY_XP = [8, 5, 3, 2, 1]; // P0 (critical) → P4 (backlog)
const UNBLOCK_BONUS = 2;
const DAY = 86_400_000;

export interface LevelInfo {
  level: number;
  intoLevel: number;
  span: number;
  progress: number; // 0..1 toward next level
}
export interface ActorStat {
  actor: string;
  origin: Origin;
  xp: number;
  closed: number;
  currentStreak: number;
  longestStreak: number;
}
export interface Badge {
  key: string;
  label: string;
  description: string;
  earned: boolean;
}
export interface YouSummary extends ActorStat, LevelInfo {
  badges: Badge[];
}
export interface GamificationData {
  actors: ActorStat[]; // sorted desc by xp
  totalXp: number;
  totalClosed: number;
  you: YouSummary;
}

/** Cumulative XP to reach level L: 50·L·(L+1) → 0,100,300,600,1000,… */
const needFor = (L: number) => 50 * L * (L + 1);
export function levelInfo(xp: number): LevelInfo {
  let level = 0;
  while (xp >= needFor(level + 1)) level++;
  const base = needFor(level);
  const span = needFor(level + 1) - base;
  return { level, intoLevel: xp - base, span, progress: span > 0 ? (xp - base) / span : 0 };
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const shiftDay = (key: string, deltaDays: number) =>
  dayKey(Date.parse(key + "T00:00:00Z") + deltaDays * DAY);

function streaks(days: Set<string>, now: number): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = shiftDay(sorted[i - 1], 1) === sorted[i] ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // Current streak: walk back from today (or yesterday, if today isn't done yet).
  const today = dayKey(now);
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest };
}

interface Acc {
  xp: number;
  closed: number;
  days: Set<string>;
  unblocker: boolean;
  epicSlayer: boolean;
  maxPerDay: number;
}

export function computeGamification(
  beads: Bead[],
  events: RawInteraction[],
  humanAllowlist: string[],
  humanActor: string,
  now: number,
): GamificationData {
  const byId = new Map(beads.map((b) => [b.id, b]));

  // How many beads each bead was blocking (dependents waiting on it).
  const blocking = new Map<string, number>();
  for (const b of beads) {
    for (const d of b.dependencies ?? []) {
      if ((BLOCKING_DEP_TYPES as readonly string[]).includes(d.type)) {
        blocking.set(d.depends_on_id, (blocking.get(d.depends_on_id) ?? 0) + 1);
      }
    }
  }

  // Closes (with timestamps) from the interaction log, else bead.closed_at.
  const closeEvents = events.filter(
    (e) => e.kind === "field_change" && e.extra?.field === "status" && e.extra?.new_value === "closed" && e.issue_id,
  );
  const closes: { bead: Bead; actor?: string; at: number | null }[] = [];
  if (closeEvents.length > 0) {
    for (const e of closeEvents) {
      const bead = byId.get(e.issue_id!);
      if (bead) closes.push({ bead, actor: e.actor, at: e.created_at ? Date.parse(e.created_at) : null });
    }
  } else {
    for (const b of beads) {
      if (b.closed_at) closes.push({ bead: b, actor: b.assignee || b.created_by, at: Date.parse(b.closed_at) });
    }
  }

  const acc = new Map<string, Acc>();
  const dayCount = new Map<string, Map<string, number>>(); // actor → day → count
  for (const c of closes) {
    const actor = c.actor || "unknown";
    const pr = Math.min(4, Math.max(0, c.bead.priority ?? 2));
    const xp = PRIORITY_XP[pr] + (blocking.get(c.bead.id) ?? 0) * UNBLOCK_BONUS;
    const a = acc.get(actor) ?? { xp: 0, closed: 0, days: new Set<string>(), unblocker: false, epicSlayer: false, maxPerDay: 0 };
    a.xp += xp;
    a.closed += 1;
    if ((blocking.get(c.bead.id) ?? 0) > 0) a.unblocker = true;
    if (c.bead.issue_type === "epic") a.epicSlayer = true;
    if (c.at !== null && Number.isFinite(c.at)) {
      const k = dayKey(c.at);
      a.days.add(k);
      const dc = dayCount.get(actor) ?? new Map<string, number>();
      const n = (dc.get(k) ?? 0) + 1;
      dc.set(k, n);
      dayCount.set(actor, dc);
      if (n > a.maxPerDay) a.maxPerDay = n;
    }
    acc.set(actor, a);
  }

  const actors: ActorStat[] = [...acc.entries()]
    .map(([actor, a]) => {
      const s = streaks(a.days, now);
      return {
        actor,
        origin: originOf(actor, humanAllowlist),
        xp: a.xp,
        closed: a.closed,
        currentStreak: s.current,
        longestStreak: s.longest,
      };
    })
    .sort((x, y) => y.xp - x.xp);

  const totalXp = actors.reduce((s, a) => s + a.xp, 0);
  const totalClosed = actors.reduce((s, a) => s + a.closed, 0);

  const mineAcc = acc.get(humanActor);
  const mineStat: ActorStat = actors.find((a) => a.actor === humanActor) ?? {
    actor: humanActor,
    origin: originOf(humanActor, humanAllowlist),
    xp: 0,
    closed: 0,
    currentStreak: 0,
    longestStreak: 0,
  };
  const badges: Badge[] = [
    { key: "first", label: "First Blood", description: "Close your first bead", earned: mineStat.closed >= 1 },
    { key: "unblocker", label: "Unblocker", description: "Close a bead that was blocking others", earned: !!mineAcc?.unblocker },
    { key: "epic", label: "Epic Slayer", description: "Close an epic", earned: !!mineAcc?.epicSlayer },
    { key: "combo", label: "Combo", description: "Close 3+ beads in a single day", earned: (mineAcc?.maxPerDay ?? 0) >= 3 },
    { key: "onfire", label: "On Fire", description: "Keep a 3-day closing streak", earned: mineStat.currentStreak >= 3 },
  ];

  return {
    actors,
    totalXp,
    totalClosed,
    you: { ...mineStat, ...levelInfo(mineStat.xp), badges },
  };
}
