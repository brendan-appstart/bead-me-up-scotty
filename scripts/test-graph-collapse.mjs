// SCOTTY_TEST_URL=http://127.0.0.1:3302 node scripts/test-graph-collapse.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");
const dep = (depends_on_id, type = "parent-child") => ({ depends_on_id, type });
const bead = (id, dependencies = [], extra = {}) => ({
  id, title: id, issue_type: "task", status: "open", priority: 2,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", labels: [], dependencies, ...extra,
});
const beads = [
  bead("root", [], { issue_type: "epic" }),
  bead("parent", [dep("root"), dep("y", "blocks")]),
  bead("c", [dep("parent")]), bead("d", [dep("parent"), dep("y", "blocks"), dep("y", "related"), dep("closed-prerequisite", "blocks")]),
  bead("closed-prerequisite", [dep("e", "waits-for")], { status: "closed" }),
  bead("e", [dep("d"), dep("w", "blocks")]), bead("f", [dep("closed-child")]),
  bead("closed-child", [dep("parent")], { status: "closed" }),
  bead("x", [dep("c", "blocks"), dep("f", "blocks")]),
  bead("y", [dep("unrelated", "related")]), bead("z", [dep("e", "blocks")]), bead("w"),
  bead("tracking", [dep("d", "tracks"), dep("unrelated-blocker", "blocks")]),
  bead("unrelated", [dep("unrelated-blocker", "blocks")]), bead("unrelated-blocker"),
];
const projects = ["demo", "graph-collapse-other"];
const writes = [];
const errors = [];
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/telemetry") return route.fulfill({ json: { enabled: false } });
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 403, json: { error: "Fixture project is read-only" } });
    }
    if (path === "/api/viewer-mode") return route.fulfill({ json: { readOnly: true } });
    if (path === "/api/projects") return route.fulfill({ json: { projects: projects.map((id) => ({ id, name: id, kind: "demo" })) } });
    if (path.endsWith("/beads/stream")) return route.fulfill({ contentType: "text/event-stream", body: "" });
    if (path.endsWith("/beads")) {
      return route.fulfill({ json: { beads, meta: {
        kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000, readOnly: true,
      } } });
    }
    return route.fulfill({ json: beads.find(({ id }) => path.endsWith(`/beads/${id}`)) ?? {} });
  });

  const graph = (project) => page.goto(`${base}/p/${project}?view=graph`);
  const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
  const card = (id) => node(id).locator("[data-keyboard-bead-id]");
  const actions = (id) => page.getByRole("button", { name: `Graph actions for ${id}`, exact: true });
  const item = (name) => page.getByRole("menuitem", { name, exact: true });
  const badge = (id, count) => page.getByRole("button", { name: `Expand ${count} hidden subtasks of ${id}`, exact: true });
  const summary = (name) => page.locator(`.react-flow__edge[aria-label="${name}"]`);
  const direct = (id) => page.locator(`.react-flow__edge[data-id="${id}"]`);
  const opacity = (locator) => locator.evaluate((el) => Number(getComputedStyle(el).opacity));
  const edgeOpacity = (edge) => opacity(edge.locator(".react-flow__edge-path"));
  const scope = page.getByLabel("Graph scope", { exact: true });
  const spotlight = page.getByRole("checkbox", { name: "Spotlight dependencies", exact: true });
  const activeBlockingOnly = page.getByRole("checkbox", { name: "Only highlight active blocking chains", exact: true });
  const close = page.getByTitle("Close", { exact: true });
  const noDetails = async () => assert.equal(await close.count(), 0, "Graph actions must not open the detail drawer");
  const closeDetails = async () => { await close.click(); await close.waitFor({ state: "detached" }); };
  const choose = async (id, action) => { await actions(id).click(); await item(action).click(); };

  await graph("demo");
  await card("c").waitFor();
  await card("closed-child").waitFor();
  assert.equal(await spotlight.isChecked(), false, "Spotlight is off by default");
  assert.equal(await activeBlockingOnly.isChecked(), false, "Spotlight includes all relationships by default");
  await choose("parent", "Spotlight dependencies");
  assert.equal(await edgeOpacity(direct("parent->root:parent-child")), 1, "Default Spotlight shows the epic connection");
  assert.equal(await edgeOpacity(direct("d->closed-prerequisite:blocks")), 1, "Default Spotlight shows resolved blockers");
  assert.equal(await edgeOpacity(direct("d->y:related")), 1, "Default Spotlight shows related links");
  await choose("parent", "Clear spotlight");
  await activeBlockingOnly.check();
  await card("parent").click({ button: "right" });
  await item("Collapse subtasks").click();
  await card("c").waitFor({ state: "detached" });
  await badge("parent", 5).waitFor();
  assert.equal(await page.getByText("hidden by filter", { exact: false }).count(), 0);
  await noDetails();

  const xParent = summary("x to parent, via subtasks: blocks (2 links)");
  const parentY = summary("parent to y, via subtasks: blocks (1 link)");
  const parentW = summary("parent to w, via subtasks: blocks (1 link)");
  const zParent = summary("z to parent, via subtasks: blocks (1 link)");
  await xParent.getByText("Via subtasks · blocks", { exact: true }).waitFor();
  const parentRelated = summary("parent to y, via subtasks: related (1 link)");
  await parentRelated.waitFor();
  await direct("parent->y:blocks").waitFor();
  const hierarchyPath = direct("parent->root:parent-child").locator(".react-flow__edge-path");
  assert.ok(await hierarchyPath.evaluate((path) => path.getTotalLength()) > 0);
  assert.equal(await direct("x->c:blocks").count(), 0);
  const path = (edge) => edge.locator(".react-flow__edge-path").getAttribute("d");
  assert.notEqual(await path(parentY), await path(direct("parent->y:blocks")), "A summary must not cover a real direct edge");

  await choose("x", "Spotlight dependencies");
  assert.equal(await spotlight.isChecked(), false, "The menu must not change toolbar mode");
  assert.equal(await opacity(card("parent")), 1);
  assert.ok(await opacity(card("y")) < 0.5, "x→c and d→y do not form a path through the folded card");
  assert.equal(await edgeOpacity(xParent), 1);
  assert.ok(await edgeOpacity(parentY) < 0.5, "The projected d→y edge is not part of x's chain");
  await noDetails();
  const clearSpotlight = page.locator("header").getByTitle("Clear the dependency spotlight", { exact: true });
  assert.match(await clearSpotlight.innerText(), /^x\s+2 upstream\s+·\s+0 downstream$/,
    "The header badge reports the menu selection and its blocking counts");
  await card("x").click();
  await page.getByRole("heading", { name: "x", exact: true }).waitFor();
  await closeDetails();
  await clearSpotlight.click();
  await clearSpotlight.waitFor({ state: "detached" });
  assert.equal(await spotlight.isChecked(), false, "Clearing menu spotlight leaves toolbar mode off");
  assert.equal(await opacity(card("y")), 1);
  assert.equal(await edgeOpacity(parentY), 1);

  await choose("z", "Spotlight dependencies");
  assert.equal(await opacity(card("w")), 1, "A real z→e→w chain still highlights both summaries and w");
  assert.equal(await edgeOpacity(zParent), 1);
  assert.equal(await edgeOpacity(parentW), 1);
  assert.ok(await opacity(card("y")) < 0.5);
  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  assert.equal(await opacity(card("y")), 1);
  await choose("parent", "Spotlight dependencies");
  const parentDirect = direct("parent->y:blocks");
  assert.equal(await edgeOpacity(parentDirect), 1, "Blocking-only Spotlight follows the folded bead's own dependencies");
  assert.ok(await edgeOpacity(xParent) < 0.5, "Folded descendants are not seeds in blocking-only mode");
  assert.ok(await edgeOpacity(parentW) < 0.5);
  assert.ok(await edgeOpacity(parentRelated) < 0.5, "Blocking-only Spotlight dims non-blocking relationships");
  const pastBlock = summary("parent to closed-prerequisite, via subtasks: blocks (1 link)");
  const pastWait = summary("closed-prerequisite to parent, via subtasks: waits-for (1 link)");
  assert.ok(await edgeOpacity(pastBlock) < 0.5, "Blocking-only Spotlight dims resolved blockers");
  await activeBlockingOnly.uncheck();
  assert.equal(await spotlight.isChecked(), false, "Including all relationships works with toolbar Spotlight off");
  assert.equal(await opacity(card("closed-prerequisite")), 1);
  assert.equal(await edgeOpacity(pastBlock), 1, "A folded 'was blocked by' relationship lights up");
  assert.equal(await edgeOpacity(pastWait), 1, "An incoming resolved relationship lights up too");
  assert.equal(await edgeOpacity(parentRelated), 1, "A folded outgoing related link lights up");
  assert.equal(await edgeOpacity(summary("tracking to parent, via subtasks: tracks (1 link)")), 1,
    "An incoming relationship also lights up through the fold");
  assert.equal(await edgeOpacity(xParent), 1);
  assert.equal(await edgeOpacity(parentY), 1);
  assert.equal(await edgeOpacity(parentW), 1, "The folded grandchild's blocking summary lights up");
  assert.equal(await edgeOpacity(zParent), 1);
  await badge("parent", 5).waitFor();
  await activeBlockingOnly.check();
  assert.equal(await edgeOpacity(parentDirect), 1);
  assert.ok(await edgeOpacity(parentW) < 0.5, "Toggling off restores the original menu selection without clearing it");
  await activeBlockingOnly.uncheck();
  await choose("x", "Spotlight dependencies");
  assert.equal(await edgeOpacity(xParent), 1);
  assert.ok(await edgeOpacity(parentY) < 0.5, "The fold does not add sibling dependencies to x's Spotlight");
  assert.ok(await edgeOpacity(parentW) < 0.5);
  await choose("x", "Clear spotlight");
  await activeBlockingOnly.check();
  await spotlight.check();
  await card("x").click();
  await noDetails();
  await card("x").dblclick();
  await page.getByRole("heading", { name: "x", exact: true }).waitFor();
  await closeDetails();
  await spotlight.uncheck();

  await scope.selectOption("root");
  await summary("parent to x, via subtasks: blocks (2 links)").waitFor();
  await summary("y to parent, via subtasks: blocks (1 link)").waitFor();
  await node("x").getByText("Outside epic", { exact: true }).waitFor();
  await actions("root").press("ArrowDown");
  await item("Collapse subtasks").waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Collapse subtasks");
  await page.keyboard.press("Enter");
  await badge("root", 6).waitFor();
  await card("parent").waitFor({ state: "detached" });
  await summary("root to x, via subtasks: blocks (2 links)").waitFor();
  await noDetails();

  await page.reload();
  assert.equal(await scope.inputValue(), "", "Reload resets graph scope but not folds");
  await badge("root", 6).tap();
  await badge("parent", 5).waitFor();
  assert.equal(await card("c").count(), 0, "Expanding the outer fold preserves the inner fold");
  await noDetails();

  await graph("graph-collapse-other");
  await card("c").waitFor();
  assert.equal(await badge("parent", 5).count(), 0, "The same bead ids in a different project are expanded");
  await graph("demo");
  await badge("parent", 5).waitFor();
  await actions("parent").tap();
  await item("Expand subtasks").tap();
  await card("c").waitFor();
  await noDetails();

  await activeBlockingOnly.check();
  await spotlight.check();
  await card("parent").click();
  for (const id of ["c", "e", "f", "w"]) {
    assert.ok(await opacity(card(id)) < 0.5, `${id} is dimmed with subtasks off`);
  }
  const childLink = direct("d->parent:parent-child");
  const grandchildLink = direct("e->d:parent-child");
  const ancestorLink = direct("parent->root:parent-child");
  assert.ok(await edgeOpacity(childLink) < 0.5, "Hierarchy is dimmed with subtasks off");
  assert.ok(await edgeOpacity(ancestorLink) < 0.5, "The connection to the epic is dimmed with subtasks off");
  await activeBlockingOnly.uncheck();
  for (const id of ["c", "e", "f", "w"]) {
    assert.equal(await opacity(card(id)), 1, `${id} is highlighted with subtasks on`);
  }
  assert.equal(await edgeOpacity(childLink), 1, "The selected parent's hierarchy is highlighted");
  assert.equal(await edgeOpacity(grandchildLink), 1, "Nested hierarchy links are highlighted");
  assert.equal(await opacity(card("root")), 1, "The containing epic is highlighted");
  assert.equal(await edgeOpacity(ancestorLink), 1, "The hierarchy connects the selection to its epic");
  const edgeColor = (edge) => edge.locator(".react-flow__edge-path").evaluate((el) => getComputedStyle(el).stroke);
  const grandchildBlocker = direct("e->w:blocks");
  assert.equal(await edgeOpacity(grandchildBlocker), 1, "A grandchild seeds an original blocking link");
  assert.notEqual(await edgeColor(grandchildLink), await edgeColor(grandchildBlocker), "Hierarchy and blocking links retain distinct colors");
  assert.equal(await opacity(card("tracking")), 1, "An otherwise unconnected task linked by tracks is highlighted");
  assert.equal(await edgeOpacity(direct("tracking->d:tracks")), 1);
  assert.equal(await edgeOpacity(direct("d->y:related")), 1);
  assert.notEqual(await path(direct("d->y:related")), await path(direct("d->y:blocks")),
    "Two direct relationship types between the same tasks must not overlap");
  const resolved = direct("d->closed-prerequisite:blocks");
  assert.equal(await edgeOpacity(resolved), 1);
  assert.equal(await resolved.evaluate(el => el.classList.contains("animated")), false,
    "A resolved blocker does not animate like an active blocker");
  assert.ok(await opacity(card("unrelated")) < 0.5);
  assert.ok(await edgeOpacity(direct("y->unrelated:related")) < 0.5, "Only direct related links are shown");
  assert.ok(await edgeOpacity(direct("tracking->unrelated-blocker:blocks")) < 0.5, "Context links do not seed blocking paths");
  await activeBlockingOnly.check();
  assert.ok(await edgeOpacity(direct("d->y:related")) < 0.5, "Toggling off dims non-blocking relationships again");
  assert.ok(await opacity(card("e")) < 0.5, "Toggling off restores the original toolbar selection");
  assert.ok(await edgeOpacity(childLink) < 0.5, "Toggling off dims hierarchy links again");
  await noDetails();

  await card("e").click();
  await activeBlockingOnly.uncheck();
  for (const link of [grandchildLink, childLink, ancestorLink]) {
    assert.equal(await edgeOpacity(link), 1, "A nested selection connects to the epic through its intermediate parents");
  }
  assert.ok(await opacity(card("c")) < 0.5, "Highlighting the epic does not include siblings");
  assert.ok(await edgeOpacity(direct("c->parent:parent-child")) < 0.5);
  assert.ok(await edgeOpacity(parentDirect) < 0.5, "Highlighting an ancestor does not seed its blockers");
  await activeBlockingOnly.check();
  await choose("parent", "Collapse subtasks");
  await badge("parent", 5).waitFor();
  assert.equal(await edgeOpacity(parentW), 1, "Folding preserves the original focused grandchild");
  await activeBlockingOnly.uncheck();
  assert.equal(await edgeOpacity(zParent), 1);
  assert.equal(await edgeOpacity(ancestorLink), 1, "A folded selection still connects to the epic through its visible representative");
  assert.ok(await edgeOpacity(xParent) < 0.5, "Including subtasks does not seed from the focused bead's representative");

  await page.getByRole("checkbox", { name: "Live dependencies only" }).check();
  await badge("parent", 3).waitFor();
  await page.getByText("2 hidden by filter", { exact: true }).waitFor();
  await card("closed-prerequisite").waitFor({ state: "detached" });
  await card("parent").click();
  assert.equal(await edgeOpacity(parentW), 1);
  assert.ok(await opacity(card("f")) < 0.5, "A visible bead is not seeded through a filtered-out parent");
  assert.ok(await edgeOpacity(direct("x->f:blocks")) < 0.5, "Spotlight does not walk downstream then upstream");

  await page.evaluate(() => localStorage.setItem("scotty.graph.folds.demo", '["parent",42]'));
  await page.reload();
  await card("c").waitFor();
  assert.equal(await activeBlockingOnly.isChecked(), false, "Reload resets the view-local Spotlight option");
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (key.startsWith("scotty.graph.folds.")) throw new DOMException("Storage is blocked", "SecurityError");
        return original.call(this, key, ...args);
      };
    }
  });
  await page.reload();
  await card("c").waitFor();
  await choose("parent", "Collapse subtasks");
  await badge("parent", 5).waitFor();
  await noDetails();

  assert.deepEqual(writes, [], "Folding, highlighting and browsing in read-only mode must not write to APIs");
  assert.deepEqual(errors, [], "Graph interactions must not raise browser errors");
  console.log("PASS: graph fold menu, keyboard and touch, summaries, spotlight, details, and project-local persistence");
} finally {
  await browser.close();
}
