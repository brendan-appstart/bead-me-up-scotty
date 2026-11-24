// Activity view: the Agents and Pipeline rows toggle stacking filters on the feed.
// Isolated demo server only; project data is intercepted and never written.
//   BEADS_DEMO=1 SCOTTY_READ_ONLY=1 npm run start -- --port 3197
//   SCOTTY_TEST_URL=http://localhost:3197 node scripts/test-activity-pipeline.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");

const now = Date.now();
const ago = (min) => new Date(now - min * 60_000).toISOString();

const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 1,
  labels: [],
  dependencies: [],
  created_at: ago(600),
  updated_at: ago(600),
  ...extra,
});

const beads = [
  bead("t-ready", "Ready task"),
  bead("t-wip", "Work in progress", { status: "in_progress" }),
  bead("t-done", "Finished task", { status: "closed" }),
  bead("t-epic", "Big epic", { issue_type: "epic" }),
  bead("t-arch", "Archived task", { labels: ["archived"] }),
];

const ev = (id, actor, issueId, min, action = "commented") => ({
  id,
  issueId,
  title: beads.find((b) => b.id === issueId)?.title ?? "Deleted bead",
  actor,
  origin: actor === "Reviewer" ? "human" : "agent",
  action,
  at: ago(min),
});

const items = [
  ev("e1", "main/t-wip@host", "t-wip", 2),
  ev("e2", "Reviewer", "t-ready", 12, "created"),
  ev("e3", "main/t-wip@host", "t-done", 40, "closed"),
  ev("e4", "Reviewer", "t-wip", 50),
  ev("e5", "ghost-agent", "t-gone", 90),
  // An archived bead in an otherwise-Ready state: hidden from the Pipeline
  // counts, so a Ready filter must not show its events either.
  ev("e6", "Reviewer", "t-arch", 120),
];
const ALL = items.map((i) => i.id);

const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.setDefaultTimeout(7000);
  page.on("pageerror", (e) => errors.push(e.message));
  let activity = items;
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/activity")) return route.fulfill({ json: { items: activity } });
    if (path.endsWith("/beads")) {
      return route.fulfill({
        json: { beads, meta: { kind: "demo", humanActor: "Reviewer", humanAllowlist: ["Reviewer"] } },
      });
    }
    return route.fulfill({ json: beads.find((b) => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });

  await page.goto(`${base}/p/demo?view=activity`);
  await page.getByRole("heading", { name: "Activity", exact: true }).waitFor();

  // Compare event ids, not bead ids: a bead can carry several events from
  // different actors, and the wrong one must not pass for the right one.
  const feed = () => page.locator("main ol > li [data-activity-event]");
  const feedIds = async () => feed().evaluateAll((els) => els.map((e) => e.getAttribute("data-activity-event")));
  const expectFeed = async (want, message) => {
    const deadline = Date.now() + 5000;
    let got = await feedIds();
    while (JSON.stringify(got) !== JSON.stringify(want) && Date.now() < deadline) {
      await page.waitForTimeout(50);
      got = await feedIds();
    }
    assert.deepEqual(got, want, message);
  };
  const agent = (name) => page.locator(`[data-activity-actor="${name}"]`);
  const stage = (id) => page.locator(`[data-activity-stage="${id}"]`);
  const params = (key) => new URL(page.url()).searchParams.getAll(key);

  await expectFeed(ALL, "unfiltered feed shows every event");

  // Agents row: newest actor first, freshness dot from the latest event.
  const actors = await page.locator("[data-activity-actor]").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-activity-actor")),
  );
  assert.deepEqual(actors, ["main/t-wip@host", "Reviewer", "ghost-agent"]);
  assert.equal(await agent("main/t-wip@host").locator("[title^='Active']").count(), 1);
  assert.equal(await agent("Reviewer").locator("[title^='Quiet']").count(), 1);
  assert.equal(await agent("ghost-agent").locator("[title^='Silent']").count(), 1);
  await page.getByText("1 active now").waitFor();

  // Pipeline row: counts follow the Board columns; archived beads are skipped,
  // epics counted with their own breakdown.
  assert.match(await stage("ready").innerText(), /READY\s*2\s*1 task · 1 epic/i);
  assert.match(await stage("in_progress").innerText(), /1\s*1 task/i);
  assert.match(await stage("done").innerText(), /1\s*1 task/i);
  assert.doesNotMatch(await stage("ready").innerText(), /t-arch/);

  // The "?" help opens a structured popover (title, paragraphs, dot legend).
  await page.getByRole("button", { name: "About the Agents row" }).hover();
  const help = page.locator('[data-activity-help="Agents"]');
  await help.waitFor();
  assert.equal(await help.locator("p").count(), 2, "help is split into paragraphs");
  assert.equal(await help.locator("li").count(), 3, "help lists the three freshness dots");
  await page.mouse.move(1400, 950);
  await help.waitFor({ state: "hidden" });

  // One actor.
  await agent("Reviewer").click();
  await expectFeed(["e2", "e4", "e6"], "actor filter keeps only Reviewer's events");
  assert.deepEqual(params("actor"), ["Reviewer"]);
  assert.equal(await agent("Reviewer").getAttribute("aria-pressed"), "true");

  // A second actor ORs.
  await agent("main/t-wip@host").click();
  await expectFeed(["e1", "e2", "e3", "e4", "e6"], "two actors OR together");
  assert.deepEqual(params("actor"), ["Reviewer", "main/t-wip@host"]);

  // A stage ANDs with the actors.
  await stage("in_progress").click();
  await expectFeed(["e1", "e4"], "stage filter ANDs with the actor filter");
  assert.deepEqual(params("stage"), ["in_progress"]);
  await page.getByText("2 of 6 events").waitFor();

  // Clicking the same card again toggles it off.
  await agent("main/t-wip@host").click();
  await expectFeed(["e4"], "toggling an actor off removes only that actor");
  assert.deepEqual(params("actor"), ["Reviewer"]);

  // The chip bar removes one filter at a time.
  await page.getByRole("button", { name: "Remove filter In Progress" }).click();
  await expectFeed(["e2", "e4", "e6"], "removing the stage chip keeps the actor");
  assert.deepEqual(params("stage"), []);

  // Empty state, with its own Clear.
  await agent("Reviewer").click();
  await agent("ghost-agent").click();
  await stage("done").click();
  await page.locator("[data-activity-empty]").waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expectFeed(ALL, "Clear filters restores the feed");
  assert.deepEqual([...params("actor"), ...params("stage")], []);
  assert.equal(new URL(page.url()).searchParams.get("view"), "activity", "keeps the view param");

  // The selection survives a reload and Back undoes a toggle.
  await stage("ready").click();
  await expectFeed(["e2"], "Ready keeps live beads only: the archived bead's event e6 is out");
  await page.reload();
  await expectFeed(["e2"], "filters survive a reload");
  await page.goBack();
  await expectFeed(ALL, "Back undoes the last toggle");

  // No activity at all: the Pipeline still shows where beads sit, the Agents
  // row is gone, and a stage filter already in the URL can still be removed.
  activity = [];
  await page.goto(`${base}/p/demo?view=activity&stage=ready`);
  await page.getByText("No activity yet.").waitFor();
  await stage("ready").waitFor();
  assert.equal(await page.locator("[data-activity-actor]").count(), 0, "no Agents row without actors");
  await page.getByRole("button", { name: "Remove filter Ready" }).click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("stage"));

  assert.deepEqual(errors, [], "no page errors");
  console.log("PASS: activity agents and pipeline rows toggle stacking feed filters");
} finally {
  await browser.close();
}
