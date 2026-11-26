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
  bead("c", [dep("parent")]), bead("d", [dep("parent"), dep("y", "blocks"), dep("y", "related")]),
  bead("e", [dep("parent"), dep("w", "blocks")]), bead("f", [dep("parent")]),
  bead("closed-child", [dep("parent")], { status: "closed" }),
  bead("x", [dep("c", "blocks"), dep("f", "blocks")]), bead("y"), bead("z", [dep("e", "blocks")]), bead("w"),
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
  const close = page.getByTitle("Close", { exact: true });
  const noDetails = async () => assert.equal(await close.count(), 0, "Graph actions must not open the detail drawer");
  const closeDetails = async () => { await close.click(); await close.waitFor({ state: "detached" }); };
  const choose = async (id, action) => { await actions(id).click(); await item(action).click(); };

  await graph("demo");
  await card("c").waitFor();
  await card("closed-child").waitFor();
  assert.equal(await spotlight.isChecked(), false, "Spotlight is off by default");
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
  await summary("parent to y, via subtasks: related (1 link)").waitFor();
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
  await card("x").click();
  await page.getByRole("heading", { name: "x", exact: true }).waitFor();
  await closeDetails();
  await choose("x", "Clear spotlight");
  assert.equal(await opacity(card("y")), 1);

  await choose("z", "Spotlight dependencies");
  assert.equal(await opacity(card("w")), 1, "A real z→e→w chain still highlights both summaries and w");
  assert.equal(await edgeOpacity(zParent), 1);
  assert.equal(await edgeOpacity(parentW), 1);
  assert.ok(await opacity(card("y")) < 0.5);
  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  assert.equal(await opacity(card("y")), 1);
  await choose("parent", "Spotlight dependencies");
  assert.equal(await edgeOpacity(xParent), 1, "A selected folded card seeds spotlight from its represented children");
  assert.equal(await edgeOpacity(parentW), 1);
  await choose("parent", "Clear spotlight");
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

  await choose("parent", "Collapse subtasks");
  await badge("parent", 5).waitFor();
  await page.getByRole("checkbox", { name: "Live dependencies only" }).check();
  await badge("parent", 4).waitFor();
  await page.getByText("1 hidden by filter", { exact: true }).waitFor();

  await page.evaluate(() => localStorage.setItem("scotty.graph.folds.demo", '["parent",42]'));
  await page.reload();
  await card("c").waitFor();
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
