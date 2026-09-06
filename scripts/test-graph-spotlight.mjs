// Run against an isolated app server: SCOTTY_TEST_URL=http://127.0.0.1:43188 node scripts/test-graph-spotlight.mjs
// Project API requests are intercepted; this test is deliberately read-only.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");

const bead = (id, extra = {}) => ({
  id, title: id, issue_type: "task", status: "open", priority: 2,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  labels: [], dependencies: [], ...extra,
});
const dep = (type, target) => ({ type, depends_on_id: target });

// Edges point from the bead that has a dependency to the prerequisite it names.
// Thus d -> a -> b <-> c is the active blocking neighborhood of a.
const beads = [
  bead("a", { title: "selected", dependencies: [dep("blocks", "b")] }),
  bead("b", { dependencies: [dep("waits-for", "c")] }),
  bead("c", { dependencies: [dep("conditional-blocks", "b"), dep("blocks", "closed-target")] }),
  bead("d", { dependencies: [dep("blocks", "a")] }),
  bead("parent", { issue_type: "epic" }),
  bead("child", { dependencies: [dep("parent-child", "a")] }),
  bead("related", { dependencies: [dep("related", "a")] }),
  bead("closed-target", { status: "closed" }),
  bead("loose"),
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    assert.equal(request.method(), "GET", `Spotlight read-only mode must not write (${request.method()} ${pathname})`);
    if (pathname.endsWith("/beads/stream")) {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    }
    if (pathname.endsWith("/beads")) {
      return route.fulfill({ json: { beads, meta: {
        kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"],
        pollIntervalMs: 300000, readOnly: true,
      } } });
    }
    return route.fulfill({ json: beads.find((item) => pathname.endsWith(`/beads/${item.id}`)) ?? {} });
  });

  await page.goto(`${base}/p/demo`);
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  const node = (id) => page.locator(`.react-flow__node[data-id="${id}"]`);
  await node("a").waitFor();

  const spotlight = page.getByRole("checkbox", { name: "Spotlight dependencies", exact: true });
  assert.equal(await spotlight.isChecked(), false, "Spotlight is off by default");

  // With spotlight off, graph nodes retain the ordinary click-to-open behavior.
  await node("a").click();
  await page.getByTitle("Close", { exact: true }).waitFor();
  await closeDrawer(page);

  await spotlight.check();
  await expectSpotlightInstruction(page);
  await node("a").click();
  await page.waitForTimeout(100);
  assert.equal(await page.getByTitle("Close", { exact: true }).count(), 0,
    "A spotlight click selects the chain instead of opening the drawer");

  const opacity = async (id) => node(id).locator('[data-keyboard-bead-id]').evaluate((element) => {
    return Number.parseFloat(getComputedStyle(element).opacity);
  });
  for (const id of ["a", "b", "c", "d"]) {
    assert.ok((await opacity(id)) >= 0.99, `${id} is in the blocking chain and must stay highlighted`);
  }
  for (const id of ["child", "related", "parent", "closed-target", "loose"]) {
    assert.ok((await opacity(id)) < 0.99, `${id} is not an active blocking neighbor and must be dimmed`);
  }
  const selectedClass = await node("a").locator('[role="button"]').getAttribute("class");
  assert.match(selectedClass ?? "", /border-\[var\(--brand\)\]|ring-2/,
    "The selected bead keeps the brand outline in spotlight mode");
  const clear = page.getByTitle("Clear the dependency spotlight", { exact: true });
  assert.match(await clearBadgeText(page), /a\s+2 upstream\s+·\s+1 downstream/,
    "The spotlight badge reports the active upstream and downstream counts");
  const edgeOpacity = async (id) => page.locator(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`).evaluate(
    (element) => Number.parseFloat(getComputedStyle(element).opacity),
  );
  for (const id of ["a->b:blocks", "b->c:waits-for", "c->b:conditional-blocks", "d->a:blocks"]) {
    assert.ok((await edgeOpacity(id)) >= 0.99, `${id} is an active blocking edge and must stay highlighted`);
  }
  for (const id of ["child->a:parent-child", "related->a:related", "c->closed-target:blocks"]) {
    assert.ok((await edgeOpacity(id)) < 0.99, `${id} must be retained but dimmed outside the active blocking chain`);
  }

  // A cycle in b <-> c must not prevent a double-click from opening details.
  await node("a").dblclick();
  await page.getByTitle("Close", { exact: true }).waitFor();
  await closeDrawer(page);

  await clear.click();
  assert.equal(await spotlight.isChecked(), true, "Clearing a selection leaves spotlight mode enabled");
  for (const id of ["a", "b", "c", "d", "child", "related", "parent", "closed-target", "loose"]) {
    assert.ok((await opacity(id)) >= 0.99, `Clearing must restore ${id} without hiding graph context`);
  }

  // Clicking graph background performs the same clear action after a selection.
  await node("a").click();
  await page.locator(".react-flow__pane").click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(100);
  for (const id of ["a", "b", "c", "d", "child", "related", "parent", "closed-target", "loose"]) {
    assert.ok((await opacity(id)) >= 0.99, `Background clear must restore ${id}`);
  }

  // A previously selected node may disappear under Live dependencies only. It
  // must clear the spotlight rather than leaving every visible node dimmed.
  await node("closed-target").dblclick();
  await page.getByTitle("Close", { exact: true }).waitFor();
  await closeDrawer(page);
  await page.getByRole("checkbox", { name: "Live dependencies only", exact: true }).check();
  await node("closed-target").waitFor({ state: "detached" });
  for (const id of ["a", "b", "c", "d"]) {
    assert.ok((await opacity(id)) >= 0.99, `Hiding the selected bead must not dim ${id}`);
  }

  await spotlight.uncheck();
  await node("a").click();
  await page.getByTitle("Close", { exact: true }).waitFor();
  await closeDrawer(page);
  assert.deepEqual(errors, [], "Browser console must remain clean");
  console.log("PASS: spotlight dependency traversal, dimming, clearing, filtered selection recovery, and read-only details");
} finally {
  await browser.close();
}

async function expectSpotlightInstruction(page) {
  await page.getByText(/double-click.*details/i).waitFor();
}

async function clearBadgeText(page) {
  return page.getByTitle("Clear the dependency spotlight", { exact: true }).innerText();
}

async function closeDrawer(page) {
  const close = page.getByTitle("Close", { exact: true });
  await close.click();
  await close.waitFor({ state: "detached" });
}
