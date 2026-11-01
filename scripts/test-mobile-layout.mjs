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
];
const viewQuery = (v) => (v === "drawer" ? "view=board&bead=bd-7e40.2" : `view=${v}`);
const views = (process.env.SCOTTY_LAYOUT_VIEWS || ALL_VIEWS.join(",")).split(",").filter(Boolean);
const widths = [360, 390, 768];
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
  // A control inside a row that scrolls sideways on purpose (filter bar, board lanes) may sit
  // past the edge. A control clipped by overflow hidden may not: nobody can reach it.
  const inSideScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
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

  const controls = document.body.querySelectorAll(
    'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="option"]',
  );
  for (const el of controls) {
    if (!visible(el) || inCanvas(el)) continue;
    const isToggle = el.tagName === "INPUT" && /^(checkbox|radio)$/.test(el.type);
    // A checkbox or radio is tapped through its label, so the label box is the target.
    const box = isToggle ? (el.closest("label") || el) : el;
    const r = box.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    out.controls.push({ name: describe(el), w, h });
    if ((r.right > root.clientWidth + 1 || r.left < -1) && !inSideScroller(el) && out.offscreen.length < 12) {
      out.offscreen.push(`${describe(el)} left ${Math.round(r.left)} right ${Math.round(r.right)} of ${root.clientWidth}`);
    }
    if (w < minTarget || h < minTarget) {
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
    if (text.length > 8 && w < 60 && out.slivers.length < 8) out.slivers.push(`${describe(el)} ${w}px wide`);
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

async function openView(page, view) {
  await page.goto(`${base}/p/demo?${viewQuery(view)}`, { waitUntil: "domcontentloaded" });
  await page.locator("main, [role='main'], h1, h2").first().waitFor({ timeout: 15000 });
  // The beads stream keeps the network busy, so wait a fixed time for the first render.
  await page.waitForTimeout(1500);
}

const browser = await chromium.launch({
  executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined,
});

try {
  for (const width of [...widths, 1280]) {
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
        if (m.scroll > m.client) {
          fail(width, view, "page scrolls sideways", [
            `scrollWidth ${m.scroll} > clientWidth ${m.client}`, ...m.overflowing,
          ]);
        }
        if (m.bodyFont < MIN_INPUT_FONT) fail(width, view, "page base font", [`${m.bodyFont}px`]);
        fail(width, view, `controls under ${MIN_TARGET}x${MIN_TARGET}`, m.smallTargets);
        fail(width, view, "control content spills out of its box", m.squashed);
        fail(width, view, "text cut to a sliver by an ellipsis (under 60px)", m.slivers);
        fail(width, view, "control outside the screen and not reachable by scrolling", m.offscreen);
        fail(width, view, `inputs under ${MIN_INPUT_FONT}px`, m.smallInputs);
        fail(width, view, `text under ${MIN_TEXT_FONT}px`, m.smallText);
      } catch (e) {
        fail(width, view, "audit error", [String(e.message || e).split("\n")[0]]);
      } finally {
        await page.close();
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
      const a = (before[view] || []).map((c) => `${c.name} ${c.w}x${c.h}`);
      const b = (desktop[view] || []).map((c) => `${c.name} ${c.w}x${c.h}`);
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
  `mobile-layout: ${failures.length} failing checks in ${brokenViews.size} of ${views.length} views ` +
  `[${[...brokenViews].join(", ") || "none"}]`,
);
process.exit(failures.length || errors.length ? 1 : 0);
