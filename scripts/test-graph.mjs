// Run against an isolated app server: SCOTTY_TEST_URL=http://127.0.0.1:3000 node scripts/test-graph.mjs
// Project API requests are intercepted; this test never edits a real Beads store.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");
const bead = (id, extra = {}) => ({
  id, title: id, issue_type: "task", status: "open", priority: 2,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  labels: [], dependencies: [], ...extra,
});
const dep = (id, target, type = "blocks") => ({ issue_id: id, depends_on_id: target, type });
const beads = [
  bead("new-a"), bead("new-b"), bead("finished", { status: "closed" }),
  bead("linked-a", { dependencies: [dep("linked-a", "linked-b")] }), bead("linked-b"),
  bead("epic", { issue_type: "epic" }),
  bead("nested", { issue_type: "epic", dependencies: [dep("nested", "epic", "parent-child")] }),
  bead("child", { dependencies: [dep("child", "nested", "parent-child")] }),
  bead("archived", { labels: ["archived"] }),
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await page.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let connection;
  await page.route("**/api/p/demo/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (pathname.endsWith("/deps") && req.method() === "POST") {
      connection = req.postDataJSON();
      const source = beads.find((b) => b.id === "new-a");
      source.dependencies.push(dep(source.id, connection.depends_on_id));
      return route.fulfill({ json: source });
    }
    if (pathname.endsWith("/beads")) {
      return route.fulfill({ json: { beads, meta: {
        kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"],
        pollIntervalMs: 300000, readOnly: false,
      } } });
    }
    if (pathname.endsWith("/beads/stream")) return route.abort();
    const item = beads.find((b) => pathname.endsWith(`/beads/${b.id}`));
    return route.fulfill({ json: item ?? {} });
  });
  await page.goto(`${base}/p/demo`);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await page.locator(".react-flow__node").first().waitFor();
  const ids = () => page.locator(".react-flow__node").evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-id")).sort());
  assert.deepEqual(await ids(), beads.filter((b) => b.id !== "archived").map((b) => b.id).sort(),
    "Default graph must include closed and unlinked beads exactly once");
  const filter = page.getByRole("checkbox", { name: "Live dependencies only" });
  await filter.check();
  await page.locator('.react-flow__node[data-id="finished"]').waitFor({ state: "detached" });
  assert.deepEqual(await ids(), ["child", "epic", "linked-a", "linked-b", "nested"]);
  await filter.uncheck();
  const source = page.locator('.react-flow__node[data-id="new-a"] .react-flow__handle.source');
  const target = page.locator('.react-flow__node[data-id="new-b"] .react-flow__handle.target');
  await source.waitFor();
  const a = await source.boundingBox();
  const b = await target.boundingBox();
  assert.ok(a && b);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__edge").length === 4);
  assert.deepEqual(connection, { depends_on_id: "new-b", type: "blocks" },
    "Previously unlinked tasks must still support drag-to-link");
  await page.locator('.react-flow__node[data-id="finished"]').click();
  await page.getByTitle("Close", { exact: true }).waitFor();
  await page.getByTitle("Close", { exact: true }).click();

  beads.splice(0, beads.length, bead("unlinked"), bead("completed", { status: "closed" }));
  await page.reload();
  await page.locator('.react-flow__node[data-id="unlinked"]').waitFor();
  await page.getByRole("checkbox", { name: "Live dependencies only" }).check();
  await page.getByRole("button", { name: "Show all beads", exact: true }).click();
  await page.locator('.react-flow__node[data-id="completed"]').waitFor();
  assert.deepEqual(await ids(), ["completed", "unlinked"], "Empty filter must offer recovery");

  beads.splice(0, beads.length, ...Array.from({ length: 40 }, (_, i) => bead(`loose-${i}`)));
  await page.reload();
  await page.locator('.react-flow__node[data-id="loose-39"]').waitFor();
  assert.equal((await ids()).length, 40, "Larger graphs must retain every task");
  const positions = await page.locator(".react-flow__node").evaluateAll((nodes) => nodes.map((n) => {
    const matrix = new DOMMatrix(getComputedStyle(n).transform);
    return { x: matrix.m41, y: matrix.m42 };
  }));
  assert.ok(new Set(positions.map((p) => p.x)).size > 1, "Loose tasks must wrap into multiple columns");
  assert.ok(Math.max(...positions.map((p) => p.y)) < 3000, "Avoid an excessively tall loose-task column");
  assert.deepEqual(errors, []);
  console.log("PASS: full graph, optional pruning, unique nested epics, drag-to-link, closed-task details, empty-filter recovery, and wrapped layout");
} finally {
  await browser.close();
}
