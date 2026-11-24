// Pure checks for lib/activity-filters.ts (Node 22.18+ native TypeScript).
//   node scripts/test-activity-filters.mjs
import assert from "node:assert/strict";
import {
  activityFiltersFromParams,
  writeActivityFilters,
  filterActivity,
  summarizeAgents,
  summarizePipeline,
  freshness,
  hasActivityFilters,
  isArchived,
  pluralType,
  typeBreakdown,
} from "../lib/activity-filters.ts";

const STAGES = ["backlog", "ready", "in_progress", "blocked", "done"];

// ---- URL round trip ----
const sp = new URLSearchParams("view=activity&actor=Ada&actor=bot%2F1&actor=Ada&stage=ready&stage=nope&bead=x-1");
const f = activityFiltersFromParams(sp, STAGES);
assert.deepEqual(f, { actors: ["Ada", "bot/1"], stages: ["ready"] }, "dedupes actors, drops unknown stages");
writeActivityFilters(sp, { actors: ["Zoé Lefèvre"], stages: [] });
assert.equal(sp.get("view"), "activity", "keeps unrelated params");
assert.equal(sp.get("bead"), "x-1", "keeps unrelated params");
assert.deepEqual(sp.getAll("actor"), ["Zoé Lefèvre"]);
assert.equal(sp.has("stage"), false, "clears a stage group that became empty");
assert.equal(hasActivityFilters({ actors: [], stages: [] }), false);

// ---- filtering: OR within a group, AND across groups ----
const ev = (id, actor, issueId, at = "2026-11-24T10:00:00Z") => ({
  id, actor, issueId, at, title: issueId, origin: actor === "Ada" ? "human" : "agent", action: "commented",
});
const items = [ev("1", "Ada", "T-1"), ev("2", "bot", "T-2"), ev("3", "bot", "T-1"), ev("4", "cat", "T-gone")];
const stageOf = (id) => ({ "T-1": "ready", "T-2": "done" })[id] ?? null;
const ids = (xs) => xs.map((x) => x.id);
assert.deepEqual(ids(filterActivity(items, { actors: [], stages: [] }, stageOf)), ["1", "2", "3", "4"]);
assert.deepEqual(ids(filterActivity(items, { actors: ["Ada", "bot"], stages: [] }, stageOf)), ["1", "2", "3"]);
assert.deepEqual(ids(filterActivity(items, { actors: [], stages: ["ready", "done"] }, stageOf)), ["1", "2", "3"]);
assert.deepEqual(ids(filterActivity(items, { actors: ["bot"], stages: ["ready"] }, stageOf)), ["3"], "AND across groups");
assert.deepEqual(ids(filterActivity(items, { actors: ["cat"], stages: ["ready"] }, stageOf)), [], "deleted bead never matches a stage");

// ---- agents ----
const agents = summarizeAgents([
  ev("a", "Ada", "T-1", "2026-11-24T09:00:00Z"),
  ev("b", "bot", "T-2", "2026-11-24T11:00:00Z"),
  ev("c", "Ada", "T-3", "2026-11-24T10:00:00Z"),
]);
assert.deepEqual(agents.map((a) => [a.actor, a.last.id, a.events]), [["bot", "b", 1], ["Ada", "c", 2]], "newest actor first, latest event kept");

// ---- freshness thresholds ----
const now = Date.parse("2026-11-24T12:00:00Z");
const ago = (min) => new Date(now - min * 60_000).toISOString();
assert.equal(freshness(ago(0), now), "active");
assert.equal(freshness(ago(4.9), now), "active");
assert.equal(freshness(ago(5), now), "quiet");
assert.equal(freshness(ago(29.9), now), "quiet");
assert.equal(freshness(ago(30), now), "silent");
assert.equal(freshness("not a date", now), "silent");

// ---- pipeline ----
const bead = (id, stage, extra = {}) => ({ id, stage, issue_type: "task", labels: [], updated_at: "2026-11-24T10:00:00Z", ...extra });
const beads = [
  bead("R-1", "ready", { updated_at: "2026-11-24T08:00:00Z" }),
  bead("R-2", "ready"),
  bead("R-B", "ready", { issue_type: "bug", updated_at: "2026-11-24T07:00:00Z" }),
  bead("R-E", "ready", { issue_type: "epic", updated_at: "2026-11-24T09:00:00Z" }),
  bead("R-A", "ready", { labels: ["archived"] }),
  ...Array.from({ length: 6 }, (_, i) => bead(`D-${i}`, "done", { updated_at: `2026-11-2${i}T00:00:00Z` })),
];
const pipe = summarizePipeline(beads, STAGES, (b) => b.stage);
const by = Object.fromEntries(pipe.map((s) => [s.id, s]));
assert.deepEqual(pipe.map((s) => s.id), STAGES, "one entry per stage, in order");
assert.deepEqual(
  by.ready,
  {
    id: "ready",
    count: 4,
    types: [{ type: "task", count: 2 }, { type: "bug", count: 1 }, { type: "epic", count: 1 }],
    ids: ["R-2", "R-E", "R-1", "R-B"],
    more: 0,
  },
  "archived skipped, counted per type with epics last, newest first",
);
assert.equal(by.done.count, 6);
assert.deepEqual(by.done.ids, ["D-5", "D-4", "D-3", "D-2"]);
assert.equal(by.done.more, 2);
assert.deepEqual(by.in_progress, { id: "in_progress", count: 0, types: [], ids: [], more: 0 });
assert.equal(isArchived({ labels: ["x", "archived"] }), true);
assert.equal(isArchived({}), false);

// ---- type breakdown: real type names, never "tasks" for bugs ----
assert.equal(typeBreakdown(by.ready.types), "2 tasks · 1 bug · 1 epic");
assert.equal(typeBreakdown([]), "");
assert.equal(typeBreakdown([{ type: "epic", count: 2 }]), "2 epics");
assert.equal(
  typeBreakdown([
    { type: "task", count: 5 }, { type: "bug", count: 3 }, { type: "story", count: 2 },
    { type: "chore", count: 1 }, { type: "epic", count: 1 },
  ]),
  "5 tasks · 3 bugs · 3 other · 1 epic",
  "folds the long tail into 'other'",
);
assert.equal(
  typeBreakdown([{ type: "task", count: 1 }, { type: "bug", count: 1 }, { type: "story", count: 2 }]),
  "1 task · 1 bug · 2 stories",
  "three types fit without an 'other'",
);
assert.equal(pluralType("story", 2), "2 stories");
assert.equal(pluralType("survey", 2), "2 surveys");

console.log("PASS: activity filters (URL, OR/AND filtering, agents, freshness, pipeline)");
