// Mobile layout audit (self-oof).
//
// For every view and for the widths 360, 390 and 768 px this checks:
//   AC 3  the page does not scroll sideways (the graph canvas is exempt)
//   AC 4  every visible control is at least 44x44 px
//   AC 5  the main element uses at least 14 px (a guard: the app shell is text-sm),
//         every input, textarea and select uses at least 16 px, and no visible
//         text is below 12 px
// Exempt: the graph canvas (react-flow pane and its nodes), which pans and zooms.
// A checkbox or radio is measured by its enclosing label, not by the 20 px box.
// The audit fails when that label wraps more than one control.
// The first output line names the served build (Build N . SHA). The script exits 1
// when the sidebar footer shows no build line.
// At 1280 px it records or compares the size of every control, so a desktop
// regression shows up. Controls are counted per key and size, and a run prints
// how many controls in how many views it compared:
//   SCOTTY_LAYOUT_SNAPSHOT=FILE SCOTTY_LAYOUT_MODE=record   write the sizes
//   SCOTTY_LAYOUT_SNAPSHOT=FILE SCOTTY_LAYOUT_MODE=compare  fail when a size changes
// The baseline file records the browser (name, version and executable). Font metrics
// differ between browsers, so compare stops with one message when the browser differs
// or the record is missing. Use the same SCOTTY_BROWSER_EXECUTABLE for record and compare.
// Record the baseline on the base commit (main) with this script. SCOTTY_LAYOUT_MODE
// without SCOTTY_LAYOUT_SNAPSHOT exits 2. With neither set, the compare is skipped
// and the output says so.
// Self-test, with no server (Chromium only):
//   SCOTTY_LAYOUT_SELFTEST=1 node scripts/test-mobile-layout.mjs
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
const selftest = process.env.SCOTTY_LAYOUT_SELFTEST === "1";
if (!base && !selftest) {
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
// 820 px is an iPad in portrait, between the sidebar breakpoint and 1024.
// 1100 and 1200 px are between 1024 and the 1280 desktop width: the sidebar and the page header
// compete for room there, and a header that does not wrap loses its right-hand controls.
const layoutOnlyWidths = [820, 1000, 1100, 1200];
const MIN_TARGET = 44;
const MIN_INPUT_FONT = 16;
// The app shell is text-sm (14px). The floor guards against a regression of that size.
const MIN_BASE_FONT = 14;
const MIN_TEXT_FONT = 12;
const snapshotFile = process.env.SCOTTY_LAYOUT_SNAPSHOT;
const snapshotMode = process.env.SCOTTY_LAYOUT_MODE || "compare";
if (!selftest && process.env.SCOTTY_LAYOUT_MODE && !snapshotFile) {
  console.error("SCOTTY_LAYOUT_MODE is set but SCOTTY_LAYOUT_SNAPSHOT is not; name the baseline file");
  process.exit(2);
}
const shotsDir = process.env.SCOTTY_SHOTS_DIR;

// Runs in the page. Returns plain data only.
function measure({ minTarget, minInputFont, minTextFont, listView = false, idMinWidth = 640, deskWidth = 1024 }) {
  const labelOf = (el) => el.getAttribute("aria-label") || el.getAttribute("title")
    || (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 30)
    || el.getAttribute("placeholder") || "";
  const describe = (el) => {
    const label = labelOf(el);
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
    // The app shell sets its own size, so the body size (16px by default) cannot fail.
    // The size of the main element is the page base that the user reads.
    mainFont: document.querySelector("main") ? parseFloat(getComputedStyle(document.querySelector("main")).fontSize) : 0,
    sharedLabels: [],
    overlaps: [],
    graphNodes: 0,
    wideBlocks: [],
    overflowing: [],
    smallTargets: [],
    squashed: [],
    slivers: [],
    idCut: [],
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
    if (!visible(el) || inCanvas(el) || el.closest("pre") || el.matches(".bd-md table, .bd-md .bd-md-scroll")) continue;
    // From 1024px the board and Focus columns scroll sideways inside their own pane by design.
    // Only those column panes (overflow-y hidden) are exempt; a vertical pane must not scroll sideways.
    // The grouped Focus matrix (overflow auto, a min-w-max child) scrolls both ways by design.
    if (window.innerWidth >= deskWidth && el.matches(".bd-scroll")
      && (getComputedStyle(el).overflowY === "hidden" || el.querySelector(":scope > .lg\\:min-w-max"))) continue;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 1 && out.sideScrollers.length < 8) {
      out.sideScrollers.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
  }

  // A markdown table or code block wider than the box that holds it must have its own scroller.
  // Without one the shell clips it, and part of the content cannot be reached.
  for (const el of document.querySelectorAll(".bd-md table, .bd-md pre")) {
    if (!visible(el)) continue;
    const scroller = el.closest(".bd-md-scroll") || (el.tagName === "PRE" ? el : null);
    const ox = scroller ? getComputedStyle(scroller).overflowX : "visible";
    const host = el.closest(".bd-md");
    const room = host ? host.getBoundingClientRect().width : root.clientWidth;
    const wide = Math.max(el.scrollWidth, el.getBoundingClientRect().width) > room + 1;
    if (wide && ox !== "auto" && ox !== "scroll" && out.wideBlocks.length < 8) {
      out.wideBlocks.push(`${el.tagName.toLowerCase()} is ${Math.round(Math.max(el.scrollWidth, el.getBoundingClientRect().width))}px in a ${Math.round(room)}px box with no scroller`);
    }
  }

  // Graph nodes must not sit on top of each other (a bigger font could push them together).
  // The graph is fitted to the screen, often at a zoom near 0.2. Overlap is measured in
  // layout units (box size on screen divided by the zoom), so a few units still count.
  const nodeBoxes = [...document.querySelectorAll(".react-flow__node")].filter(visible)
    .map((n) => {
      const r = n.getBoundingClientRect();
      const zoom = n.offsetWidth ? r.width / n.offsetWidth : 1;
      return { el: n, r, zoom: zoom || 1 };
    });
  out.graphNodes = nodeBoxes.length;
  for (let i = 0; i < nodeBoxes.length; i++) {
    for (let j = i + 1; j < nodeBoxes.length; j++) {
      const a = nodeBoxes[i].r;
      const b = nodeBoxes[j].r;
      const zoom = nodeBoxes[i].zoom;
      const w = (Math.min(a.right, b.right) - Math.max(a.left, b.left)) / zoom;
      const h = (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / zoom;
      if (w > 2 && h > 2 && out.overlaps.length < 8) {
        out.overlaps.push(`${describe(nodeBoxes[i].el)} and ${describe(nodeBoxes[j].el)} overlap by ${Math.round(w)}x${Math.round(h)} units`);
      }
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
    // A label that wraps several controls would pass for all of them, so it is a failure.
    if (isToggle && box !== el && box.querySelectorAll('input:not([type="hidden"]), button, select, textarea, a[href]').length > 1) {
      out.sharedLabels.push(`${describe(el)} label wraps more than one control`);
    }
    const r = box.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    // The compare key is the tag plus the label: class text never enters it.
    out.controls.push({ name: describe(el), key: `${el.tagName.toLowerCase()}[${labelOf(el)}]`, w, h });
    const clip = clippedBy(el, r);
    if (out.offscreen.length < 12) {
      if (clip && !clip.scroller) {
        out.offscreen.push(`${describe(el)} clipped by ${describe(clip.node)}`);
      } else if (!clip && (r.right > root.clientWidth + 1 || r.left < -1)) {
        out.offscreen.push(`${describe(el)} left ${Math.round(r.left)} right ${Math.round(r.right)} of ${root.clientWidth}`);
      }
    }
    // WCAG 2.5.8 exempts a link inside a line of text, so an inline anchor is not measured.
    // A link that is all the text of its parent stands alone on its line: it is measured.
    // The renderer gives the 44px target to a link that is the only child of a paragraph (P), so
    // the audit measures the same case. A link alone in a list item or inside bold text is exempt.
    const aloneInParent = el.tagName === "A" && el.parentElement && el.parentElement.tagName === "P"
      && (el.parentElement.textContent || "").trim() === (el.textContent || "").trim();
    const inlineLink = el.tagName === "A" && getComputedStyle(el).display === "inline" && !aloneInParent;
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
    // A row title in the list view needs 120px; other cut text (chips, theme names) keeps 60px.
    const isRowTitle = listView && el.matches(".truncate") && el.tagName !== "BUTTON" && el.closest("[data-keyboard-bead-id]");
    if (text.length > 8 && w < (isRowTitle ? 120 : 60) && el.scrollWidth > el.clientWidth + 1 && out.slivers.length < 8) out.slivers.push(`${describe(el)} ${w}px wide`);
  }

  // A bead id is the one text the user copies whole, so an ellipsis on it hides part of the id.
  // Below 640px the 88px ID column is intended, so a long id may be cut there.
  for (const el of document.body.querySelectorAll('button[title^="Copy "]')) {
    if (window.innerWidth < idMinWidth) break;
    if (!visible(el) || inCanvas(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1 && out.idCut.length < 8) {
      out.idCut.push(`${describe(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
    }
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
const compared = { controls: 0, views: 0 };
let measuredPages = 0;
let measuredStates = 0;
let nativeDialogs = 0;

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
    if (m.mainFont < MIN_BASE_FONT) fail(width, label, `page base font (main under ${MIN_BASE_FONT}px)`, [`${m.mainFont}px`]);
    fail(width, label, `controls under ${MIN_TARGET}x${MIN_TARGET}`, m.smallTargets);
    fail(width, label, "a label wraps more than one control", m.sharedLabels);
  }
  fail(width, label, "control content spills out of its box", m.squashed);
  fail(width, label, "text cut to a sliver by an ellipsis (list row titles under 120px, other text under 60px)", m.slivers);
  fail(width, label, "bead id cut off by an ellipsis", m.idCut);
  fail(width, label, "graph nodes overlap", m.overlaps);
  // Without nodes the overlap check passes on nothing, so a graph view with none is a failure.
  if (label === "graph" && !m.graphNodes) fail(width, label, "no graph nodes were measured", ["the graph view showed no node"]);
  fail(width, label, "markdown block wider than its box with no scroller", m.wideBlocks);
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
  {
    name: "report-menu",
    open: async (p) => {
      const menu = p.locator('button[aria-label="Open navigation and project menu"]');
      if (await menu.isVisible()) await menu.click();
      await p.getByRole("button", { name: /Report \/ request/ }).first().click();
      await p.getByRole("menuitem", { name: /Report a bug/ }).waitFor({ timeout: 5000 });
    },
  },
  {
    name: "drawer-assignee",
    view: "drawer",
    open: async (p) => {
      await p.getByRole("button", { name: "Change assignee" }).click();
      await p.locator('input[aria-label="Assignee"]').waitFor({ timeout: 5000 });
    },
  },
  {
    name: "drawer-add-dependency",
    view: "drawer",
    open: async (p) => {
      await p.getByRole("button", { name: /Add dependency/ }).click();
      const search = p.locator('input[aria-label="Search dependency beads"]');
      await search.waitFor({ timeout: 5000 });
      await search.fill("bd-");
      await p.waitForTimeout(300);
    },
  },
  {
    name: "new-epic-modal",
    view: "epics",
    open: async (p) => {
      await p.getByRole("button", { name: /New epic/ }).click();
      await p.getByRole("dialog").first().waitFor({ timeout: 5000 });
    },
  },
  // Not opened, and the reason:
  //  - drawer epic picker: the drawer Epic field is a link to the parent, not a picker.
  // The delete confirm is a native window.confirm. It is browser UI, not page content, so
  // the audit cannot measure it. The step below opens it and dismisses it (nativeDialogs).
];

// A description with the markdown that the demo data lacks: a standalone link, an inline
// link, a task list, a table wider than the screen and a code block with a long line.
const FIXTURE_BEAD = "bd-7e40.2";
const FIXTURE_MARK = "Fixture standalone link";
const FIXTURE_DESCRIPTION = [
  "Intro text with an [inline link](https://example.com/inline) inside a sentence.",
  "",
  `[${FIXTURE_MARK}](https://example.com/alone)`,
  "",
  "- [ ] first task item",
  "- [x] second task item",
  "",
  "| unbreakable_column_heading_one | unbreakable_column_heading_two | unbreakable_column_heading_three |",
  "| --- | --- | --- |",
  "| unbreakable_cell_text_number_one | unbreakable_cell_text_number_two | unbreakable_cell_text_number_three |",
  "",
  "```sh",
  "echo this_is_a_very_long_line_of_code_that_cannot_wrap_and_must_scroll_inside_its_own_box_without_moving_the_page_sideways",
  "```",
].join("\n");

async function routeFixture(page) {
  await page.route("**/api/p/demo/beads", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    for (const b of json.beads || []) if (b.id === FIXTURE_BEAD) b.description = FIXTURE_DESCRIPTION;
    return route.fulfill({ response: res, json });
  });
}

// The demo ids are at most 9 characters, so they fit even in a narrow ID column. The list view
// gets one bead with a 14 character id, which is cut off by the old 88px column at 640-1023px.
const LONG_ID_BEAD = "bd-c552.3";
const LONG_ID = "bd-abcdef12345";

async function routeLongId(page) {
  await page.route("**/api/p/demo/beads", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    const json = await res.json();
    for (const b of json.beads || []) if (b.id === LONG_ID_BEAD) b.id = LONG_ID;
    return route.fulfill({ response: res, json });
  });
}

async function openView(page, view) {
  if (view === "drawer" || view === "drawer-markdown") await routeFixture(page);
  // The 1280px baseline was recorded with the demo ids, so desktop keeps them.
  if (view === "list" && page.viewportSize().width < 1280) await routeLongId(page);
  await page.goto(`${base}/p/demo?${viewQuery(view)}`, { waitUntil: "domcontentloaded" });
  await page.locator("main, [role='main'], h1, h2").first().waitFor({ timeout: 15000 });
  // The beads stream keeps the network busy, so wait a fixed time for the first render.
  await page.waitForTimeout(1500);
  if (view === "drawer") {
    // Without the fixture text on the page the markdown checks would pass on nothing.
    await page.getByText(FIXTURE_MARK).first().waitFor({ timeout: 10000 });
  }
  if (view === "list" && page.viewportSize().width < 1280) {
    // Without the long id on the page the id check would pass on nothing.
    await page.locator(`button[title="Copy ${LONG_ID}"]`).first().waitFor({ timeout: 10000 });
  }
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

// The sidebar footer shows "Build N . SHA". Returns that text, or "" when it is missing.
function parseBuildLine(text) {
  const found = String(text).match(/Build\s+(\S+)\s*·\s*([0-9a-f]{6,40})/);
  return found ? `Build ${found[1]} · ${found[2]}` : "";
}

// The verdict on the build probe: ok, or a message that says why the run must stop.
function buildVerdict(line, probeError) {
  if (line) return { ok: true, message: line };
  return {
    ok: false,
    message: probeError
      ? `could not read the build line: ${probeError}`
      : "no build line in the sidebar footer; build the app from a git checkout",
  };
}

// Font metrics depend on the browser, so a baseline only fits the browser that took it.
// Returns null when they match, or a one-line reason when they do not.
function compareBrowser(recorded, current) {
  if (!recorded || !recorded.name) {
    return "the baseline has no browser record; record it again with this script";
  }
  if (recorded.name !== current.name || recorded.executable !== current.executable) {
    return `the baseline was taken with ${recorded.name} (${recorded.executable}) ` +
      `but this run uses ${current.name} (${current.executable}); use the same browser, or record the baseline again`;
  }
  return null;
}

// Compare the recorded and the measured control sizes of one view.
// Controls are counted per key and size, so a duplicate that appears or disappears is reported.
// Desktop changes at 1280px that were agreed in a bead. Each line must match exactly.
const ACCEPTED_DESKTOP = new Map([
  ["now input[Search beads…  (/)] 149x19", "self-49j.3: the board header always wraps, so the search box is no longer collapsed to an icon"],
]);
let acceptedDesktop = 0;
function dropAccepted(lines) {
  return lines.filter((l) => {
    if (!ACCEPTED_DESKTOP.has(l)) return true;
    acceptedDesktop += 1;
    return false;
  });
}

function compareControls(before, after) {
  const count = (list) => {
    const m = new Map();
    for (const c of list) {
      const k = `${c.key} ${c.w}x${c.h}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const a = count(before);
  const b = count(after);
  const out = [];
  for (const [k, n] of b) if (n > (a.get(k) || 0)) out.push(`now ${k}${n - (a.get(k) || 0) > 1 || a.has(k) ? ` (+${n - (a.get(k) || 0)})` : ""}`);
  for (const [k, n] of a) if (n > (b.get(k) || 0)) out.push(`was ${k}${n - (b.get(k) || 0) > 1 || b.has(k) ? ` (-${n - (b.get(k) || 0)})` : ""}`);
  return out;
}

// Self-test: runs measure, report and compareControls on synthetic pages, with no server.
async function runSelftest() {
  const args = { minTarget: MIN_TARGET, minInputFont: MIN_INPUT_FONT, minTextFont: MIN_TEXT_FONT };
  const sized = "min-height:44px;min-width:44px";
  const cases = [
    {
      name: "AC 6: one checkbox in its own label passes",
      html: `<main style="font:16px sans-serif"><label style="display:flex;align-items:center;${sized}"><input type="checkbox"> One</label></main>`,
      kinds: (k) => k.length === 0,
    },
    {
      name: "AC 6: a label that wraps two checkboxes fails",
      html: `<main style="font:16px sans-serif"><label style="display:flex;align-items:center;${sized}"><input type="checkbox"><input type="checkbox"> Both</label></main>`,
      kinds: (k) => k.some((x) => x.includes("label wraps more than one control")),
    },
    {
      name: "AC 7: main at 12px fails the base font check",
      html: `<main style="font:12px sans-serif"><p>Twelve pixel text</p></main>`,
      kinds: (k) => k.some((x) => x.includes("page base font")),
    },
    {
      name: "AC 7: main at 14px passes the base font check",
      html: `<main style="font:14px sans-serif"><p>Fourteen pixel text</p></main>`,
      kinds: (k) => !k.some((x) => x.includes("page base font")),
    },
    {
      name: "AC 4: the compare key holds no class text, even with a bracket class",
      html: `<main style="font:16px sans-serif"><button class="w-[6px] flex w-full" style="${sized}">Go</button></main>`,
      controls: (c) => c.length === 1 && c[0].key === "button[Go]",
    },
    {
      name: "AC 14: a page with a build footer gives the build line",
      html: `<main style="font:16px sans-serif"><p>v0.4.0 <span>Build 209 <span>·</span></span> <a href="#">f99d76d</a></p></main>`,
      build: (text) => {
        const line = parseBuildLine(text);
        return { ok: line === "Build 209 · f99d76d" && buildVerdict(line, "").ok === true, detail: line || "empty" };
      },
    },
    {
      name: "AC 14: a page without a build footer gives no line and an exit 1 verdict",
      html: `<main style="font:16px sans-serif"><p>v0.4.0</p></main>`,
      build: (text) => {
        const line = parseBuildLine(text);
        const v = buildVerdict(line, "");
        return { ok: line === "" && v.ok === false && /no build line/.test(v.message), detail: v.message };
      },
    },
    {
      name: "AC 14: a probe error is named in the verdict",
      html: `<main>x</main>`,
      build: () => {
        const v = buildVerdict("", "page.goto: net::ERR_CONNECTION_REFUSED");
        return { ok: v.ok === false && v.message.includes("ERR_CONNECTION_REFUSED"), detail: v.message };
      },
    },
    {
      name: "eui AC 1: a list row title cut to 100px is a sliver",
      listView: true,
      html: `<main style="font:16px sans-serif"><div data-keyboard-bead-id="x" role="button"><span class="truncate" style="display:block;width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long list title that is cut off</span></div></main>`,
      kinds: (k) => k.some((x) => x.includes("sliver")),
    },
    {
      name: "eui AC 1: a list row title with 200px of room is not a sliver",
      listView: true,
      html: `<main style="font:16px sans-serif"><div data-keyboard-bead-id="x" role="button"><span class="truncate" style="display:block;width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long list title that is cut off</span></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("sliver")),
    },
    {
      name: "eui AC 1: a bead id button in a list row is not a row title",
      listView: true,
      html: `<main style="font:16px sans-serif"><div data-keyboard-bead-id="x" role="button"><button title="Copy bd-abcdef12345" class="truncate" style="display:block;width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px monospace;min-height:44px">bd-abcdef12345</button></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("sliver")),
    },
    {
      name: "eui AC 1: a chip cut to 100px outside the list is not a sliver",
      html: `<main style="font:16px sans-serif"><span style="display:block;width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">A long chip label that is cut</span></main>`,
      kinds: (k) => !k.some((x) => x.includes("sliver")),
    },
    {
      name: "eui AC 6: an inline link in a sentence of a description is exempt",
      html: `<main style="font:16px sans-serif"><div class="bd-md"><p>See <a href="#x">this link</a> in the text.</p></div></main>`,
      kinds: (k) => !k.some((x) => x.startsWith("controls under")),
    },
    {
      name: "eui AC 6: a standalone link in a description is measured",
      html: `<main style="font:16px sans-serif"><div class="bd-md"><p><a href="#x">alone on its line</a></p></div></main>`,
      kinds: (k) => k.some((x) => x.startsWith("controls under")),
    },
    {
      name: "eui AC 6: a link alone in a list item is exempt (the renderer adds no tap target there)",
      html: `<main style="font:16px sans-serif"><div class="bd-md"><ul><li><a href="#x">alone in an item</a></li></ul></div></main>`,
      kinds: (k) => !k.some((x) => x.startsWith("controls under")),
    },
    {
      name: "eui AC 6: a bold link inside a paragraph is exempt (the renderer adds no tap target there)",
      html: `<main style="font:16px sans-serif"><div class="bd-md"><p><strong><a href="#x">bold link</a></strong></p></div></main>`,
      kinds: (k) => !k.some((x) => x.startsWith("controls under")),
    },
    {
      name: "49j.3: a wide pane (bd-scroll) is a sideways scroller below the desktop width",
      html: `<main style="font:16px sans-serif"><div class="bd-scroll" style="width:200px;overflow-x:auto"><div style="width:600px">wide content</div></div></main>`,
      kinds: (k) => k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "49j.3: a column pane (bd-scroll, overflow-y hidden) is exempt from the desktop width up",
      deskWidth: 0,
      html: `<main style="font:16px sans-serif"><div class="bd-scroll" style="width:200px;overflow-x:auto;overflow-y:hidden"><div style="width:600px">wide content</div></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "49j.3: a matrix pane (bd-scroll with a min-w-max child) is exempt from the desktop width up",
      deskWidth: 0,
      html: `<main style="font:16px sans-serif"><div class="bd-scroll" style="width:200px;overflow:auto"><div class="lg:min-w-max" style="width:600px">wide matrix</div></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "49j.3: a vertical pane (bd-scroll, overflow-y auto) with wide content still fails at the desktop width",
      deskWidth: 0,
      html: `<main style="font:16px sans-serif"><div class="bd-scroll" style="width:200px;overflow-x:auto;overflow-y:auto"><div style="width:600px">wide content</div></div></main>`,
      kinds: (k) => k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "eui AC 4: a table that scrolls in its own box is not a page scroller",
      html: `<main style="font:16px sans-serif"><div class="bd-md" style="width:300px"><table style="display:block;overflow-x:auto"><tbody><tr><td style="white-space:nowrap">${"x".repeat(80)}</td></tr></tbody></table></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "eui AC 5: a markdown table wider than its box with no scroller fails",
      html: `<main style="font:16px sans-serif;overflow:hidden"><div class="bd-md" style="width:300px"><table><tbody><tr><td style="white-space:nowrap">${"x".repeat(80)}</td></tr></tbody></table></div></main>`,
      kinds: (k) => k.some((x) => x.includes("wider than its box")),
    },
    {
      name: "eui AC 5: a markdown table inside a scroller passes",
      html: `<main style="font:16px sans-serif;overflow:hidden"><div class="bd-md" style="width:300px"><div class="bd-md-scroll" style="overflow-x:auto"><table><tbody><tr><td style="white-space:nowrap">${"x".repeat(80)}</td></tr></tbody></table></div></div></main>`,
      kinds: (k) => !k.some((x) => x.includes("wider than its box")) && !k.some((x) => x.includes("an element scrolls sideways")),
    },
    {
      name: "eui AC 2: a 14 character bead id in an 88px column is cut off",
      html: `<main style="font:16px sans-serif"><button title="Copy bd-abcdef12345" class="truncate" style="display:block;width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px monospace;min-height:44px">bd-abcdef12345</button></main>`,
      kinds: (k) => k.some((x) => x.includes("bead id cut off")),
    },
    {
      name: "eui AC 2: a 14 character bead id in a 150px column fits",
      html: `<main style="font:16px sans-serif"><button title="Copy bd-abcdef12345" class="truncate" style="display:block;width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px monospace;min-height:44px">bd-abcdef12345</button></main>`,
      kinds: (k) => !k.some((x) => x.includes("bead id cut off")),
    },
    {
      name: "eui AC 7: two graph nodes that overlap fail",
      html: `<main style="font:16px sans-serif"><div class="react-flow__node" style="position:absolute;left:0;top:60px;width:100px;height:50px">A node</div><div class="react-flow__node" style="position:absolute;left:50px;top:80px;width:100px;height:50px">B node</div></main>`,
      kinds: (k) => k.some((x) => x.includes("graph nodes overlap")),
    },
    {
      name: "eui AC 7: a small overlap is found even when the graph is zoomed out to 0.2",
      html: `<main style="font:16px sans-serif"><div style="position:absolute;left:0;top:0;transform:scale(0.2);transform-origin:0 0"><div class="react-flow__node" style="position:absolute;left:0;top:0;width:100px;height:50px">A node</div><div class="react-flow__node" style="position:absolute;left:92px;top:0;width:100px;height:50px">B node</div></div></main>`,
      kinds: (k) => k.some((x) => x.includes("graph nodes overlap")),
    },
    {
      name: "eui AC 7: the graph view fails when no node was measured",
      html: `<main style="font:16px sans-serif"><p>An empty graph page</p></main>`,
      label: "graph",
      kinds: (k) => k.some((x) => x.includes("no graph nodes")),
    },
    {
      name: "eui AC 7: graph nodes that do not overlap pass",
      html: `<main style="font:16px sans-serif"><div class="react-flow__node" style="position:absolute;left:0;top:60px;width:100px;height:50px">A node</div><div class="react-flow__node" style="position:absolute;left:150px;top:60px;width:100px;height:50px">B node</div></main>`,
      kinds: (k) => !k.some((x) => x.includes("graph nodes overlap")),
    },
  ];
  const browser = await chromium.launch({ executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined });
  const results = [];
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
    for (const c of cases) {
      const page = await context.newPage();
      await page.setContent(c.html);
      if (c.build) {
        const text = await page.evaluate(() => document.body.innerText);
        try {
          const r = c.build(text);
          results.push({ name: c.name, ok: r.ok, detail: r.detail });
        } catch (e) {
          results.push({ name: c.name, ok: false, detail: `threw: ${String(e.message || e)}` });
        }
        await page.close();
        continue;
      }
      const m = await page.evaluate(measure, { ...args, listView: Boolean(c.listView), idMinWidth: 0, deskWidth: c.deskWidth ?? 1024 });
      failures.length = 0;
      report(360, c.label || c.name, m);
      const kinds = failures.map((f) => f.kind);
      const ok = c.kinds ? c.kinds(kinds) : c.controls(m.controls);
      results.push({ name: c.name, ok, detail: c.kinds ? kinds.join(" | ") || "no failures" : JSON.stringify(m.controls.map((x) => x.key)) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const dup = { key: "button[Go]", w: 44, h: 44 };
  const lost = compareControls([dup, dup], [dup]);
  results.push({ name: "AC 3: a lost duplicate control is reported", ok: lost.length === 1, detail: lost.join(" | ") || "nothing reported" });
  const gained = compareControls([dup], [dup, dup]);
  results.push({ name: "AC 3: an extra duplicate control is reported", ok: gained.length === 1, detail: gained.join(" | ") || "nothing reported" });
  const accepted = "now input[Search beads…  (/)] 149x19";
  const keptOther = dropAccepted([accepted, "now button[Other] 10x10"]);
  results.push({ name: "49j.3: only the agreed desktop change is dropped from the compare", ok: keptOther.length === 1 && keptOther[0].includes("Other"), detail: keptOther.join(" | ") });
  const keptSize = dropAccepted(["now input[Search beads…  (/)] 150x19"]);
  results.push({ name: "49j.3: the same control at another size is still reported", ok: keptSize.length === 1, detail: keptSize.join(" | ") || "nothing reported" });
  acceptedDesktop = 0;
  const unit = (name, fn) => {
    try {
      const r = fn();
      results.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      results.push({ name, ok: false, detail: `threw: ${String(e.message || e)}` });
    }
  };
  const here = { name: "chromium 131.0.1", executable: "/usr/bin/google-chrome" };
  unit("AC 13: the same browser matches", () => {
    const p = compareBrowser({ ...here }, here);
    return { ok: p === null, detail: String(p) };
  });
  unit("AC 13: a different executable is reported with both names", () => {
    const p = compareBrowser({ ...here, executable: "playwright-bundled" }, here);
    return { ok: typeof p === "string" && p.includes("playwright-bundled") && p.includes("/usr/bin/google-chrome"), detail: String(p).slice(0, 90) };
  });
  unit("AC 13: a different version is reported", () => {
    const p = compareBrowser({ ...here, name: "chromium 130.0.9" }, here);
    return { ok: typeof p === "string" && p.includes("chromium 130.0.9"), detail: String(p).slice(0, 90) };
  });
  unit("AC 13: a missing browser record is reported", () => {
    const p = compareBrowser(undefined, here);
    return { ok: typeof p === "string" && p.includes("no browser record"), detail: String(p).slice(0, 90) };
  });
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}  (${r.detail})`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`mobile-layout selftest: ${bad} failing of ${results.length} cases`);
  process.exit(bad ? 1 : 0);
}

if (selftest) await runSelftest();

const browser = await chromium.launch({
  executablePath: process.env.SCOTTY_BROWSER_EXECUTABLE || undefined,
});
const currentBrowser = {
  name: `chromium ${browser.version()}`,
  executable: process.env.SCOTTY_BROWSER_EXECUTABLE || "playwright-bundled",
};

// The first output line names the build that the server serves, so a log ties to a commit.
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  let line = "";
  let probeError = "";
  try {
    await openView(page, "board");
    line = parseBuildLine(await page.evaluate(() => document.body.innerText));
  } catch (e) {
    probeError = String(e.message || e).split("\n")[0];
  }
  console.log(`served build: ${line || "unknown"}`);
  await context.close();
  const verdict = buildVerdict(line, probeError);
  if (!verdict.ok) {
    console.error(verdict.message);
    await browser.close();
    process.exit(1);
  }
  console.log(`browser: ${currentBrowser.name} (${currentBrowser.executable})`);
} catch (e) {
  await browser.close();
  throw e;
}

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
          listView: view === "list",
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
        measuredPages += 1;
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
        const label = `${st.view || "board"}+${st.name}`;
        const page = await context.newPage();
        page.on("pageerror", (e) => errors.push(`${width}px ${label}: ${e.message}`));
        try {
          await openView(page, st.view || "board");
          await st.open(page);
          await page.waitForTimeout(500);
          const m = await page.evaluate(measure, {
            minTarget: MIN_TARGET, minInputFont: MIN_INPUT_FONT, minTextFont: MIN_TEXT_FONT,
          });
          if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${st.name}-${width}.png`) });
          report(width, label, m);
          measuredPages += 1;
          measuredStates += 1;
        } catch (e) {
          fail(width, label, "audit error: could not open the state", [String(e.message || e).split("\n")[0]]);
        } finally {
          await page.close();
        }
      }
    }
    if (width <= 768) {
      // The delete confirm is a native dialog. Open it, check its text, dismiss it (no delete).
      const label = "drawer+delete-confirm";
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${width}px ${label}: ${e.message}`));
      try {
        await openView(page, "drawer");
        let seen = "";
        page.once("dialog", async (d) => { seen = d.message(); await d.dismiss(); });
        await page.locator('button[title="Delete"]').click({ timeout: 5000 });
        await page.waitForTimeout(500);
        if (/^Delete \S+\?/.test(seen)) nativeDialogs += 1;
        else fail(width, label, "audit error: the delete confirm did not open", [seen ? `unexpected text: ${seen.slice(0, 40)}` : "no dialog appeared"]);
      } catch (e) {
        fail(width, label, "audit error: could not open the state", [String(e.message || e).split("\n")[0]]);
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
  // A resized sidebar (up to 400px) leaves less room for the page header. Layout-only checks.
  for (const width of [1024, 1100, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addInitScript(() => window.localStorage.setItem("bmus.width.sidebar", "400"));
    for (const view of ["board", "list", "epics", "focus"]) {
      if (!views.includes(view)) continue;
      // List rows wrap by viewport width, not pane width, so titles are cut with a 400px sidebar below
      // 1280px. That is a known gap, filed as its own bead; the list header is still checked at 1280+.
      if (view === "list" && width < 1280) continue;
      const label = `${view}+sidebar-400`;
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${width}px ${label}: ${e.message}`));
      try {
        await openView(page, view);
        const m = await page.evaluate(measure, {
          minTarget: MIN_TARGET, minInputFont: MIN_INPUT_FONT, minTextFont: MIN_TEXT_FONT,
          listView: view === "list",
        });
        report(width, label, m, true);
        measuredPages += 1;
      } catch (e) {
        fail(width, label, "audit error", [String(e.message || e).split("\n")[0]]);
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
    fs.writeFileSync(snapshotFile, JSON.stringify({ __browser: currentBrowser, ...desktop }, null, 1));
    console.log(`recorded 1280px control sizes to ${snapshotFile} with ${currentBrowser.name}`);
  } else {
    const before = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    const browserProblem = compareBrowser(before.__browser, currentBrowser);
    if (browserProblem) fail(1280, "baseline", "baseline browser differs", [browserProblem]);
    for (const view of browserProblem ? [] : views) {
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
      compared.controls += desktop[view].length;
      compared.views += 1;
      fail(1280, view, "desktop control size changed", dropAccepted(compareControls(before[view], desktop[view])).slice(0, 12));
    }
    console.log(browserProblem
      ? "compare not run: the baseline browser differs"
      : `compare: ${compared.controls} controls in ${compared.views} views at 1280px` +
        (acceptedDesktop ? `; ${acceptedDesktop} accepted change(s): ${[...ACCEPTED_DESKTOP.values()].join("; ")}` : ""));
  }
} else {
  console.log("compare skipped: SCOTTY_LAYOUT_SNAPSHOT not set");
}

for (const f of failures) {
  console.log(`FAIL ${f.width}px ${f.view}: ${f.kind} (${f.items.length})`);
  for (const item of f.items.slice(0, 6)) console.log(`    ${item}`);
  if (f.items.length > 6) console.log(`    ... ${f.items.length - 6} more`);
}
for (const e of errors) console.log(`PAGE ERROR ${e}`);

const brokenViews = new Set(failures.map((f) => f.view));
console.log(
  `mobile-layout: measured ${measuredPages} pages (${views.length} views, ${measuredStates} open states) ` +
  `at ${widths.join(", ")} px plus ${layoutOnlyWidths.join(", ")} px layout-only, plus 1024, 1100, 1280, 1440 px with a 400px sidebar; ` +
  `${nativeDialogs} native delete confirms opened (not measurable)`,
);
console.log(
  `mobile-layout: ${failures.length} failing checks in ${brokenViews.size} views or states ` +
  `[${[...brokenViews].join(", ") || "none"}]`,
);
process.exit(failures.length || errors.length ? 1 : 0);
