// Manual order stored in beads metadata (the opt-in "beads" order store).
//
// 1. The rank planner (lib/order-ranks.ts), in plain Node.
// 2. The order API and the Board against an isolated, writable demo server
//    started with the beads store. The demo store keeps ranks in memory, so
//    start a fresh server for each run:
//      BEADS_DEMO=1 SCOTTY_ORDER_STORE=beads POSTHOG_KEY='' XDG_CONFIG_HOME=/tmp/scotty-order-test npm run start -- --port 3198
//      SCOTTY_TEST_URL=http://127.0.0.1:3198 node scripts/test-order-store.mjs
// 3. A real bd repo across a server restart, when `bd` is on PATH: the test
//    makes a throwaway repo and config directory, starts its own server from
//    this build on them twice, and removes them afterwards.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { RANK_STEP, planRanks } from "../lib/order-ranks.ts";

const RANK = "scotty.rank";

// How the Board shows a column: ranked beads by rank, then unranked ones by the fallback.
const shown = (ids, ranks, fallback) => [...ids].sort((x, y) => {
  const rx = ranks.get(x) ?? null;
  const ry = ranks.get(y) ?? null;
  if (rx !== null && ry !== null && rx !== ry) return rx - ry;
  if (rx !== null && ry === null) return -1;
  if (rx === null && ry !== null) return 1;
  return fallback(x) - fallback(y);
});
const plan = (ids, ranks, fallback) => planRanks(ids, (id) => ranks.get(id) ?? null, fallback);
const apply = (ranks, writes) => new Map([...ranks, ...writes]);

// ---- 1. The rank planner ----------------------------------------------------
{
  const fb = (order) => (id) => order.indexOf(id);
  const none = new Map();

  // An unranked column in its fallback order needs no rank at all.
  assert.equal(plan(["a", "b", "c"], none, fb(["a", "b", "c"])).size, 0);
  // Moving one unranked card to the top ranks only that card.
  {
    const w = plan(["c", "a", "b"], none, fb(["a", "b", "c"]));
    assert.deepEqual([...w.keys()], ["c"]);
    assert.deepEqual(shown(["a", "b", "c"], apply(none, w), fb(["a", "b", "c"])), ["c", "a", "b"]);
  }
  // A ranked column: one drag writes one bead, with a rank from the gap. (A swap
  // of two neighbours could write either one, so these moves go further.)
  const ranked = new Map([["a", 0], ["b", RANK_STEP], ["c", 2 * RANK_STEP], ["d", 3 * RANK_STEP]]);
  for (const [target, moved, check] of [
    [["d", "a", "b", "c"], "d", (r) => r < 0],
    [["b", "c", "a", "d"], "a", (r) => r > 2 * RANK_STEP && r < 3 * RANK_STEP],
    [["b", "c", "d", "a"], "a", (r) => r > 3 * RANK_STEP],
  ]) {
    const w = plan(target, ranked, fb([]));
    assert.deepEqual([...w.keys()], [moved], `moving ${moved} writes only ${moved}`);
    assert.ok(check(w.get(moved)) && Number.isInteger(w.get(moved)), `rank ${w.get(moved)} for ${moved}`);
  }
  assert.equal(plan(["a", "b", "c", "d"], ranked, fb([])).size, 0, "an unchanged order writes nothing");
  assert.equal(plan(["b", "a", "c", "d"], ranked, fb([])).size, 1, "a swap of neighbours writes one of them");

  // Repeated drops into one gap: one write each until the gap runs out, then one renumber.
  {
    let ranks = new Map([["top", 0], ["bottom", RANK_STEP]]);
    let order = ["top", "bottom"];
    const sizes = [];
    for (let n = 0; n < 12; n++) {
      const id = `new-${n}`;
      order = [order[0], id, ...order.slice(1)];
      const w = plan(order, ranks, fb([]));
      sizes.push(w.size);
      ranks = apply(ranks, w);
      assert.deepEqual(shown(order, ranks, fb([])), order, `drop ${n} keeps the order`);
      assert.ok([...w.values()].every(Number.isInteger));
    }
    assert.deepEqual(sizes.slice(0, 10), Array(10).fill(1), "ten drops into a 1024 gap write one bead each");
    assert.ok(sizes.slice(10).some((s) => s > 1), "the gap runs out and the column is renumbered");
  }

  // Ranks an agent set by hand need not be integers or far apart.
  assert.deepEqual([...plan(["a", "c", "b"], new Map([["a", 0.5], ["b", 1.5]]), fb(["c"]))], [["c", 1]]);
  {
    const ranks = new Map([["a", 0.25], ["b", 0.75]]);
    const w = plan(["a", "c", "b"], ranks, fb(["c"]));
    assert.deepEqual(shown(["a", "b", "c"], apply(ranks, w), fb(["c"])), ["a", "c", "b"], "no integer fits: renumber");
  }

  // Random columns and moves: the planned writes always give the requested order,
  // and an unchanged order with distinct ranks writes nothing.
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let trial = 0; trial < 2000; trial++) {
    const n = 1 + rnd(12);
    const ids = Array.from({ length: n }, (_, i) => `b${i}`);
    const fallbackOrder = [...ids].sort(() => rnd(3) - 1);
    const fallback = fb(fallbackOrder);
    const ranks = new Map();
    for (const id of ids) if (rnd(3)) ranks.set(id, rnd(4) ? rnd(50) * 16 : rnd(5) + rnd(2) / 2);
    const current = shown(ids, ranks, fallback);
    const target = [...current];
    if (rnd(2)) { const [x] = target.splice(rnd(n), 1); target.splice(rnd(n), 0, x); }
    else target.sort(() => rnd(3) - 1);
    const w = plan(target, ranks, fallback);
    assert.deepEqual(shown(ids, apply(ranks, w), fallback), target, `trial ${trial}`);
    assert.ok([...w.values()].every(Number.isInteger), `trial ${trial}: integer ranks`);
    if (new Set(ranks.values()).size === ranks.size) {
      assert.equal(plan(current, ranks, fallback).size, 0, `trial ${trial}: unchanged order`);
    }
  }
  console.log("PASS: rank planner (sparse ranks, one write per drag, renumber only when a gap runs out)");
}

// ---- 2. Order API and Board, demo server ------------------------------------
const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated, writable demo server started with SCOTTY_ORDER_STORE=beads");

function api(root) {
  const call = async (method, p, body, headers = {}) => {
    const res = await fetch(`${root}${p}`, {
      method,
      headers: { "content-type": "application/json", origin: root, cookie: "scotty-viewer-mode=editing", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, data: json.data ?? json };
  };
  const ok = async (...args) => {
    const r = await call(...args);
    assert.ok(r.status >= 200 && r.status < 300, `${args[0]} ${args[1]} -> ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  };
  const beadsOf = async (pid) => (await ok("GET", `/api/p/${pid}/beads`)).beads;
  const orderOf = async (pid) => (await ok("GET", `/api/p/${pid}/order`)).orders;
  const putOrder = (pid, columnId, ids) => ok("PUT", `/api/p/${pid}/order`, { columnId, ids });
  const setStore = (orderStore, headers) => ok("PUT", "/api/config", { orderStore }, headers);
  // A column's cards as the Board shows them: the order API's list, then the rest by priority and list order.
  const shownOf = async (pid, columnId, ids) => {
    const [beads, orders] = [await beadsOf(pid), await orderOf(pid)];
    const at = new Map((orders[columnId] ?? []).map((id, i) => [id, i]));
    const index = new Map(beads.map((b, i) => [b.id, { b, i }]));
    return shown(ids, at, (id) => index.get(id).b.priority * beads.length + index.get(id).i);
  };
  // updated_at of every bead, to count which beads a request wrote.
  const stamp = async (pid) => Object.fromEntries((await beadsOf(pid)).map((b) => [b.id, b.updated_at]));
  const written = async (pid, before) => {
    const after = await stamp(pid);
    return Object.keys(after).filter((id) => after[id] !== before[id]);
  };
  const tick = () => new Promise((r) => setTimeout(r, 15));
  return { call, ok, beadsOf, orderOf, putOrder, setStore, shownOf, stamp, written, tick };
}

{
  const { call, ok, beadsOf, orderOf, putOrder, setStore, shownOf, stamp, written, tick } = api(base);
  const pid = "demo";
  assert.equal((await ok("GET", `/api/p/${pid}/beads`)).meta.orderStore, "beads", "start the server with SCOTTY_ORDER_STORE=beads");
  await setStore("beads");

  const all = await beadsOf(pid);
  const ready = all.filter((b) => b.status === "open" && !(b.dependencies ?? []).length).map((b) => b.id);
  assert.ok(ready.length >= 4, "demo data needs four unblocked open beads");
  const started = all.filter((b) => b.status === "in_progress" || b.status === "hooked").map((b) => b.id);
  assert.ok(started.length >= 2, "demo data needs two started beads");

  // Rank the column: the first card to the bottom leaves only that card unranked.
  // Then move one card: one bead written, with a rank from the gap.
  const initial = await shownOf(pid, "ready", ready);
  const rotated = [...initial.slice(1), initial[0]];
  await putOrder(pid, "ready", rotated);
  assert.deepEqual(await shownOf(pid, "ready", ready), rotated);
  const [x0, x1, x2, x3] = rotated;
  const moved = [x1, x2, x0, ...rotated.slice(3)];
  let before = await stamp(pid);
  await tick();
  await putOrder(pid, "ready", moved);
  assert.deepEqual(await written(pid, before), [x0], "one drag writes only the moved bead");
  assert.deepEqual(await shownOf(pid, "ready", ready), moved);
  const rankOf = async (id) => (await beadsOf(pid)).find((b) => b.id === id).metadata?.[RANK];
  const [r0, r2, r3] = [await rankOf(x0), await rankOf(x2), await rankOf(x3)];
  assert.ok(r2 < r0 && (r3 === undefined || r0 < r3), `the moved bead's rank ${r0} sits between ${r2} and ${r3}`);

  // An unchanged order and a read write nothing.
  before = await stamp(pid);
  await tick();
  await putOrder(pid, "ready", moved);
  await orderOf(pid);
  assert.deepEqual(await written(pid, before), [], "an unchanged order and a GET write nothing");

  // The order of a ranked column lists all of its cards, the unranked last, so the
  // Board and the List view (which break ties differently) agree.
  const listed = (await orderOf(pid)).ready;
  assert.ok(ready.every((id) => listed.includes(id)), "a ranked column's order lists its unranked cards too");
  assert.deepEqual(listed.filter((id) => ready.includes(id)), moved);

  // A card that is in another column takes no rank from this one.
  before = await stamp(pid);
  await tick();
  await putOrder(pid, "ready", [started[0], ...moved]);
  assert.deepEqual(await written(pid, before), [], "a card from another column is not written");
  assert.ok(!(await orderOf(pid)).ready.includes(started[0]));

  // The request guard and read-only mode refuse order writes.
  const other = [x2, ...moved.filter((id) => id !== x2)];
  for (const [what, headers] of [
    ["read-only mode", { cookie: "scotty-viewer-mode=read-only" }],
    ["a cross-site request", { origin: "http://evil.example" }],
  ]) {
    before = await stamp(pid);
    await tick();
    const r = await call("PUT", `/api/p/${pid}/order`, { columnId: "ready", ids: other }, headers);
    assert.equal(r.status, 403, `${what}: order write refused`);
    assert.deepEqual(await written(pid, before), [], `${what}: nothing written`);
  }

  // Overlapping reorders: the result is exactly one of the requested orders.
  const orders = [moved, other, [...moved].reverse(), [x0, x2, x1, ...moved.slice(3)]];
  for (let round = 0; round < 3; round++) {
    await Promise.all(orders.map((ids) => putOrder(pid, "ready", ids)));
    const final = await shownOf(pid, "ready", ready);
    assert.ok(orders.some((ids) => JSON.stringify(ids) === JSON.stringify(final)), `overlapping PUTs left a mixed order: ${final}`);
  }
  const beadsOrder = await shownOf(pid, "ready", ready);

  // Local mode keeps the order in config.json and never touches metadata.
  await setStore("local");
  assert.equal((await ok("GET", `/api/p/${pid}/beads`)).meta.orderStore, "local");
  before = await stamp(pid);
  await tick();
  await putOrder(pid, "ready", ready);
  assert.deepEqual((await orderOf(pid)).ready, ready);
  assert.deepEqual(await written(pid, before), [], "local mode writes no metadata");

  // Switching back copies nothing into a column that already holds ranks.
  await setStore("beads");
  assert.deepEqual(await written(pid, before), [], "a ranked column is never overwritten by the copy");
  assert.deepEqual(await shownOf(pid, "ready", ready), beadsOrder);

  // An unranked column gets the saved order copied once, when the setting flips on
  // in a writable request. In read-only mode the board shows the saved order and
  // the first order write copies it.
  const saved = [...started].reverse();
  await setStore("local");
  await putOrder(pid, "in_progress", saved);
  before = await stamp(pid);
  await tick();
  await setStore("beads", { cookie: "scotty-viewer-mode=read-only" });
  assert.deepEqual(await written(pid, before), [], "switching on in read-only mode writes nothing");
  assert.deepEqual(await shownOf(pid, "in_progress", started), saved, "until it is copied, the saved order shows");
  await setStore("local");
  await setStore("beads");
  assert.deepEqual((await written(pid, before)).sort(), [...started].sort(), "switching on copies the saved order");
  assert.deepEqual(await shownOf(pid, "in_progress", started), saved);
  before = await stamp(pid);
  await tick();
  await setStore("local");
  await setStore("beads");
  assert.deepEqual(await written(pid, before), [], "the copy runs once per column");

  // The Board: a drag writes one bead and survives a reload; a failed write puts
  // the card back, says so, and reloads the order from the server.
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
    await context.addCookies([{ name: "scotty-viewer-mode", value: "editing", url: base }]);
    await context.addInitScript(() => localStorage.setItem("bmus.board", JSON.stringify({ sortMode: "manual" })));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const card = (id) => page.locator(`main [data-keyboard-bead-id="${id}"]`);
    const readyCards = () => page.getByText("Ready", { exact: true }).locator("xpath=ancestor::section[1]").locator("article");
    const readyIds = () => readyCards().evaluateAll((cards) => cards.map((c) => c.dataset.keyboardBeadId));
    const drag = async (sourceId, targetId) => {
      const from = await card(sourceId).boundingBox();
      const to = await card(targetId).boundingBox();
      assert.ok(from && to, `drag targets must be visible: ${sourceId} -> ${targetId}`);
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 2 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
      await page.mouse.up();
    };
    await page.goto(`${base}/p/${pid}`);
    await readyCards().first().waitFor();
    // Rank every card the column shows but the last, so the drag below has ranked neighbours.
    const shownFirst = await readyIds();
    assert.ok(shownFirst.length >= 4, "the Ready column shows four cards");
    await putOrder(pid, "ready", [...shownFirst.slice(1), shownFirst[0]]);
    await page.reload();
    await readyCards().first().waitFor();
    const start = await readyIds();
    assert.deepEqual(start, [...shownFirst.slice(1), shownFirst[0]]);

    let fail = true;
    const orderReads = [];
    await page.route("**/api/p/demo/order", (route) => {
      if (route.request().method() === "GET") { orderReads.push(Date.now()); return route.continue(); }
      if (!fail) return route.continue();
      fail = false;
      return route.fulfill({ status: 500, json: { error: "bd update failed (test)", code: "bd_error" } });
    });
    const readsBefore = orderReads.length;
    const failed = page.waitForResponse((r) => r.url().endsWith("/order") && r.request().method() === "PUT");
    await drag(start[0], start[2]);
    await failed;
    await page.getByText("bd update failed (test)").first().waitFor();
    for (const end = Date.now() + 5000; JSON.stringify(await readyIds()) !== JSON.stringify(start);) {
      assert.ok(Date.now() < end, `a failed write puts the card back: ${await readyIds()}`);
      await page.waitForTimeout(100);
    }
    for (const end = Date.now() + 5000; orderReads.length === readsBefore;) {
      assert.ok(Date.now() < end, "a failed write reloads the order from the server");
      await page.waitForTimeout(100);
    }

    before = await stamp(pid);
    await tick();
    const saved = page.waitForResponse((r) => r.url().endsWith("/order") && r.request().method() === "PUT" && r.ok());
    await drag(start[0], start[2]);
    await saved;
    const after = await readyIds();
    assert.deepEqual(after, [start[1], start[2], start[0], ...start.slice(3)], "the drag moved the card");
    const w = await written(pid, before);
    assert.equal(w.length, 1, "a Board drag writes one bead");
    await page.reload();
    await readyCards().first().waitFor();
    assert.deepEqual(await readyIds(), after, "the order survives a reload");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log("PASS: order API and Board on the beads store (one write per drag, guards, copy once, rollback on a failed write)");
}

// ---- 3. A real bd repo across a server restart ------------------------------
let hasBd = true;
try { execFileSync("bd", ["version"], { stdio: "ignore" }); } catch { hasBd = false; }
if (!hasBd) {
  console.log("SKIP: no bd on PATH, so the real-repo check did not run");
} else {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "scotty-order-")));
  const repo = path.join(tmp, "repo");
  const config = path.join(tmp, "config");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("bd", ["init", "--quiet", "--non-interactive", "--prefix", "ord"], { cwd: repo, stdio: "ignore" });
  const freePort = () => new Promise((resolve) => {
    const srv = net.createServer().listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
  const serve = async () => {
    const port = await freePort();
    const env = { ...process.env, SCOTTY_ORDER_STORE: "beads", XDG_CONFIG_HOME: config, POSTHOG_KEY: "" };
    delete env.SCOTTY_READ_ONLY;
    delete env.BEADS_DEMO;
    const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: root, env, stdio: "ignore" });
    child.exited = new Promise((resolve) => child.on("exit", resolve));
    const url = `http://127.0.0.1:${port}`;
    for (const deadline = Date.now() + 30000; ;) {
      try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* not up yet */ }
      assert.ok(Date.now() < deadline, "the test server did not start");
      await new Promise((r) => setTimeout(r, 250));
    }
    return { url, stop: async () => { child.kill("SIGTERM"); await child.exited; } };
  };

  let server = null;
  try {
    server = await serve();
    let s = api(server.url);
    const pid = (await s.ok("POST", "/api/projects", { path: repo })).id;
    const saved = JSON.parse(fs.readFileSync(path.join(config, "bead-me-up-scotty", "config.json"), "utf8"));
    assert.ok(!("orderStore" in saved), "the SCOTTY_ORDER_STORE default is not written to config.json");
    const ids = [];
    for (const title of ["order-a", "order-b", "order-c"]) ids.push((await s.ok("POST", `/api/p/${pid}/beads`, { title, issue_type: "task", priority: 2 })).id);
    const target = (await s.shownOf(pid, "ready", ids)).reverse();
    await s.putOrder(pid, "ready", target);
    assert.deepEqual(await s.shownOf(pid, "ready", ids), target);

    // bd itself now sees the ranks; the planner left the last card unranked, and unranked sorts last.
    const listed = JSON.parse(execFileSync("bd", ["list", "--json"], { cwd: repo, encoding: "utf8" }));
    const rank = (id) => listed.find((b) => b.id === id)?.metadata?.[RANK] ?? Infinity;
    assert.deepEqual([...ids].sort((x, y) => rank(x) - rank(y)), target, "bd list --json carries the order");

    await server.stop();
    server = await serve();
    s = api(server.url);
    assert.deepEqual(await s.shownOf(pid, "ready", ids), target, "a fresh server returns the same order");
  } finally {
    if (server) await server.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("PASS: real bd repo (bd list --json sees the order, and it survives a server restart)");
}
