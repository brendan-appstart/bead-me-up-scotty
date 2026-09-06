// Browser regression fixture for URL-addressable bead drawers and copy links.
// It intercepts every project request and never reaches a Beads database.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to the running demo server");

const bead = (id, title, extra = {}) => ({
  id, title, status: "open", issue_type: "task", priority: 2, labels: [], dependencies: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...extra,
});
const beads = [
  bead("parent", "Parent bead", { issue_type: "epic" }),
  bead("child", "Child bead", { dependencies: [{ type: "parent-child", depends_on_id: "parent" }] }),
  bead("dependency", "Dependency bead"),
  bead("blocked", "Blocked bead", { dependencies: [{ type: "blocks", depends_on_id: "dependency" }] }),
];

const browser = await chromium.launch();
let page;
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { copied.push(text); } },
    });
    window.__copiedLinks = copied;
  });

  let failBeadsLoad = false;
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: true } }));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      if (failBeadsLoad) return route.fulfill({ status: 500, json: { error: "fixture data load failed" } });
      return route.fulfill({ json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 250 } } });
    }
    return route.fulfill({ json: {} });
  });

  // First visit remains Board; opening through a query preserves unrelated URL state.
  await page.goto(`${base}/p/demo?bead=child&custom=keep#anchor`);
  await page.getByRole("dialog").getByText("Child bead", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("bead"), "child");
  assert.equal(await page.getByRole("heading", { name: "Focus", exact: true }).count(), 0, "a query-opened drawer must not opt into Focus");
  await page.reload();
  await page.getByRole("dialog").getByText("Child bead", { exact: true }).waitFor();
  assert.equal(page.url(), `${base}/p/demo?bead=child&custom=keep#anchor`, "reload retains the exact share URL");

  // Parent and dependency navigation update the visible bead query; drawer Back restores it.
  await page.getByRole("dialog").getByText("Parent bead", { exact: true }).click();
  await page.getByRole("dialog").getByText("Parent bead", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("bead"), "parent");
  await page.getByTitle("Back to child").click();
  await page.getByRole("dialog").getByText("Child bead", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("bead"), "child");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("article").filter({ hasText: "blocked" }).click();
  await page.getByRole("dialog").getByText("Blocked bead", { exact: true }).waitFor();
  await page.getByRole("dialog").getByText("Dependency bead", { exact: true }).click();
  await page.getByRole("dialog").getByText("Dependency bead", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("bead"), "dependency");
  await page.getByTitle("Back to blocked").click();
  await page.getByRole("dialog").getByText("Blocked bead", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("bead"), "blocked");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const closed = new URL(page.url());
  assert.equal(closed.searchParams.get("bead"), null);
  assert.equal(closed.searchParams.get("custom"), "keep");
  assert.equal(closed.hash, "#anchor");

  // The header copy action must be present under read-only mode and emit a canonical link.
  await page.locator("article").filter({ hasText: "child" }).click();
  const copy = page.getByTitle("Copy link", { exact: true });
  await copy.waitFor();
  await copy.click();
  await page.getByText(/Link copied|Copied link/i).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__copiedLinks), [`${base}/p/demo?bead=child`]);

  // A missing query bead is reported only after the initial successful list load,
  // removed without touching other query/hash state, and is not re-notified by polling.
  await page.goto(`${base}/p/demo?bead=missing&custom=still#anchor`);
  await page.getByText("Bead missing not found in this project", { exact: true }).waitFor();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("bead") === null);
  const missingUrl = new URL(page.url());
  assert.equal(missingUrl.searchParams.get("custom"), "still");
  assert.equal(missingUrl.hash, "#anchor");
  await page.waitForTimeout(800);
  assert.equal(await page.getByText("Bead missing not found in this project", { exact: true }).count(), 1, "polling must not duplicate the missing-bead toast");

  // A failed initial list fetch is an error, not evidence that an id is missing.
  failBeadsLoad = true;
  await page.goto(`${base}/p/demo?bead=unloaded&custom=keep#anchor`);
  await page.getByText(/fixture data load failed|Failed to load|Error/i).waitFor();
  assert.equal(await page.getByText("Bead unloaded not found in this project", { exact: true }).count(), 0);
  assert.equal(new URL(page.url()).searchParams.get("bead"), "unloaded", "a failed load must leave the link intact");
  assert.deepEqual(errors, []);
  console.log("PASS: query drawer links, trail synchronization, read-only copy link, missing feedback, and failed-load guard");
} catch (error) {
  console.error({ errors, url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}
