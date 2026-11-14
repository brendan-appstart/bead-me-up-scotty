// Board columns: the standard layout (unchanged) and the opt-in Waiting layout.
// The first part loads the real lib modules without a server; the second uses
// only intercepted demo fixtures, so no project data is read or written.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { chromium } from "playwright";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {};
  cache.set(name, exports);
  const code = ts.transpileModule(readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => (id.startsWith("./") ? load(id.slice(2)) : nodeRequire(id)) });
  return exports;
}
const { blockKind, isBlocked, makeIndex } = load("beads-view");
const { colOf, boardColumns, columnOrder, dropNotice, parseColumnLayout, COLUMN_ORDER, BOARD_COLUMNS } = load("board-columns");

const bead = (id, extra = {}) => ({
  id,
  title: `Column ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const dep = (type, depends_on_id) => ({ type, depends_on_id });
const on = (...targets) => ({ dependencies: targets.map((t) => dep("blocks", t)) });
const gate = (id, extra = {}) => bead(id, { issue_type: "gate", await_type: "human", ...extra });
// (Copied into this realm's arrays: the modules run in their own vm context.)
const list = (columns, key) => Array.from(columns, (c) => c[key] ?? null);

const WAITING_HINT = "Not started: waits on other work, or parked (deferred).";
const BLOCKED_HINT =
  "Waits on a person: a bead with the human label, or a human gate, that you can act on now (not deferred, not itself blocked). Or the status is blocked.";

// ---- the layouts, on the real modules ----

// The standard layout is the default and is exactly the board from before.
for (const columns of [BOARD_COLUMNS, boardColumns(), boardColumns("standard")]) {
  assert.deepEqual(list(columns, "id"), ["backlog", "ready", "in_progress", "blocked", "done"]);
  assert.deepEqual(list(columns, "name"), ["Backlog", "Ready", "In Progress", "Blocked", "Done"]);
  assert.deepEqual(list(columns, "cmd"), ["deferred", "bd ready", "in_progress", "bd blocked", "closed"]);
  assert.deepEqual(list(columns, "hint"), [null, null, null, null, null]);
}
assert.deepEqual([...COLUMN_ORDER], [...columnOrder()]);

// The Waiting layout: not-started work on the left. Waiting keeps the id
// "backlog", so saved orders and scotty.rank need no migration.
const waiting = boardColumns("waiting");
assert.deepEqual([...columnOrder("waiting")], ["backlog", "ready", "blocked", "in_progress", "done"]);
assert.deepEqual(list(waiting, "name"), ["Waiting", "Ready", "Blocked", "In Progress", "Done"]);
assert.deepEqual(list(waiting, "cmd"), ["waits on work, or parked", "bd ready", "waits on a person", "in_progress", "closed"]);
assert.deepEqual(list(waiting, "hint"), [WAITING_HINT, null, BLOCKED_HINT, null, null]);
assert.equal(waiting[0].status, "deferred", "a drop into Waiting still sets deferred");

assert.equal(parseColumnLayout("waiting"), "waiting");
assert.equal(parseColumnLayout("standard"), "standard");
for (const junk of ["Waiting", "", null, undefined, 1, true]) assert.equal(parseColumnLayout(junk), undefined);

const items = [
  bead("task-open"),
  bead("question", { labels: ["human", "question"] }),
  bead("assumption", { labels: ["human", "assumption"] }),
  bead("blocker", { labels: ["human", "blocker"] }),
  bead("label-only", { labels: ["question"] }),
  bead("human", { labels: ["human"] }),
  bead("question-busy", { status: "in_progress", labels: ["human", "question"] }),
  bead("question-closed", { status: "closed", labels: ["human", "question"] }),
  // Person items a person cannot act on now: they count as other work.
  bead("question-deferred", { status: "deferred", labels: ["human", "question"] }),
  bead("question-blocked", { status: "blocked", labels: ["human", "question"] }),
  bead("question-waits", { labels: ["human", "question"], ...on("task-open") }),
  gate("gate"),
  gate("gate-waits", on("task-open")),
  gate("gate-deferred", { status: "deferred" }),
  gate("gate-closed", { status: "closed" }),
  bead("epic-human", { issue_type: "epic", labels: ["human"] }),
];
const cases = [
  // [bead, kind, column in the Waiting layout]
  [bead("waits-work", on("task-open")), "work", "backlog"],
  [bead("waits-missing", on("not-in-index")), "work", "backlog"],
  [bead("waits-for-work", { dependencies: [dep("waits-for", "task-open")] }), "work", "backlog"],
  [bead("waits-question", on("question")), "gate", "blocked"],
  [bead("waits-assumption", { dependencies: [dep("conditional-blocks", "assumption")] }), "gate", "blocked"],
  [bead("waits-blocker", { dependencies: [dep("waits-for", "blocker")] }), "gate", "blocked"],
  [bead("waits-human", on("human")), "gate", "blocked"],
  [bead("waits-question-busy", on("question-busy")), "gate", "blocked"],
  [bead("waits-gate", on("gate")), "gate", "blocked"],
  [bead("waits-both", on("task-open", "question")), "gate", "blocked"],
  // Only the `human` label (or a human gate) waits on a person, as in needsHuman().
  [bead("waits-label-only", on("label-only")), "work", "backlog"],
  // Only an item a person can act on now: not deferred, not blocked, not waiting itself.
  [bead("waits-question-deferred", on("question-deferred")), "work", "backlog"],
  [bead("waits-question-blocked", on("question-blocked")), "work", "backlog"],
  [bead("waits-question-waits", on("question-waits")), "work", "backlog"],
  [bead("waits-gate-waits", on("gate-waits")), "work", "backlog"],
  [bead("waits-gate-deferred", on("gate-deferred")), "work", "backlog"],
  [bead("free"), "none", "ready"],
  [bead("answered", on("question-closed")), "none", "ready"],
  [bead("approved", on("gate-closed")), "none", "ready"],
  [bead("child-of-human", { dependencies: [dep("parent-child", "epic-human")] }), "none", "ready"],
  [bead("related-question", { dependencies: [dep("related", "question")] }), "none", "ready"],
  [bead("deferred", { status: "deferred" }), "none", "backlog"],
  [bead("deferred-gated", { status: "deferred", ...on("question") }), "gate", "backlog"],
  [bead("status-blocked", { status: "blocked" }), "none", "blocked"],
  [bead("busy-gated", { status: "in_progress", ...on("question") }), "gate", "in_progress"],
  [bead("hooked-work", { status: "hooked", ...on("task-open") }), "work", "in_progress"],
  [bead("closed", { status: "closed", ...on("question") }), "gate", "done"],
];
const index = makeIndex([...items, ...cases.map(([b]) => b)]);
for (const [b, kind, column] of cases) {
  assert.equal(blockKind(b, index), kind, `${b.id}: kind`);
  assert.equal(colOf(b, index, "waiting"), column, `${b.id}: Waiting layout column`);
}

// The standard layout keeps the rule from before the Waiting layout, written out here.
function columnBefore(b) {
  const blocked = isBlocked(b, index);
  if (b.status === "deferred") return "backlog";
  if (b.status === "open" && !blocked) return "ready";
  if (b.status === "in_progress" || b.status === "hooked") return "in_progress";
  if (blocked && b.status !== "closed") return "blocked";
  if (b.status === "closed") return "done";
  return null;
}
for (const b of index.values()) {
  assert.equal(colOf(b, index), columnBefore(b), `${b.id}: standard column`);
  assert.equal(colOf(b, index, "standard"), columnBefore(b), `${b.id}: standard column`);
}
// isBlocked() is unchanged: an open bead waiting on other work still counts as blocked.
assert.equal(isBlocked(index.get("waits-work"), index), true);
assert.equal(isBlocked(index.get("waits-question"), index), true);
assert.equal(isBlocked(index.get("free"), index), false);

// The drop notice: only in the Waiting layout, only when the card lands elsewhere.
const parkedLater = bead("parked-later", { status: "deferred", ...on("task-open") });
const parkedAsks = bead("parked-asks", { status: "deferred", ...on("question") });
const dropIndex = makeIndex([...items, parkedLater, parkedAsks, bead("free")]);
assert.equal(dropNotice(parkedLater, "ready", dropIndex, "standard"), null, "the standard layout shows no toast");
assert.deepEqual({ ...dropNotice(parkedLater, "ready", dropIndex, "waiting") }, {
  title: "parked-later is now open",
  description: "It waits on other work, so it stays in Waiting.",
});
assert.deepEqual({ ...dropNotice(parkedAsks, "ready", dropIndex, "waiting") }, {
  title: "parked-asks is now open",
  description: "It waits on a person, so it shows in Blocked.",
});
assert.equal(dropNotice(dropIndex.get("free"), "backlog", dropIndex, "waiting"), null, "it lands where it was dropped");
for (const target of ["blocked", "in_progress", "done"]) {
  assert.equal(dropNotice(parkedLater, target, dropIndex, "waiting"), null, `a drop on ${target}`);
}

// ---- the board in a browser ----

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const beads = [
  bead("upstream", { title: "Earlier plan step" }),
  bead("question", { title: "Which region?", labels: ["human", "question"] }),
  bead("later-step", { title: "Later plan step", ...on("upstream") }),
  bead("needs-answer", { title: "Needs an answer", ...on("question") }),
  bead("free", { title: "Nothing in the way" }),
  bead("parked", { title: "Parked", status: "deferred" }),
  bead("parked-later", { title: "Parked, waits on work", status: "deferred", ...on("upstream") }),
  bead("parked-asks", { title: "Parked, waits on a person", status: "deferred", ...on("question") }),
  bead("parked-std", { title: "Parked, for the standard drop", status: "deferred", ...on("upstream") }),
  bead("busy", { title: "Started, then blocked", status: "in_progress", ...on("question") }),
  bead("shipped", { title: "Shipped", status: "closed", closed_at: "2026-09-02T00:00:00Z" }),
];
const standardPlacement = {
  parked: "backlog",
  "parked-later": "backlog",
  "parked-asks": "backlog",
  "parked-std": "backlog",
  free: "ready",
  upstream: "ready",
  question: "ready",
  busy: "in_progress",
  "later-step": "blocked",
  "needs-answer": "blocked",
  shipped: "done",
};
const waitingPlacement = { ...standardPlacement, "later-step": "backlog", "needs-answer": "blocked" };
let metaLayout;
const writes = [];
const activityLayouts = [];
const pageErrors = [];

const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1900, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = pageErrors;
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/order")) return route.fulfill({ json: { orders: {} } });
    if (path.endsWith("/activity")) {
      activityLayouts.push(url.searchParams.get("layout"));
      return route.fulfill({ json: { items: [] } });
    }
    if (path.endsWith("/beads")) {
      const meta = { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 };
      return route.fulfill({ json: { beads, meta: metaLayout ? { ...meta, columnLayout: metaLayout } : meta } });
    }
    if (path.endsWith("/status")) {
      const body = request.postDataJSON();
      const id = path.split("/").at(-2);
      const target = beads.find((candidate) => candidate.id === id);
      if (target) target.status = body.status;
      writes.push({ id, body });
      return route.fulfill({ json: target ?? {} });
    }
    const hit = beads.find((candidate) => path.endsWith(`/beads/${candidate.id}`));
    // Anything else (doctor, insights, …) goes to the isolated demo server.
    return hit ? route.fulfill({ json: hit }) : route.continue();
  });

  const unlock = await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  assert.equal(unlock.status(), 200, "isolated demo can be unlocked for the drop checks");

  const card = (id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
  const cardIn = (column, id) => page.locator(`[data-board-column="${column}"] [data-keyboard-bead-id="${id}"]`);
  const columnIds = () => page.locator("main [data-board-column]").evaluateAll((sections) => sections.map((s) => s.dataset.boardColumn));
  const columnTitles = () => page.locator("main [data-board-column] > div:first-child > span:nth-child(2)").allTextContents();
  const placement = () =>
    page.locator("main [data-board-column] article").evaluateAll((cards) =>
      Object.fromEntries(cards.map((c) => [c.dataset.keyboardBeadId, c.closest("[data-board-column]").dataset.boardColumn])));
  const setStoredLayout = (layout) =>
    page.evaluate((value) => localStorage.setItem("bmus.board", JSON.stringify(value === undefined ? {} : { columnLayout: value })), layout);
  async function openBoard() {
    await page.goto(`${base}/p/demo`);
    await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
    await card("shipped").waitFor();
  }
  const waitingSwitch = () => page.getByRole("switch", { name: "Waiting column" });
  async function openSettings() {
    await page.goto(`${base}/p/demo`);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await waitingSwitch().waitFor();
  }
  async function drag(id, ontoId) {
    const from = await card(id).boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 2 });
    const to = await card(ontoId).boundingBox();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    const written = page.waitForResponse((response) => response.url().endsWith(`/beads/${id}/status`) && response.request().method() === "POST");
    await page.mouse.up();
    await written;
  }
  const toast = (title) => page.locator("[data-sonner-toast]").filter({ hasText: title });

  // 1. Off by default: the standard board, exactly as before.
  await openBoard();
  assert.deepEqual(await columnIds(), ["backlog", "ready", "in_progress", "blocked", "done"]);
  assert.deepEqual(await columnTitles(), ["Backlog", "Ready", "In Progress", "Blocked", "Done"]);
  assert.deepEqual(await placement(), standardPlacement, "standard: each card in its column");
  assert.equal(await page.locator('[data-board-column="blocked"]').getByText("bd blocked", { exact: true }).getAttribute("title"), null);
  assert.equal(activityLayouts.at(-1), "standard", "Activity asks for the standard layout");

  // 2. The Settings switch turns it on, for this browser.
  await openSettings();
  assert.equal(await waitingSwitch().getAttribute("aria-checked"), "false");
  await waitingSwitch().click();
  assert.equal(await waitingSwitch().getAttribute("aria-checked"), "true");
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem("bmus.board"))).columnLayout, "waiting");

  // 3. On: the Waiting layout on the board, with its hints, and in the list.
  await openBoard();
  assert.deepEqual(await columnIds(), ["backlog", "ready", "blocked", "in_progress", "done"]);
  assert.deepEqual(await columnTitles(), ["Waiting", "Ready", "Blocked", "In Progress", "Done"]);
  assert.deepEqual(await placement(), waitingPlacement, "waiting: each card in its column");
  assert.equal(await page.locator('[data-board-column="backlog"]').getByText("waits on work, or parked", { exact: true }).getAttribute("title"), WAITING_HINT);
  assert.equal(await page.locator('[data-board-column="blocked"]').getByText("waits on a person", { exact: true }).getAttribute("title"), BLOCKED_HINT);
  assert.equal(activityLayouts.at(-1), "waiting", "Activity asks for the Waiting layout");
  // (Done is left out: its window control makes that header taller on its own.)
  const headerHeights = await page.locator("main [data-board-column]:not([data-board-column=done]) > div:first-child").evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
  assert.equal(new Set(headerHeights).size, 1, `column headers keep one height: ${headerHeights}`);
  await page.goto(`${base}/p/demo?view=list`);
  await page.getByRole("heading", { name: "List", exact: true }).waitFor();
  await card("shipped").waitFor();
  assert.deepEqual(await page.locator("main span.uppercase").allTextContents(), ["Waiting", "Ready", "Blocked", "In Progress", "Done"]);

  // 4. The launch default (SCOTTY_WAITING_COLUMN) applies where a browser has not chosen; a choice wins.
  metaLayout = "waiting";
  await setStoredLayout(undefined);
  await openBoard();
  assert.deepEqual(await columnTitles(), ["Waiting", "Ready", "Blocked", "In Progress", "Done"], "the launch default applies");
  await openSettings();
  assert.equal(await waitingSwitch().getAttribute("aria-checked"), "true", "Settings shows the launch default");
  await waitingSwitch().click();
  await openBoard();
  assert.deepEqual(await columnTitles(), ["Backlog", "Ready", "In Progress", "Blocked", "Done"], "the browser's choice wins");
  metaLayout = undefined;

  // 5. Drops in the Waiting layout: the status changes as before; a toast says where and why.
  await setStoredLayout("waiting");
  await openBoard();
  await drag("free", "parked");
  assert.deepEqual(writes.at(-1), { id: "free", body: { status: "deferred" } }, "a drop into Waiting writes deferred");
  await cardIn("backlog", "free").waitFor();
  await drag("parked-later", "upstream");
  assert.deepEqual(writes.at(-1), { id: "parked-later", body: { status: "open" } }, "a drop on Ready writes open");
  await cardIn("backlog", "parked-later").waitFor();
  assert.equal(await toast("parked-later is now open").locator("[data-description]").textContent(), "It waits on other work, so it stays in Waiting.");
  await drag("parked-asks", "upstream");
  assert.deepEqual(writes.at(-1), { id: "parked-asks", body: { status: "open" } });
  await cardIn("blocked", "parked-asks").waitFor();
  assert.equal(await toast("parked-asks is now open").locator("[data-description]").textContent(), "It waits on a person, so it shows in Blocked.");
  assert.equal(await toast("free is now").count(), 0, "a card that lands where it was dropped gets no toast");

  // 6. Drops in the standard layout: no toast, as before.
  await setStoredLayout("standard");
  await openBoard();
  await drag("parked-std", "upstream");
  assert.deepEqual(writes.at(-1), { id: "parked-std", body: { status: "open" } });
  await cardIn("blocked", "parked-std").waitFor();
  assert.equal(await page.locator("[data-sonner-toast]").count(), 0, "the standard layout shows no drop toast");

  assert.equal(writes.length, 4);
  assert.deepEqual(errors, []);
  console.log("PASS: standard layout unchanged and the default; Settings switch and launch default (a browser's choice wins); Waiting layout columns, exact hints, list groups and Activity layout; person rule = Needs You's actionable items; drop toasts in the Waiting layout only");
} catch (error) {
  console.error({ writes, activityLayouts, url: page?.url(), errors: pageErrors });
  throw error;
} finally {
  await browser.close();
}
