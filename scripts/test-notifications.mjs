// Isolated browser regression test. It mocks browser notifications and all
// project data, so it never creates OS notifications or touches a Beads DB.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");

const bead = (id, title, extra = {}) => ({
  id, title, status: "open", issue_type: "task", priority: 1, labels: [], dependencies: [],
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", ...extra,
});
const projectOne = "project-one";
const projectTwo = "project-two";
const projectData = {
  [projectOne]: [bead("finish-1", "Finished bead"), bead("blocked-1", "Blocked bead"), bead("human-1", "Historical escalation", { labels: ["human"] })],
  [projectTwo]: [bead("two-1", "Second project bead")],
};
let activity = [];
const activityItem = (id, action, at) => ({ id, issueId: id, title: projectData[projectOne].find((b) => b.id === id).title, actor: "agent", origin: "agent", action, at });

const browser = await chromium.launch();
let page;
const errors = [];
try {
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.setDefaultTimeout(7000);
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-06T12:00:00Z") });
  await page.addInitScript(() => {
    localStorage.setItem("bmus.notifications", JSON.stringify({ enabled: true, finished: true, blocked: true, escalation: true }));
    const readEvents = () => JSON.parse(sessionStorage.getItem("notification-events") || "[]");
    const writeEvents = (events) => sessionStorage.setItem("notification-events", JSON.stringify(events));
    class MockNotification {
      static permission = "granted";
      static instances = [];
      static async requestPermission() { return "granted"; }
      constructor(title, options) { this.title = title; this.options = options; this.closed = false; MockNotification.instances.push(this); }
      close() { this.closed = true; writeEvents([...readEvents(), { type: "close", title: this.title }]); }
    }
    window.Notification = MockNotification;
    window.__notifications = MockNotification.instances;
    window.focus = () => writeEvents([...readEvents(), { type: "focus" }]);
  });
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects: [
    { id: projectOne, name: "Project One", path: null, hasBeads: true },
    { id: projectTwo, name: "Project Two", path: null, hasBeads: true },
  ] } }));
  await page.route("**/api/p/**", async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/\/api\/p\/([^/]+)\/(.*)$/);
    const id = decodeURIComponent(match[1]);
    const tail = match[2];
    if (tail === "beads/stream") return route.abort();
    if (tail === "beads") return route.fulfill({ json: { beads: projectData[id], meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 1000 } } });
    if (tail === "activity") return route.fulfill({ json: { items: activity } });
    return route.fulfill({ json: {} });
  });

  await page.goto(`${base}/p/${encodeURIComponent(projectOne)}`);
  await page.getByText("Historical escalation", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__notifications.length), 0, "initial data does not emit historical escalation notifications");

  activity = [
    activityItem("blocked-1", "marked Blocked: waiting on review", "2026-09-06T12:00:02Z"),
    activityItem("finish-1", "closed", "2026-09-06T12:00:01Z"),
  ];
  await page.clock.fastForward(21000);
  await page.waitForFunction(() => window.__notifications.length >= 2);
  const titles = await page.evaluate(() => window.__notifications.map((n) => n.title));
  assert.ok(titles.some((title) => title.includes("finished finish-1")), "finished event notifies");
  assert.ok(titles.some((title) => title.includes("blocked-1 is blocked")), "blocked event notifies");

  projectData[projectOne].push(bead("human-2", "New escalation", { labels: ["human"] }));
  await page.clock.fastForward(1001);
  await page.waitForFunction(() => window.__notifications.some((n) => n.title.includes("Needs you: human-2")));
  const finishIndex = await page.evaluate(() => window.__notifications.findIndex((n) => n.title.includes("finished finish-1")));
  // Keep the original notification through an A -> B -> A client navigation.
  // Its callback must reach the newly mounted A shell, not the stale one.
  await page.getByRole("button", { name: "Project One" }).click();
  await page.getByText("Project Two", { exact: true }).click();
  await page.getByText("Second project bead", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Project Two" }).click();
  await page.getByText("Project One", { exact: true }).click();
  await page.getByText("Historical escalation", { exact: true }).waitFor();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.evaluate((index) => window.__notifications[index].onclick(), finishIndex);
  await page.getByRole("dialog").getByText("Finished bead", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate((index) => ({ closed: window.__notifications[index].closed, events: JSON.parse(sessionStorage.getItem("notification-events") || "[]") }), finishIndex), { closed: true, events: [{ type: "close", title: "🤖 agent finished finish-1" }, { type: "focus" }] }, "same-project activation closes and focuses the browser notification");
  await page.getByRole("button", { name: /Close/ }).click();

  const blockedIndex = await page.evaluate(() => window.__notifications.findIndex((n) => n.title.includes("blocked-1 is blocked")));
  await page.getByRole("button", { name: "Project One" }).click();
  await page.getByText("Project Two", { exact: true }).click();
  await page.getByText("Second project bead", { exact: true }).waitFor();
  await page.evaluate((index) => window.__notifications[index].onclick(), blockedIndex);
  await page.waitForURL(new RegExp(`/p/${encodeURIComponent(projectOne)}\\?bead=blocked-1$`));
  await page.getByRole("dialog").getByText("Blocked bead", { exact: true }).waitFor();
  assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem("notification-events") || "[]")), [{ type: "close", title: "🤖 agent finished finish-1" }, { type: "focus" }, { type: "close", title: "⛔ blocked-1 is blocked" }, { type: "focus" }], "a retained notification closes and focuses before it returns to its originating project");
  console.log("PASS: notification categories, historical baselines, same-project activation, and retained cross-project activation");
} catch (error) {
  console.error({ errors, url: page.url(), body: (await page.locator("body").innerText()).slice(0, 3000) });
  throw error;
} finally {
  await browser.close();
}
