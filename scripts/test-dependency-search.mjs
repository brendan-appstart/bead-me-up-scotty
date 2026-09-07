// Drawer dependency picker regression: fixtures and writes never leave this isolated demo server.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to the isolated server on port 43188");
const bead = (id, title = id, extra = {}) => ({
  id, title, status: "open", issue_type: "task", priority: 2, labels: [], dependencies: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...extra,
});
const dep = (type, depends_on_id) => ({ type, depends_on_id });
const beads = [
  bead("current", "Current dependency host", { dependencies: [dep("blocks", "linked"), dep("parent-child", "parent")] }),
  bead("linked", "Already linked target"), bead("parent", "Hierarchy target"),
  bead("a-2", "Second candidate"), bead("a-10", "Tenth candidate"), bead("a-1", "First candidate"),
  bead("exact-id", "Another candidate"), bead("title-match", "contains EXACT-ID in its title"),
  bead("closed-free", "Closed but eligible", { status: "closed" }),
  ...Array.from({ length: 62 }, (_, i) => bead(`bulk-${String(i).padStart(2, "0")}`, `Untruncated candidate ${i}: this deliberately exceeds forty characters`)),
];
const writes = [];
let failOnce = true;
let releasePending;
let pendingResolve;
const pending = new Promise((resolve) => { pendingResolve = resolve; });

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
      if (path.endsWith("/beads")) return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300_000 } } });
      return route.fulfill({ json: beads.find((b) => path.endsWith(`/beads/${b.id}`)) ?? {} });
    }
    const body = request.postDataJSON();
    writes.push({ method: request.method(), path, body });
    if (body.depends_on_id === "exact-id" && failOnce) {
      failOnce = false;
      return route.fulfill({ status: 500, json: { error: "temporary dependency failure" } });
    }
    if (body.depends_on_id === "bulk-00") {
      pendingResolve();
      await new Promise((resolve) => { releasePending = resolve; });
    }
    const source = beads.find((b) => path.endsWith(`/beads/${b.id}/deps`));
    source.dependencies.push(dep(body.type, body.depends_on_id));
    return route.fulfill({ json: source });
  });

  await page.goto(`${base}/p/demo`);
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  await page.getByText("Current dependency host", { exact: true }).first().click();
  const drawer = page.getByRole("dialog");
  const addDependency = () => drawer.getByRole("button", { name: "Add dependency", exact: true });
  const search = () => drawer.getByRole("combobox", { name: "Search dependency beads", exact: true });
  const add = () => drawer.getByRole("button", { name: "Add", exact: true });
  const cancel = () => drawer.getByRole("button", { name: "Cancel dependency", exact: true });
  const options = () => drawer.getByRole("listbox").getByRole("option");
  const comment = drawer.getByPlaceholder(/^Comment as/);
  await comment.fill("Preserve this comment through dependency writes.");

  await addDependency().click();
  await search().waitFor();
  assert.equal(await search().getAttribute("placeholder"), "Search by ID or title…");
  assert.equal(await options().filter({ hasText: "Current dependency host" }).count(), 0, "current bead is never a candidate");
  assert.equal(await options().filter({ hasText: "Already linked target" }).count(), 0, "existing outgoing link is excluded");
  assert.equal(await options().filter({ hasText: "Hierarchy target" }).count(), 0, "existing parent-child link is excluded");
  assert.equal(await options().filter({ hasText: "Closed but eligible" }).count(), 1, "closed but unlinked beads stay eligible");
  assert.equal(await options().count(), 68, "the picker does not quietly cap candidates");
  const initialIds = await options().evaluateAll((els) => els.slice(0, 3).map((el) => el.getAttribute("data-value")));
  assert.deepEqual(initialIds, ["a-1", "a-2", "a-10"], "default candidates use natural ID order");
  assert.match(await options().filter({ hasText: "Untruncated candidate 61" }).innerText(), /this deliberately exceeds forty characters/, "full titles are rendered without truncation");
  await search().fill("no-such-dependency");
  await drawer.getByText("No matching beads.", { exact: true }).waitFor();
  assert.equal(await options().count(), 0, "unmatched queries show an empty list");
  assert.equal(await add().isDisabled(), true, "empty results cannot be submitted");

  // Keyboard movement changes cmdk's highlighted item; Enter selects it without submitting a write.
  await search().fill("a-");
  const highlighted = () => drawer.locator('[cmdk-item][data-selected="true"]');
  await page.waitForFunction(() => document.querySelector('[cmdk-item][data-selected="true"]')?.getAttribute('data-value') === 'a-1');
  await search().press("ArrowDown");
  assert.equal(await highlighted().getAttribute("data-value"), "a-2", "ArrowDown moves to the next candidate");
  await search().press("ArrowUp");
  assert.equal(await highlighted().getAttribute("data-value"), "a-1", "ArrowUp moves back to the first candidate");
  await search().press("Enter");
  await drawer.getByRole("button", { name: "Clear selected bead", exact: true }).waitFor();
  assert.match(await drawer.getByText("First candidate", { exact: true }).innerText(), /First candidate/);
  assert.equal(writes.length, 0, "keyboard selection does not write");
  await drawer.getByRole("button", { name: "Clear selected bead", exact: true }).click();
  await search().waitFor();
  assert.equal(await search().inputValue(), "", "clearing selection restores an empty searchable list");
  assert.equal(await options().count(), 68, "clearing restores every eligible candidate");

  await search().fill("EXACT-id");
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 2);
  const matchIds = await options().evaluateAll((els) => els.map((el) => el.getAttribute("data-value")));
  assert.deepEqual(matchIds, ["exact-id", "title-match"], "case-insensitive matches prioritize exact ID before title matches");
  await search().press("Enter");
  await drawer.getByRole("button", { name: "Clear selected bead", exact: true }).waitFor();
  assert.equal(writes.length, 0, "Enter chooses the highlighted bead and does not write");
  const type = drawer.getByLabel("Dependency type", { exact: true });
  assert.equal(await type.inputValue(), "blocks");
  assert.equal(await type.locator('option[value="blocks"]').innerText(), "blocked by");
  assert.equal(await type.locator('option[value="related"]').innerText(), "related");
  await type.selectOption("related");
  await add().click();
  await page.getByText(/temporary dependency failure/i).waitFor();
  assert.equal(await drawer.getByRole("button", { name: "Clear selected bead", exact: true }).count(), 1, "failed writes retain the selected target");
  assert.equal(await type.inputValue(), "related", "failed writes retain the chosen dependency type");
  assert.equal(await comment.inputValue(), "Preserve this comment through dependency writes.");
  await add().click();
  await add().waitFor({ state: "detached" });
  assert.deepEqual(writes.slice(0, 2), [
    { method: "POST", path: "/api/p/demo/beads/current/deps", body: { depends_on_id: "exact-id", type: "related" } },
    { method: "POST", path: "/api/p/demo/beads/current/deps", body: { depends_on_id: "exact-id", type: "related" } },
  ], "retry posts the requested target and type");
  assert.equal(await comment.inputValue(), "Preserve this comment through dependency writes.", "successful writes preserve the comment draft");

  await addDependency().click();
  await search().waitFor();
  assert.equal(await search().inputValue(), "", "successful editor reopening resets its search");
  assert.equal(await drawer.locator('[cmdk-item][data-value="exact-id"]').count(), 0, "newly linked target is excluded on reopen");
  await search().fill("bulk-00");
  await search().press("Enter");
  await add().dblclick();
  await pending;
  assert.equal(writes.filter((w) => w.body.depends_on_id === "bulk-00").length, 1, "pending add dedupes double clicks");
  const clearSelected = drawer.getByRole("button", { name: "Clear selected bead", exact: true });
  await clearSelected.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.querySelector('[aria-label="Clear selected bead"]')?.disabled === true);
  assert.equal(await clearSelected.isDisabled(), true, "pending add freezes the selected target");
  assert.equal(await type.isDisabled(), true, "pending add freezes the type");
  assert.equal(await add().isDisabled(), true, "pending add disables submission");
  assert.equal(await cancel().isDisabled(), true, "pending add cannot be cancelled");
  releasePending();
  await add().waitFor({ state: "detached" });
  assert.deepEqual(writes.at(-1), { method: "POST", path: "/api/p/demo/beads/current/deps", body: { depends_on_id: "bulk-00", type: "blocks" } }, "the default blocked-by type posts the canonical dependency direction");

  await addDependency().click();
  await search().fill("a-1");
  await cancel().click();
  await search().waitFor({ state: "detached" });
  assert.equal(await drawer.count(), 1, "Cancel dependency only closes the editor");
  await addDependency().click();
  await search().press("Escape");
  await search().waitFor({ state: "detached" });
  assert.equal(await drawer.count(), 1, "Escape only closes the editor");

  await addDependency().click();
  await search().fill("a-2");
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: true } });
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).waitFor();
  assert.equal(await search().isDisabled(), true, "read-only freezes an open dependency editor");
  assert.equal(await add().isDisabled(), true, "read-only prevents new dependency writes");
  assert.equal(await options().first().getAttribute("aria-disabled"), "true", "read-only cmdk options are explicitly disabled");
  assert.equal(writes.length, 3, "cancellation and read-only mode send no additional writes");
  console.log("PASS: dependency search filters, ranks, selection, retries, pending state, cancellation, draft retention, and read-only guards");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}
