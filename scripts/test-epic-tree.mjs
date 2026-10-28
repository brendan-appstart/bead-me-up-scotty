// Nested epics render as one expandable tree instead of duplicated top-level
// cards (GH #40). Isolated demo server only; project data is intercepted and
// never written.
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

// Three nested epic levels with a task under the deepest one, a second root,
// and a closed epic whose open child must survive "hide closed".
const beads = [
  bead("root-epic", "Root epic", { issue_type: "epic" }),
  bead("child-epic", "Child epic", {
    issue_type: "epic",
    dependencies: [parent("child-epic", "root-epic")],
  }),
  bead("grandchild-epic", "Grandchild epic", {
    issue_type: "epic",
    dependencies: [parent("grandchild-epic", "child-epic")],
  }),
  bead("deep-task", "Deep task", { dependencies: [parent("deep-task", "grandchild-epic")] }),
  bead("other-root", "Other root epic", { issue_type: "epic" }),
  bead("closed-epic", "Closed epic", { issue_type: "epic", status: "closed" }),
  bead("closed-epic-task", "Task under the closed epic", {
    dependencies: [parent("closed-epic-task", "closed-epic")],
  }),
];

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

  await page.goto(`${base}/p/demo`);
  await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Epics/ }).click();
  await page.getByRole("heading", { name: "Epics", exact: true }).waitFor();

  const card = (id) => page.locator(`[data-epic-id="${id}"]`);
  const row = (id) => card(id).getByRole("button").first();

  // Collapsed by default, only root epics are cards at all: a nested epic is
  // not rendered until its parent expands, so it cannot be duplicated as a
  // top-level card. The closed epic stays hidden and takes its task with it,
  // exactly as the flat screen did.
  assert.equal(await page.locator("[data-epic-id]").count(), 2,
    "only the two open root epics render while everything is collapsed");
  assert.equal(await card("child-epic").count(), 0, "a nested epic is not a top-level card");
  assert.equal(await card("closed-epic").count(), 0, "closed epics stay hidden by default");
  assert.equal(await page.getByText("Task under the closed epic").count(), 0,
    "a task under a hidden epic is not orphaned onto the screen");

  // Expanding a root reveals the nested epic as a card inside it, one level at
  // a time.
  await row("root-epic").click();
  await card("child-epic").waitFor();
  assert.equal(await row("root-epic").getAttribute("aria-expanded"), "true",
    "the expanded root reports its state");
  assert.equal(await card("grandchild-epic").count(), 0, "the next level stays collapsed");
  await row("child-epic").click();
  await card("grandchild-epic").waitFor();
  await row("grandchild-epic").click();
  await page.getByText("Deep task").waitFor();
  assert.equal(await card("grandchild-epic").getByText("Deep task").count(), 1,
    "the task under the deepest epic renders inside it");

  // Collapsing the root takes the whole nested subtree out of the DOM again.
  await row("root-epic").click();
  await card("child-epic").waitFor({ state: "detached" });
  assert.equal(await card("grandchild-epic").count(), 0, "the subtree leaves with the root");

  // Show Closed brings the closed epic back as one more card — and the nested
  // epic is still a single card, not a duplicate of a top-level one.
  await page.getByRole("button", { name: "Show Closed", exact: true }).click();
  await card("closed-epic").waitFor();
  assert.equal(await page.locator("[data-epic-id]").count(), 3,
    "every visible epic is a card exactly once");
  await row("root-epic").click();
  assert.equal(await card("child-epic").count(), 1,
    "the nested epic is not duplicated as a top-level card");

  assert.deepEqual(errors, []);
  console.log("PASS: nested epic tree, one-level-at-a-time expansion, closed-epic hiding, no duplication, no page errors");
} finally {
  await browser.close();
}
