// Isolated demo server only; project data is intercepted and never written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");

const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const parent = (id, epicId) => ({ issue_id: id, depends_on_id: epicId, type: "parent-child" });

const closedEpic = bead("closed-epic", "Closed epic", { issue_type: "epic", status: "closed" });
const openChild = bead("open-child", "Open child", { dependencies: [parent("open-child", "closed-epic")] });
const closedChild = bead("closed-child", "Closed child", {
  status: "closed",
  dependencies: [parent("closed-child", "closed-epic")],
});
const beads = [closedEpic, openChild, closedChild];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(7000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      return route.fulfill({
        json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"] } },
      });
    }
    return route.fulfill({ json: beads.find((item) => path.endsWith(`/beads/${item.id}`)) ?? {} });
  });

  const epic = () => page.locator('[data-epic-id="closed-epic"]');
  const hideClosed = () => page.getByRole("button", { name: "Hide Closed", exact: true });
  const openChildDetail = async () => {
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.locator("article").filter({ hasText: "open-child" }).click();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.getByTitle("Edit title & description", { exact: true }).count(), 0,
      "read-only detail has no edit control");
    assert.equal(await page.getByTitle("Delete", { exact: true }).count(), 0,
      "read-only detail has no delete control");
    await page.getByRole("dialog").getByRole("button", { name: "Closed epic", exact: true }).click();
    await page.getByText("closed-epic", { exact: true }).last().waitFor();
    assert.equal(await page.getByTitle("Back to open-child", { exact: true }).count(), 1,
      "drawer parent navigation keeps the back trail");
    await page.getByTitle("Close", { exact: true }).click();
  };
  const navigateFromList = async () => {
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.locator('[role="button"]').filter({ hasText: "open-child" })
      .getByTitle("closed-epic · Closed epic · P2", { exact: true }).click();
    await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();
  };

  await page.goto(`${base}/p/demo`);
  await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
  await openChildDetail();
  await navigateFromList();
  await epic().waitFor();
  assert.equal(await epic().getByRole("button").first().getAttribute("aria-expanded"), "true",
    "focused closed epic expands to reveal children");
  assert.equal(await hideClosed().getAttribute("title"), "Hide closed epics and children",
    "navigating to a closed epic offers the Hide Closed action");
  await hideClosed().click();
  await epic().waitFor({ state: "detached" });

  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("button", { name: /^Epics/ }).click();
  await epic().waitFor({ state: "detached" });

  await navigateFromList();
  await epic().waitFor();
  assert.equal(await hideClosed().getAttribute("title"), "Hide closed epics and children",
    "a later parent navigation creates a fresh focus request");
  assert.deepEqual(errors, []);
  console.log("PASS: drawer parent trail, closed epic focus, authoritative hide-closed, no stale focus, repeat navigation, and read-only detail controls");
} finally {
  await browser.close();
}
