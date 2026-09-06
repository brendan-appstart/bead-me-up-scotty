// Board sorting regression. Uses only intercepted demo fixtures; no project data is read or written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const bead = (id, priority, updated_at, extra = {}) => ({
  id,
  title: `Sorting ${id}`,
  status: "open",
  issue_type: "task",
  priority,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at,
  ...extra,
});

const beads = [
  // The fixture order is intentional: manual fallback must retain this order for equal priorities.
  bead("manual-z", 3, "2026-09-02T00:00:00Z"),
  bead("manual-a", 3, "2026-09-02T00:00:00Z"),
  bead("p2-new", 2, "2026-09-06T00:00:00Z"),
  bead("z-tie", 1, "2026-09-05T00:00:00Z"),
  bead("p0-old", 0, "2026-09-01T00:00:00Z"),
  bead("a-tie", 1, "2026-09-05T00:00:00Z"),
  bead("p1-new", 1, "2026-09-06T00:00:00Z"),
  bead("moving", 2, "2026-09-03T00:00:00Z"),
  bead("in-progress", 2, "2026-09-04T00:00:00Z", { status: "in_progress" }),
];
const orders = { ready: ["manual-a", "manual-z"] };
const writes = [];

const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/order")) {
      if (request.method() === "GET") return route.fulfill({ json: { orders } });
      const body = request.postDataJSON();
      writes.push({ kind: "order", body });
      orders[body.columnId] = body.ids;
      return route.fulfill({ json: { orders } });
    }
    if (path.endsWith("/beads")) return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000 } } });
    if (path.endsWith("/status")) {
      const body = request.postDataJSON();
      const id = path.split("/").at(-2);
      const target = beads.find((candidate) => candidate.id === id);
      if (target) target.status = body.status;
      writes.push({ kind: "status", id, body });
      return route.fulfill({ json: target ?? {} });
    }
    return route.fulfill({ json: beads.find((candidate) => path.endsWith(`/beads/${candidate.id}`)) ?? {} });
  });

  const sort = () => page.getByLabel("Sort board cards", { exact: true });
  const card = (id) => page.locator(`[data-keyboard-bead-id="${id}"]`);
  const column = (name) => page.getByText(name, { exact: true }).locator("xpath=ancestor::section[1]");
  const readyIds = () => column("Ready").locator("article").evaluateAll((cards) => cards.map((card) => card.dataset.keyboardBeadId));
  const expectReady = async (ids, message) => assert.deepEqual(await readyIds(), ids, message);
  const drag = async (sourceId, targetId) => {
    const source = card(sourceId);
    const target = targetId === "in_progress" ? column("In Progress").locator("article").first() : card(targetId);
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    assert.ok(from && to, `drag targets must be visible: ${sourceId} → ${targetId}`);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 2 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();
  };

  // Unknown persisted settings must not leak into the UI as an invalid select value.
  await page.addInitScript(() => {
    if (localStorage.getItem("bmus.board") === null) {
      localStorage.setItem("bmus.board", JSON.stringify({ sortMode: "obsolete" }));
    }
  });
  await page.goto(`${base}/p/demo`);
  await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
  await card("manual-a").waitFor();
  assert.equal(await sort().inputValue(), "manual", "unknown saved mode falls back to manual");
  await expectReady(["manual-a", "manual-z", "p0-old", "z-tie", "a-tie", "p1-new", "p2-new", "moving"], "manual is the default and honors saved order; same-priority unranked fallback keeps fixture order");

  await sort().selectOption("priority");
  await expectReady(["p0-old", "p1-new", "a-tie", "z-tie", "p2-new", "moving", "manual-a", "manual-z"], "priority sorts ascending, then most-recent update, then ID for exact ties");
  await page.reload();
  await sort().waitFor();
  await card("p0-old").waitFor();
  assert.equal(await sort().inputValue(), "priority", "selected sort mode survives reload");
  await expectReady(["p0-old", "p1-new", "a-tie", "z-tie", "p2-new", "moving", "manual-a", "manual-z"], "manual order is retained while an automatic mode is selected");

  await sort().selectOption("updated");
  await expectReady(["p1-new", "p2-new", "a-tie", "z-tie", "moving", "manual-a", "manual-z", "p0-old"], "recently updated is descending, with priority and ID tie breakers");

  // The live isolated server starts read-only. A drag must not produce either sort or status writes.
  const readOnlyWrites = writes.length;
  await drag("moving", "in-progress");
  await page.waitForTimeout(250);
  assert.equal(writes.length, readOnlyWrites, "read-only board blocks drag writes");

  // Enable editing only for this isolated demo browser session, then verify automated modes permit status moves without persisting an order.
  const unlock = await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  assert.equal(unlock.status(), 200, "isolated demo can be unlocked for mutation assertions");
  await page.reload();
  await sort().waitFor();
  await sort().selectOption("priority");
  const priorityInternalWrites = writes.length;
  await drag("p0-old", "p1-new");
  await page.waitForTimeout(250);
  assert.equal(writes.length, priorityInternalWrites, "priority within-column drag does not write an order or status");
  const priorityWrites = writes.length;
  const priorityStatus = page.waitForResponse((response) => response.url().endsWith("/beads/moving/status") && response.request().method() === "POST");
  await drag("moving", "in-progress");
  await priorityStatus;
  assert.deepEqual(writes.slice(priorityWrites).map((write) => write.kind), ["status"], "priority cross-column drag writes status only");
  assert.equal(writes.at(-1).body.status, "in_progress");

  // Restore the fixture card to Ready and test the other automatic mode separately.
  beads.find((candidate) => candidate.id === "moving").status = "open";
  await page.reload();
  await sort().waitFor();
  await sort().selectOption("updated");
  const updatedInternalWrites = writes.length;
  await drag("p0-old", "p1-new");
  await page.waitForTimeout(250);
  assert.equal(writes.length, updatedInternalWrites, "updated within-column drag does not write an order or status");
  const updatedWrites = writes.length;
  const updatedStatus = page.waitForResponse((response) => response.url().endsWith("/beads/moving/status") && response.request().method() === "POST");
  await drag("moving", "in-progress");
  await updatedStatus;
  assert.deepEqual(writes.slice(updatedWrites).map((write) => write.kind), ["status"], "updated cross-column drag writes status only");

  // Returning to Manual exposes the preserved saved ordering and is the sole mode that persists an in-column reorder.
  beads.find((candidate) => candidate.id === "moving").status = "open";
  await page.reload();
  await sort().waitFor();
  await sort().selectOption("manual");
  await expectReady(["manual-a", "manual-z", "p0-old", "z-tie", "a-tie", "p1-new", "p2-new", "moving"], "manual order remains intact after changing automatic modes");
  const manualWrites = writes.length;
  const orderWrite = page.waitForResponse((response) => response.url().endsWith("/order") && response.request().method() === "PUT");
  await drag("manual-z", "manual-a");
  await orderWrite;
  assert.deepEqual(writes.slice(manualWrites).map((write) => write.kind), ["order"], "only manual within-column dragging persists an order");
  assert.deepEqual(writes.at(-1).body, { columnId: "ready", ids: ["manual-z", "manual-a", "p0-old", "z-tie", "a-tie", "p1-new", "p2-new", "moving"] });
  assert.deepEqual(errors, []);
  console.log("PASS: board sort defaults, saved/manual ordering, automatic deterministic sorting, persisted preferences, and drag write guards");
} catch (error) {
  console.error({ writes, url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 2500) : "" });
  throw error;
} finally {
  await browser.close();
}
