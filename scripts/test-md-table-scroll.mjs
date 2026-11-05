// Browser regression fixture: a wide Markdown table scrolls sideways inside its
// own box on a phone-sized screen. Every project request is intercepted; this
// never reaches a Beads database. Run against a dev or production server:
//   SCOTTY_TEST_URL=http://localhost:3000 [SCOTTY_TEST_SHOT=path.png] node scripts/test-md-table-scroll.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to the running demo server");

const description = [
  "Compare the options:",
  "",
  "| Option | Cost per month | Latency (p95) | Maintenance burden | Recommendation |",
  "| --- | --- | --- | --- | --- |",
  "| Self-hosted queue | 120 dollars | 40 ms | High, needs an on-call owner | Not now |",
  "| Managed queue | 300 dollars | 25 ms | Low | Yes |",
  "",
  "A closing paragraph after the table.",
].join("\n");
const bead = {
  id: "wide", title: "Wide table", status: "open", issue_type: "task", priority: 2, labels: [], dependencies: [],
  description, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
};

const browser = await chromium.launch({ executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: true } }));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) return route.fulfill({ json: { beads: [bead], meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 250 } } });
    return route.fulfill({ json: {} });
  });
  await page.goto(`${base}/p/demo?bead=wide`);
  const dialog = page.getByRole("dialog");
  await dialog.getByText("A closing paragraph after the table.").waitFor();

  const scroller = dialog.locator(".bd-md-table-scroll").first();
  const m = await scroller.evaluate((el) => ({
    overflowX: getComputedStyle(el).overflowX,
    client: el.clientWidth, scroll: el.scrollWidth,
    docClient: document.documentElement.clientWidth, docScroll: document.documentElement.scrollWidth,
    cols: el.querySelectorAll("thead th").length,
  }));
  assert.equal(m.cols, 5, "the fixture table has five columns");
  assert.equal(m.overflowX, "auto");
  assert.ok(m.scroll > m.client, `the table is wider than its box (${m.scroll} > ${m.client})`);
  assert.ok(m.client <= 390, `the box fits the phone screen (${m.client})`);
  assert.equal(m.docScroll, m.docClient, "the page itself does not scroll sideways");
  await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  assert.ok(await scroller.evaluate((el) => el.scrollLeft) > 0, "the box scrolls sideways");
  await scroller.evaluate((el) => { el.scrollLeft = 0; });
  assert.ok(await dialog.getByRole("columnheader", { name: "Option" }).isVisible());
  if (process.env.SCOTTY_TEST_SHOT) await page.screenshot({ path: process.env.SCOTTY_TEST_SHOT });
  assert.deepEqual(errors, []);
  console.log("PASS: a five-column Markdown table scrolls inside its box at 390x844");
} finally {
  await browser.close();
}
