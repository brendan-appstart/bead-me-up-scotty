// Drawer assignee regression: every project response and write is intercepted.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const bead = (id, extra = {}) => ({
  id,
  title: `Reassignment ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const target = bead("target", { assignee: "Alice" });
const beads = [target, bead("existing", { assignee: "Bob" }), bead("unassigned")];
const writes = [];
let failOnce = true;
let releasePending;
let markPending;
const pendingRequest = new Promise((resolve) => { markPending = resolve; });

const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (request.method() === "GET") {
      if (path.endsWith("/beads")) {
        return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300_000 } } });
      }
      return route.fulfill({ json: beads.find((entry) => path.endsWith(`/beads/${entry.id}`)) ?? {} });
    }

    const body = request.postDataJSON();
    writes.push({ method: request.method(), path, body });
    if (path.endsWith("/beads/target") && body.assignee === "Retry Agent" && failOnce) {
      failOnce = false;
      return route.fulfill({ status: 500, json: { error: "temporary reassignment failure" } });
    }
    if (path.endsWith("/beads/target") && body.assignee === "Slow Agent") {
      markPending();
      await new Promise((resolve) => { releasePending = resolve; });
    }
    const changed = beads.find((entry) => path.endsWith(`/beads/${entry.id}`));
    if (changed) Object.assign(changed, body);
    return route.fulfill({ json: changed ?? {} });
  });

  await page.goto(`${base}/p/demo`);
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).waitFor({ state: "detached" });
  await page.getByText("Reassignment target", { exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: "Reassignment target", exact: true }).waitFor();
  const change = () => drawer.getByRole("button", { name: "Change assignee", exact: true });
  const editor = () => drawer.locator('[aria-label="Assignee"]');
  const save = () => drawer.getByRole("button", { name: "Save assignee", exact: true });
  const cancel = () => drawer.getByRole("button", { name: "Cancel assignee edit", exact: true });
  const comment = drawer.getByPlaceholder(/^Comment as/);
  await comment.fill("Keep this comment draft through reassignment.");

  // Names offered by the datalist are useful defaults, but do not constrain assignment.
  await change().click();
  await editor().waitFor();
  assert.equal(await editor().getAttribute("placeholder"), "Unassigned");
  const suggestions = await editor().evaluate((input) => [...(input.list?.options ?? [])].map((option) => option.value));
  assert.ok(suggestions.includes("Alice"), "existing assignees are suggested");
  assert.ok(suggestions.includes("Bob"), "every fixture assignee is suggested");
  assert.ok(suggestions.includes("reviewer"), "the current human actor is suggested");
  await editor().fill("New Agent");
  await editor().press("Enter");
  await save().waitFor({ state: "detached" });
  assert.deepEqual(writes[0], { method: "PATCH", path: "/api/p/demo/beads/target", body: { assignee: "New Agent" } }, "saving a new arbitrary assignee patches only assignee");
  assert.equal(await comment.inputValue(), "Keep this comment draft through reassignment.", "assignee saves do not disturb the comment draft");
  assert.equal(await drawer.count(), 1, "assignee saves leave the drawer open");

  // A reload reads the updated intercepted fixture, proving the UI did not merely retain local text.
  await page.reload();
  await drawer.getByRole("heading", { name: "Reassignment target", exact: true }).waitFor();
  await change().click();
  assert.equal(await editor().inputValue(), "New Agent", "reload shows the persisted fixture assignee");
  await editor().fill("");
  await editor().press("Enter");
  await save().waitFor({ state: "detached" });
  await comment.fill("Keep this comment draft through reassignment.");
  assert.deepEqual(writes[1], { method: "PATCH", path: "/api/p/demo/beads/target", body: { assignee: "" } }, "clearing uses an empty assignee patch");

  const beforeCancel = writes.length;
  await change().click();
  await editor().fill("Do Not Save");
  await editor().press("Escape");
  await editor().waitFor({ state: "detached" });
  assert.equal(writes.length, beforeCancel, "Escape cancels without a write");
  assert.equal(await drawer.count(), 1, "Escape cancels assignee editing without closing the drawer");
  assert.equal(await change().isEnabled(), true);

  await change().click();
  await editor().fill("Retry Agent");
  await save().click();
  await page.getByText(/temporary reassignment failure/i).waitFor();
  assert.equal(await editor().inputValue(), "Retry Agent", "a failed save retains the exact assignee draft");
  assert.equal(await comment.inputValue(), "Keep this comment draft through reassignment.", "a failed save retains the comment draft too");
  await save().click();
  await save().waitFor({ state: "detached" });
  assert.deepEqual(writes.slice(2, 4), [
    { method: "PATCH", path: "/api/p/demo/beads/target", body: { assignee: "Retry Agent" } },
    { method: "PATCH", path: "/api/p/demo/beads/target", body: { assignee: "Retry Agent" } },
  ], "failure retries exactly the same assignee-only patch");

  await change().click();
  await editor().fill("Slow Agent");
  await save().dblclick();
  await pendingRequest;
  assert.equal(writes.filter((write) => write.body.assignee === "Slow Agent").length, 1, "pending saves suppress duplicate requests");
  await page.waitForFunction(() => document.querySelector('[aria-label="Save assignee"]')?.disabled === true);
  assert.equal(await editor().isDisabled(), true, "pending writes freeze the submitted draft");
  assert.equal(await cancel().isDisabled(), true, "pending writes cannot be cancelled locally");
  releasePending();
  await save().waitFor({ state: "detached" });

  // Toggling viewer mode while an editor is visible locks every reassignment control and sends nothing.
  await change().click();
  await editor().fill("Never Written");
  const beforeReadOnly = writes.length;
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: true } });
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).waitFor();
  assert.equal(await editor().isDisabled(), true);
  assert.equal(await save().isDisabled(), true);
  assert.equal(await cancel().isDisabled(), true);
  await page.reload();
  await drawer.getByRole("heading", { name: "Reassignment target", exact: true }).waitFor();
  assert.equal(await change().isDisabled(), true, "read-only drawer retains a disabled reassignment control");
  assert.equal(writes.length, beforeReadOnly, "read-only mode never sends an assignee write");
  writes.forEach((write) => assert.deepEqual(Object.keys(write.body), ["assignee"], "assignee writes carry no unrelated fields"));

  console.log("PASS: drawer assignee editing supports arbitrary names, clear/cancel/retry/pending behavior, persistence, drafts, and read-only guards");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}
