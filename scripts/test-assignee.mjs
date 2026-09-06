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
  priority: 1,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const beads = [
  bead("alice-alpha", "Alice alpha task", { assignee: "Alice", labels: ["alpha"] }),
  bead("alice-beta", "Alice beta task", { assignee: "Alice", labels: ["beta"] }),
  bead("bob-alpha", "Bob alpha task", { assignee: "Bob", labels: ["alpha"] }),
  bead("carol-alpha", "Carol alpha task", { assignee: "Carol", labels: ["alpha"] }),
  bead("blank-alpha", "Blank alpha task", { assignee: "   ", labels: ["alpha"] }),
  bead("missing-beta", "Missing beta task", { labels: ["beta"] }),
  bead("literal-sentinel", "Literal sentinel task", { assignee: "__unassigned__", labels: ["alpha"] }),
];

const allIds = beads.map((b) => b.id).sort();
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(7000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      return route.fulfill({
        json: { beads, meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"] } },
      });
    }
    return route.fulfill({ json: beads.find((b) => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });
  await page.goto(`${base}/p/demo`);
  await page.getByRole("heading", { name: "Board", exact: true }).waitFor();
  await page.getByText("Alice alpha task", { exact: true }).waitFor();

  const assignee = () => page.getByRole("button", { name: /^Assignee/ });
  const labels = () => page.getByRole("button", { name: /^Labels/ });
  const option = (name) => page.getByRole("menuitemcheckbox", { name, exact: true });
  const clearAll = () => page.getByTitle("Clear all filters", { exact: true });
  const cardIds = async (view) => {
    const cards = view === "Board" ? page.locator("main section article") : page.locator("main [role=button]");
    const text = await cards.allTextContents();
    return beads.filter((b) => text.some((card) => card.includes(b.id))).map((b) => b.id).sort();
  };
  const expectIds = async (view, wanted, message) => {
    for (const id of wanted) await page.getByTitle(`Copy ${id}`, { exact: true }).waitFor();
    assert.deepEqual(await cardIds(view), [...wanted].sort(), `${view}: ${message}`);
  };
  const selectAssignees = async (...names) => {
    await assignee().click();
    for (const name of names) await option(name).click();
    await page.keyboard.press("Escape");
  };

  async function exerciseView(view) {
    await expectIds(view, allIds, "initially shows all fixture beads");
    await assignee().click();
    await option("Alice").click();
    await option("Bob").click();
    // The unselected facets are still offered from the complete, unfiltered fixture set.
    assert.equal(await option("Carol").count(), 1, `${view}: Carol remains selectable after filtering`);
    assert.equal(await option("Unassigned").count(), 1, `${view}: Unassigned remains selectable after filtering`);
    await page.keyboard.press("Escape");
    await expectIds(view, ["alice-alpha", "alice-beta", "bob-alpha"], "multiple assignees match as OR");

    await labels().click();
    await option("alpha").click();
    await page.keyboard.press("Escape");
    await expectIds(view, ["alice-alpha", "bob-alpha"], "assignee selection ANDs with labels");

    await clearAll().click();
    await expectIds(view, allIds, "clear-all restores every bead");

    await selectAssignees("Unassigned");
    await expectIds(view, ["blank-alpha", "missing-beta"], "blank and missing assignees match Unassigned only");
    await clearAll().click();

    await selectAssignees("__unassigned__");
    await expectIds(view, ["literal-sentinel"], "literal sentinel-like usernames remain independent");
    await clearAll().click();
  }

  await exerciseView("Board");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("heading", { name: "List", exact: true }).waitFor();
  await exerciseView("List");
  assert.deepEqual(errors, []);
  console.log("PASS: Board and List assignee facet OR matching, Unassigned normalization, facet intersection, stable options, clear-all, and sentinel-like usernames");
} finally {
  await browser.close();
}
