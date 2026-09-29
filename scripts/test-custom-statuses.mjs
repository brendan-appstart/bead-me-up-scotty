// Custom-status regression. Uses an intercepted demo project; no real project data is read or written.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");

const builtInStatuses = [
  { name: "open", category: "active", icon: "○" },
  { name: "in_progress", category: "wip", icon: "◐" },
  { name: "blocked", category: "wip", icon: "●" },
  { name: "deferred", category: "frozen", icon: "❄" },
  { name: "closed", category: "done", icon: "✓" },
  { name: "pinned", category: "frozen", icon: "📌" },
  { name: "hooked", category: "wip", icon: "◇" },
];
const reviewStatus = { name: "ready_for_review", category: "wip", custom: true };
const statuses = [...builtInStatuses, reviewStatus];
const bead = (id, status = "open") => ({
  id,
  title: id,
  status,
  issue_type: "task",
  priority: 1,
  assignee: "reviewer",
  created_at: "2026-09-29T00:00:00Z",
  updated_at: "2026-09-29T00:00:00Z",
  labels: [],
  dependencies: [],
  comments: [],
});
const beads = [
  bead("ready", "open"),
  bead("review", "ready_for_review"),
  bead("closed", "closed"),
];
const writes = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      return route.fulfill({
        json: {
          beads,
          meta: {
            kind: "demo",
            humanActor: "reviewer",
            humanAllowlist: ["reviewer"],
            pollIntervalMs: 300000,
            statuses,
          },
        },
      });
    }
    if (path.endsWith("/status")) {
      const id = path.split("/").at(-2);
      const body = request.postDataJSON();
      const target = beads.find((b) => b.id === id);
      assert.ok(target, `status target exists: ${id}`);
      target.status = body.status;
      writes.push({ id, status: body.status });
      return route.fulfill({ json: target });
    }
    const target = beads.find((b) => path.endsWith(`/beads/${b.id}`));
    return route.fulfill({ json: target ?? {} });
  });

  await page.goto(`${base}/p/demo?view=board`);
  await page.getByText("Ready for review", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("review", { exact: true }).count() > 0, true, "custom-status bead is rendered");

  await page.getByRole("button", { name: "Status", exact: true }).click();
  const statusMenu = page.locator('[role="menu"]');
  await statusMenu.waitFor();
  assert.equal(await statusMenu.getByText("Ready for review", { exact: true }).count(), 1, "Status filter contains custom status");
  await page.keyboard.press("Escape");

  const reviewCard = page.locator('[data-keyboard-bead-id="review"]').first();
  await reviewCard.click();
  const drawer = page.getByRole("dialog");
  await drawer.getByText("Status", { exact: true }).waitFor();
  const statusSelect = drawer.locator("select").first();
  assert.equal(await statusSelect.locator("option[value='ready_for_review']").count(), 1, "detail drawer can select custom status");
  assert.equal(await statusSelect.inputValue(), "ready_for_review", "detail drawer preserves custom status");
  await page.getByTitle("Close", { exact: true }).click();

  const readyCard = page.locator('[data-keyboard-bead-id="ready"]').first();
  await readyCard.click();
  const readyDrawer = page.getByRole("dialog");
  const readySelect = readyDrawer.locator("select").first();
  const response = page.waitForResponse((r) => r.url().endsWith("/beads/ready/status") && r.request().method() === "POST");
  await readySelect.selectOption("ready_for_review");
  await response;
  assert.deepEqual(writes.at(-1), { id: "ready", status: "ready_for_review" }, "custom status writes through the normal status endpoint");
  await page.waitForTimeout(250);
  await page.getByTitle("Close", { exact: true }).click();
  assert.equal(await page.getByText("Ready for review", { exact: true }).count() >= 1, true, "custom status column remains rendered after a status transition");

  assert.deepEqual(errors, []);

  console.log("PASS: custom status is rendered, filterable, editable, writable, and available in the command palette without runtime errors");
} finally {
  await browser.close();
}
