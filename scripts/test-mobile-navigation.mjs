import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "SCOTTY_TEST_URL is required; use an isolated upstream fixture server");
const browser = await chromium.launch({
  executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined,
});
const errors = [];

async function assertNoPageOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scroll <= dimensions.client, `${label} page overflow: ${JSON.stringify(dimensions)}`);
}

async function assertSheetClosed(page, label, { expectFocus = true } = {}) {
  await page.getByRole("heading", { name: "Project and view navigation", exact: true }).waitFor({ state: "detached" });
  if (expectFocus) {
    assert.equal(
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
      "Open navigation and project menu",
      `${label} focus must return to Menu`,
    );
  }
}

async function mobileCheck(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${width}px: ${error.message}`));
  try {
    await page.goto(`${base}/p/demo`, { waitUntil: "domcontentloaded" });
    const menu = page.locator('button[aria-label="Open navigation and project menu"]');
    await menu.waitFor();
    assert.equal(await menu.isVisible(), true, `${width}px Menu trigger must be visible`);
    await assertNoPageOverflow(page, `${width}px initial`);

    await menu.click();
    await page.getByRole("heading", { name: "Project and view navigation", exact: true }).waitFor();
    const project = page.getByRole("button", { name: "Select project, current project Demo", exact: true });
    await project.waitFor();
    await project.click();
    await page.getByRole("menuitem", { name: "Demo", exact: true }).click();
    await assertSheetClosed(page, `${width}px project selection`);

    await menu.click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await assertSheetClosed(page, `${width}px view navigation`);

    await menu.click();
    await page.keyboard.press("Escape");
    await assertSheetClosed(page, `${width}px Escape`);

    await menu.click();
    await page.mouse.click(width - 4, 300);
    await assertSheetClosed(page, `${width}px backdrop`);

    await menu.click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByText(/open the mobile Menu to switch projects/i).waitFor();
    await menu.click();
    await project.click();
    await page.getByRole("menuitem", { name: "All projects", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await assertSheetClosed(page, `${width}px All projects navigation`, { expectFocus: false });
  } finally {
    await context.close();
  }
}

async function desktopCheck() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`desktop: ${error.message}`));
  try {
    await page.goto(`${base}/p/demo`, { waitUntil: "domcontentloaded" });
    const sidebars = page.locator("aside");
    assert.equal(await sidebars.count(), 1, "desktop must render one Sidebar");
    const desktopSidebar = await sidebars.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { display: style.display, width: Math.round(element.getBoundingClientRect().width) };
    });
    assert.equal(desktopSidebar.display, "flex", "desktop Sidebar must be CSS-visible");
    assert.equal(desktopSidebar.width, 228, "desktop Sidebar width must remain 228px");
    assert.equal(
      await page.locator('button[aria-label="Open navigation and project menu"]').isVisible(),
      false,
      "desktop Menu trigger must be hidden",
    );
  } finally {
    await context.close();
  }
}

try {
  await mobileCheck(390);
  await mobileCheck(320);
  await desktopCheck();
  assert.deepEqual(errors, [], "browser page errors");
  console.log("PASS: demo mobile Sheet navigation at 390px and 320px, project/view navigation, Escape/backdrop closure, Settings guidance, desktop Sidebar");
} finally {
  await browser.close();
}
