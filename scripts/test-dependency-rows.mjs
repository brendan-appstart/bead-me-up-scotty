// Isolated demo server only; all project data and dependency writes are intercepted.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");
const bead = (id, title = id, extra = {}) => ({
  id, title, status: "open", issue_type: "task", priority: 2, labels: [], dependencies: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...extra,
});
const dep = (type, depends_on_id) => ({ type, depends_on_id });
const beads = [
  bead("center", "Center" , { dependencies: [
    dep("blocks", "out-block"), dep("waits-for", "out-wait"),
    dep("conditional-blocks", "out-condition"), dep("related", "out-related"),
    dep("parent-child", "parent"), dep("blocks", "missing"),
    dep("blocks", "out-closed"),
  ] }),
  bead("out-block"), bead("out-wait"), bead("out-condition"), bead("out-related"),
  bead("parent", "Hidden hierarchy"), bead("out-closed", "Closed target", { status: "closed" }),
  bead("in-block", "Incoming blocks", { dependencies: [dep("blocks", "center")] }),
  bead("in-wait", "Incoming waits", { dependencies: [dep("waits-for", "center")] }),
  bead("in-condition", "Incoming condition", { dependencies: [dep("conditional-blocks", "center")] }),
  bead("closed-center", "Closed center", { status: "closed", dependencies: [dep("blocks", "closed-out")] }),
  bead("closed-out"),
  bead("closed-in", "Closed incoming", { dependencies: [dep("blocks", "closed-center")] }),
];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  const deletes = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) return route.fulfill({ json: { beads, meta: {
      kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300000, readOnly: true,
    } } });
    if (path.endsWith("/deps") && request.method() === "DELETE") {
      deletes.push({ path, body: request.postDataJSON() });
      return route.fulfill({ json: beads.find((b) => path.endsWith(`/beads/${b.id}/deps`)) ?? {} });
    }
    return route.fulfill({ json: beads.find((b) => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });

  await page.goto(`${base}/p/demo`);
  await page.getByText("Center", { exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Dependencies", { exact: false }).waitFor();
  const dependencies = dialog.getByText("Dependencies", { exact: true }).locator("..").locator("..");
  for (const text of ["blocked by", "waits for", "conditionally blocked by", "related", "blocks", "waited for by", "conditionally blocks"]) {
    assert.ok(await dependencies.getByText(text, { exact: true }).count(), `shows ${text}`);
  }
  await dependencies.getByText("was blocked by", { exact: true }).first().waitFor();
  assert.equal(await dependencies.getByText("Hidden hierarchy", { exact: true }).count(), 0, "parent-child must not appear as a dependency row");
  const missing = dependencies.getByRole("button", { name: /missing.*\(unknown\)/i });
  assert.equal(await missing.isDisabled(), true, "missing targets cannot be opened");
  assert.equal(await dialog.getByTitle("remove", { exact: true }).first().isDisabled(), true, "read-only mode disables dependency removal");

  await dialog.getByTitle("Open out-block", { exact: true }).click();
  await dialog.getByText("out-block", { exact: true }).first().waitFor();
  await dialog.getByTitle("Back to center", { exact: true }).click();
  await dialog.getByText("Center", { exact: true }).first().waitFor();

  await dialog.getByTitle("Close", { exact: true }).click();
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).click();
  await page.getByRole("button", { name: "Disable read-only mode", exact: true }).click();
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await page.getByText("Center", { exact: true }).first().click();
  const editable = page.getByRole("dialog");
  const removeIncoming = editable.getByTitle("Open in-block", { exact: true }).locator("xpath=..").getByTitle("remove", { exact: true });
  const incomingDeleted = page.waitForRequest((r) => r.url().endsWith("/beads/in-block/deps") && r.method() === "DELETE");
  await Promise.all([incomingDeleted, removeIncoming.click()]);
  assert.deepEqual(deletes.shift(), { path: "/api/p/demo/beads/in-block/deps", body: { depends_on_id: "center" } }, "incoming removal must remove the dependent's edge");
  const removeOutgoing = editable.getByTitle("Open out-related", { exact: true }).locator("xpath=..").getByTitle("remove", { exact: true });
  const outgoingDeleted = page.waitForRequest((r) => r.url().endsWith("/beads/center/deps") && r.method() === "DELETE");
  await Promise.all([outgoingDeleted, removeOutgoing.click()]);
  assert.deepEqual(deletes.shift(), { path: "/api/p/demo/beads/center/deps", body: { depends_on_id: "out-related" } }, "outgoing removal keeps the current bead as source");

  await editable.getByTitle("Close", { exact: true }).click();
  await page.getByText("Closed center", { exact: true }).first().click();
  const closed = page.getByRole("dialog");
  await closed.getByText("was blocked by", { exact: true }).waitFor();
  await closed.getByText("previously blocked", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: dependency rows cover outgoing/incoming blocking types, resolved state, hierarchy exclusion, navigation, read-only, and exact removal sources");
} finally {
  await browser.close();
}
