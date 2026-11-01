// Mobile layout audit (self-oof).
//
// For every view and for the widths 360, 390 and 768 px this checks:
//   AC 3  the page does not scroll sideways (the graph canvas is exempt)
//   AC 4  every visible control is at least 44x44 px
//   AC 5  the page base and every input, textarea and select use at least 16 px,
//         and no visible text is below 12 px
// Exempt: the graph canvas (react-flow pane and its nodes), which pans and zooms.
// A checkbox or radio is measured by its enclosing label, not by the 20 px box.
// At 1280 px it records or compares the size of every control, so a desktop
// regression shows up:
//   SCOTTY_LAYOUT_SNAPSHOT=FILE SCOTTY_LAYOUT_MODE=record   write the sizes
//   SCOTTY_LAYOUT_SNAPSHOT=FILE SCOTTY_LAYOUT_MODE=compare  fail when a size changes
//
// Needs an isolated demo server, as the other scripts/test-*.mjs files do:
//   BEADS_DEMO=1 npm run start -- --port 3210
//   SCOTTY_TEST_URL=http://localhost:3210 node scripts/test-mobile-layout.mjs
// Optional: SCOTTY_BROWSER_EXECUTABLE, SCOTTY_LAYOUT_VIEWS=board,list,
// SCOTTY_SHOTS_DIR=DIR (a screenshot of every view and width).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
if (!base) {
  console.error("SCOTTY_TEST_URL is required; use an isolated demo server");
  process.exit(2);
}

const ALL_VIEWS = [
  "board", "list", "epics", "focus", "graph", "insights",
  "activity", "needsyou", "achievements", "publish", "settings",
  "drawer", // the bead detail drawer, opened over the board
  "focus-grouped", // Focus with "Group by assignee", which has its own layout
];
const viewQuery = (v) => {
  if (v === "drawer") return "view=board&bead=bd-7e40.2";
  if (v === "focus-grouped") return "view=focus";
  return `view=${v}`;
};
const views = (process.env.SCOTTY_LAYOUT_VIEWS || ALL_VIEWS.join(",")).split(",").filter(Boolean);
const widths = [360, 390, 768];
// 1000 px sits between the sidebar breakpoint (768) and the desktop layout (1024). Tap target
// and font rules apply below 48rem only, so at 1000 px only the layout checks run.
const layoutOnlyWidths = [1000];
const MIN_TARGET = 44;
const MIN_INPUT_FONT = 16;
const MIN_TEXT_FONT = 12;
const snapshotFile = process.env.SCOTTY_LAYOUT_SNAPSHOT;
const snapshotMode = process.env.SCOTTY_LAYOUT_MODE || "compare";
const shotsDir = process.env.SCOTTY_SHOTS_DIR;

// Runs in the page. Returns plain data only.
function measure({ minTarget, minInputFont, minTextFont }) {
  const describe = (el) => {
    const label = el.getAttribute("aria-label") || el.getAttribute("title")
      || (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)
      || el.getAttribute("placeholder") || "";
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}[${label}]`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  };
  const inCanvas = (el) => Boolean(el.closest(".react-flow__pane, .react-flow__viewport"));
  // The nearest ancestor that cuts the control off at the side. A scroller (auto or scroll)
  // is reported by the sideways-scroller check below. A hidden or clip ancestor makes the
  // control unreachable, so it is reported as off screen.
  const clippedBy = (el, r) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "visible") continue;
      const nr = n.getBoundingClientRect();
      if (r.right > nr.right + 1 || r.left < nr.left - 1) {
        return { node: n, scroller: ox === "auto" || ox === "scroll" };
      }
    }
    return null;
  };

  const root = document.documentElement;
  const out = {
    client: root.clientWidth,
    scroll: root.scrollWidth,
    bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
    overflowing: [],
    smallTargets: [],
    squashed: [],
    slivers: [],
    offscreen: [],
    sideScrollers: [],
    smallInputs: [],
    smallText: [],
    controls: [],
  };

  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el) || inCanvas(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > root.clientWidth + 1 && out.overflowing.length < 8) {
      out.overflowing.push(`${describe(el)} right=${Math.round(r.right)}`);
    }
  }

  // AC 3: nothing may need sideways scrolling. A code block (pre) keeps its own scroll bar,
  // because a long line cannot wrap. The graph canvas pans by design.
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el) || inCanvas(el) || el.closest("pre")) continue;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1 && out.sideScrollers.length < 8) {
      out.sideScrollers.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
  }

  const controls = document.body.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="switch"], [role="option"]',
  );
  for (const el of controls) {
    if (!visible(el) || inCanvas(el)) continue;
    const isToggle = el.tagName === "INPUT" && /^(checkbox|radio)$/.test(el.type);
    // A checkbox or radio is tapped through its label, so the label box is the target.
    const box = isToggle ? (el.closest("label") || el) : el;
    const r = box.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    // The compare key leaves out class names, so a class rename alone is not a change.
    out.controls.push({ name: describe(el), key: `${el.tagName.toLowerCase()}[${describe(el).replace(/^[^\[]*\[/, "").replace(/\]$/, "")}]`, w, h });
    const clip = clippedBy(el, r);
    if (out.offscreen.length < 12) {
      if (clip && !clip.scroller) {
        out.offscreen.push(`${describe(el)} clipped by ${describe(clip.node)}`);
      } else if (!clip && (r.right > root.clientWidth + 1 || r.left < -1)) {
        out.offscreen.push(`${describe(el)} left ${Math.round(r.left)} right ${Math.round(r.right)} of ${root.clientWidth}`);
      }
    }
    // WCAG 2.5.8 exempts a link inside a line of text, so an inline anchor is not measured.
    const inlineLink = el.tagName === "A" && getComputedStyle(el).display === "inline";
    if (!inlineLink && (w < minTarget || h < minTarget)) {
      out.smallTargets.push(`${describe(el)} ${w}x${h}${box === el ? "" : " (label)"}`);
    }
    // Squashed control: its content spills out below the box (a flex item that shrank).
    if (!isToggle && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.children.length) {
      let lowest = r.bottom;
      for (const c of el.querySelectorAll("*")) {
        if (!visible(c)) continue;
        lowest = Math.max(lowest, c.getBoundingClientRect().bottom);
      }
      if (lowest > r.bottom + 2) out.squashed.push(`${describe(el)} box ${h}px, content ${Math.round(lowest - r.top)}px`);
    }
    if (!isToggle && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < minInputFont) out.smallInputs.push(`${describe(el)} ${fs}px`);
    }
  }

  // Text cut by an ellipsis into a sliver: a title that shows one letter is not readable.
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el) || inCanvas(el)) continue;
    if (getComputedStyle(el).textOverflow !== "ellipsis") continue;
    const text = (el.textContent || "").trim();
    const w = Math.round(el.getBoundingClientRect().width);
    // Only text that is really cut off counts; a short chip that fits is fine.
    if (text.length > 8 && w < 60 && el.scrollWidth > el.clientWidth + 1 && out.slivers.length < 8) out.slivers.push(`${describe(el)} ${w}px wide`);
  }

  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || !visible(el) || inCanvas(el) || el.closest("script, style, noscript")) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < minTextFont) {
      const key = describe(el);
      if (!seen.has(key)) {
        seen.add(key);
        out.smallText.push(`${key} ${fs}px`);
      }
    }
  }
  return out;
}

const errors = [];
const failures = [];
const desktop = {};

function fail(width, view, kind, items) {
  if (!items.length) return;
  failures.push({ width, view, kind, items });
}

function report(width, label, m, layoutOnly = false) {
  if (m.scroll > m.client) {
    fail(width, label, "page scrolls sideways", [
      `scrollWidth ${m.scroll} > clientWidth ${m.client}`, ...m.overflowing,
    ]);
  }
  fail(width, label, "an element scrolls sideways", m.sideScrollers);
  if (!layoutOnly) {
    if (m.bodyFont < MIN_INPUT_FONT) fail(width, label, "page base font", [`${m.bodyFont}px`]);
    fail(width, label, `controls under ${MIN_TARGET}x${MIN_TARGET}`, m.smallTargets);
  }
  fail(width, label, "control content spills out of its box", m.squashed);
  fail(width, label, "text cut to a sliver by an ellipsis (under 60px)", m.slivers);
  fail(width, label, "control outside the screen or clipped", m.offscreen);
  if (!layoutOnly) {
    fail(width, label, `inputs under ${MIN_INPUT_FONT}px`, m.smallInputs);
    fail(width, label, `text under ${MIN_TEXT_FONT}px`, m.smallText);
  }
}

// Menus, dialogs and sheets are portals that exist only when open. Each state opens one over
// the board and measures it with the same rules. A state that cannot be opened is a failure.
const STATES = [
  {
    name: "filter-menu",
    open: async (p) => {
      await p.getByRole("button", { name: /^Status/ }).first().click();
      await p.getByRole("menu").first().waitFor({ timeout: 5000 });
    },
  },
  {
    name: "create-modal",
    open: async (p) => {
      await p.getByRole("button", { name: /New/ }).first().click();
      await p.getByRole("dialog").first().waitFor({ timeout: 5000 });
    },
  },
  {
    name: "command-palette",
    open: async (p) => {
      await p.keyboard.press("Control+k");
      await p.locator("[cmdk-root]").first().waitFor({ timeout: 5000 });
    },
  },
  {
    name: "navigation-sheet",
    maxWidth: 767, // from 768px the sidebar is always shown
    open: async (p) => {
      await p.locator('button[aria-label="Open navigation and project menu"]').click();
      await p.locator('[data-slot="sheet-content"]').waitFor({ timeout: 5000 });
    },
  },
  {
    name: "project-switcher",
    open: async (p) => {
      const menu = p.locator('button[aria-label="Open navigation and project menu"]');
      if (await menu.isVisible()) await menu.click();
      await p.getByRole("button", { name: /^Select project/ }).first().click();
      await p.getByRole("menuitem").first().waitFor({ timeout: 5000 });
    },
  },
];

async function openView(page, view) {
  await page.goto(`${base}/p/demo?${viewQuery(view)}`, { waitUntil: "domcontentloaded" });
  await page.locator("main, [role='main'], h1, h2").first().waitFor({ timeout: 15000 });
  // The beads stream keeps the network busy, so wait a fixed time for the first render.
  await page.waitForTimeout(1500);
  if (view === "focus-grouped") {
    await page.locator('label:has-text("Group by") select').selectOption("assignee");
    await page.locator('section[aria-label^="Assignee:"]').first().waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
  }
}

// A swipe that starts on a draggable card or row must scroll the page. A card with
// touch-action none swallows the swipe. Needs a touch context and Chromium (CDP).
async function swipeScrolls(page) {
  const target = page.locator('[aria-roledescription="sortable"]').first();
  await target.waitFor({ timeout: 5000 });
  const box = await target.boundingBox();
  if (!box) throw new Error("no draggable card or row to swipe on");
  const scrollOf = () => page.evaluate(() => {
    const el = document.querySelector('[aria-roledescription="sortable"]');
    let total = window.scrollY;
    for (let n = el; n; n = n.parentElement) total += n.scrollTop || 0;
    return total;
  });
  const before = await scrollOf();
  const cdp = await page.context().newCDPSession(page);
  const x = Math.round(box.x + box.width / 2);
  const y0 = Math.round(Math.min(box.y + box.height / 2, 700));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - i * 20 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
  return (await scrollOf()) > before;
}

const browser = await chromium.launch({
  executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined,
});

try {
  for (const width of [...widths, ...layoutOnlyWidths, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 1280 });
    for (const view of views) {
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${width}px ${view}: ${e.message}`));
      try {
        await openView(page, view);
        const m = await page.evaluate(measure, {
          minTarget: MIN_TARGET, minInputFont: MIN_INPUT_FONT, minTextFont: MIN_TEXT_FONT,
        });
        if (shotsDir) {
          fs.mkdirSync(shotsDir, { recursive: true });
          await page.screenshot({ path: path.join(shotsDir, `${view}-${width}.png`) });
        }
        if (width === 1280) {
          desktop[view] = m.controls;
          continue;
        }
        report(width, view, m, layoutOnlyWidths.includes(width));
        if (width <= 768 && (view === "board" || view === "list")) {
          if (!(await swipeScrolls(page))) {
            fail(width, view, "a swipe on a draggable card or row does not scroll the page", [
              "touch-action none on the card blocks scrolling; use a touch sensor with a press delay",
            ]);
          }
        }
      } catch (e) {
        fail(width, view, "audit error", [String(e.message || e).split("\n")[0]]);
      } finally {
        await page.close();
      }
    }
    if (width <= 768) {
      for (const st of STATES) {
        if (st.maxWidth && width > st.maxWidth) continue;
        const label = `board+${st.name}`;
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(`${width}px ${label}: ${e.message}`));
        try {
          await openView(page, "board");
          await st.open(page);
          await page.waitForTimeout(500);
          const m = await page.evaluate(measure, {
            minTarget: MIN_TARGET, minInputFont: MIN_INPUT_FONT, minTextFont: MIN_TEXT_FONT,
          });
          if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${st.name}-${width}.png`) });
          report(width, label, m);
        } catch (e) {
          fail(width, label, "audit error: could not open the state", [String(e.message || e).split("\n")[0]]);
        } finally {
          await page.close();
        }
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (snapshotFile) {
  if (snapshotMode === "record") {
    fs.writeFileSync(snapshotFile, JSON.stringify(desktop, null, 1));
    console.log(`recorded 1280px control sizes to ${snapshotFile}`);
  } else {
    const before = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    for (const view of views) {
      if (!(before[view] || []).length) {
        fail(1280, view, "no recorded baseline for this view", ["record it on the base commit with SCOTTY_LAYOUT_MODE=record"]);
        continue;
      }
      if (!(desktop[view] || []).length) {
        fail(1280, view, "no controls measured at 1280px", ["the page did not render"]);
        continue;
      }
      if (!before[view][0].key) {
        fail(1280, view, "baseline has no compare keys", ["record it again with this script"]);
        continue;
      }
      const a = before[view].map((c) => `${c.key} ${c.w}x${c.h}`);
      const b = desktop[view].map((c) => `${c.key} ${c.w}x${c.h}`);
      const changed = [
        ...b.filter((x) => !a.includes(x)).map((x) => `now ${x}`),
        ...a.filter((x) => !b.includes(x)).map((x) => `was ${x}`),
      ];
      fail(1280, view, "desktop control size changed", changed.slice(0, 12));
    }
  }
}

for (const f of failures) {
  console.log(`FAIL ${f.width}px ${f.view}: ${f.kind} (${f.items.length})`);
  for (const item of f.items.slice(0, 6)) console.log(`    ${item}`);
  if (f.items.length > 6) console.log(`    ... ${f.items.length - 6} more`);
}
for (const e of errors) console.log(`PAGE ERROR ${e}`);

const brokenViews = new Set(failures.map((f) => f.view));
console.log(
  `mobile-layout: ${failures.length} failing checks in ${brokenViews.size} views or states ` +
  `[${[...brokenViews].join(", ") || "none"}]`,
);
process.exit(failures.length || errors.length ? 1 : 0);
