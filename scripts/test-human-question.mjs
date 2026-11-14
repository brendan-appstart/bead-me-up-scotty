// The `human-question` opt-in (#88). Isolated editable server only. The first
// part loads the real lib module without a server and the second uses only
// intercepted demo fixtures. The others write to a throwaway bd repo (skipped
// when bd is not installed) and to the server's in-memory demo store.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { chromium } from "playwright";

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {};
  cache.set(name, exports);
  const code = ts.transpileModule(fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (id) => (id.startsWith("./") ? load(id.slice(2)) : nodeRequire(id)) });
  return exports;
}
const { isHumanQuestion, waitingOnAnswer, HUMAN_QUESTION_LABEL } = load("beads-view");

const bead = (id, extra = {}) => ({
  id,
  title: `Question ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});
const on = (type, target) => ({ issue_id: "x", depends_on_id: target, type });

// ---- the rule, on the real module ----

assert.equal(HUMAN_QUESTION_LABEL, "human-question");
assert.equal(isHumanQuestion(bead("q", { labels: ["human", "human-question"] })), true);
assert.equal(isHumanQuestion(bead("plain", { labels: ["human"] })), false, "the default stays: no label, no close");
assert.equal(isHumanQuestion(bead("none")), false);
assert.equal(isHumanQuestion(bead("no-labels", { labels: undefined })), false);

const all = [
  bead("q"),
  bead("w-blocks", { dependencies: [on("blocks", "q")] }),
  bead("w-conditional", { dependencies: [on("conditional-blocks", "q")] }),
  bead("w-waits", { dependencies: [on("waits-for", "q")] }),
  bead("w-done", { status: "closed", dependencies: [on("blocks", "q")] }),
  bead("w-deferred", { status: "deferred", dependencies: [on("blocks", "q")] }),
  bead("w-pinned", { status: "pinned", dependencies: [on("blocks", "q")] }),
  bead("w-busy", { status: "in_progress", dependencies: [on("blocks", "q")] }),
  bead("w-related", { dependencies: [on("related", "q")] }),
  bead("w-child", { dependencies: [on("parent-child", "q")] }),
  bead("w-other", { dependencies: [on("blocks", "other")] }),
];
assert.deepEqual(
  waitingOnAnswer("q", all).map((b) => b.id),
  ["w-blocks", "w-conditional", "w-waits", "w-busy"],
  "only active beads with a blocking dependency wait on the answer: not closed, deferred or pinned",
);
assert.deepEqual(waitingOnAnswer("nobody-waits", all), []);
console.log("PASS human-question: the label rule and the waiting count");

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated app server");
const json = { "Content-Type": "application/json" };

// ---- the card, on intercepted demo fixtures ----

const question = bead("hq-1", { title: "Which sign-in provider?", labels: ["human", "human-question"] });
const plain = bead("hq-plain", { title: "Agent asks on its own work bead", labels: ["human"] });
const lone = bead("hq-lone", { title: "A question nothing waits on", labels: ["human", "human-question"] });
const fixtures = [
  question,
  plain,
  lone,
  bead("hq-w1", { title: "Build sign-in", dependencies: [on("blocks", "hq-1")] }),
  bead("hq-w2", { title: "Write sign-in docs", dependencies: [on("blocks", "hq-1")] }),
  bead("hq-w3", { title: "Shipped already", status: "closed", dependencies: [on("blocks", "hq-1")] }),
  bead("hq-w5", { title: "Set aside", status: "deferred", dependencies: [on("blocks", "hq-1")] }),
  bead("hq-w4", { title: "Waits on the plain one", dependencies: [on("blocks", "hq-plain")] }),
];
const writes = [];

const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url()).pathname;
    if (url.endsWith("/beads/stream")) return route.abort();
    if (request.method() === "GET") {
      if (url.endsWith("/beads")) {
        return route.fulfill({
          json: {
            beads: fixtures,
            meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300_000 },
          },
        });
      }
      return route.fulfill({ json: fixtures.find((entry) => url.endsWith(`/beads/${entry.id}`)) ?? {} });
    }
    writes.push({ path: url, body: request.postDataJSON() });
    return route.fulfill({ json: fixtures.find((entry) => url.endsWith(`/beads/${entry.id}/human`)) ?? {} });
  });

  await page.goto(`${base}/p/demo`);
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: /^Needs You(?:\s+\d+)?$/ }).click();

  const qCard = page.locator('[data-keyboard-bead-id="hq-1"]');
  const plainCard = page.locator('[data-keyboard-bead-id="hq-plain"]');
  const loneCard = page.locator('[data-keyboard-bead-id="hq-lone"]');
  await qCard.waitFor();

  // A human-question card says before the click that both buttons close the bead.
  await qCard.getByRole("button", { name: "Respond & close", exact: true }).waitFor();
  await qCard.getByRole("button", { name: "Dismiss & close", exact: true }).waitFor();
  await qCard.getByPlaceholder("Answer the agent's question… (posts a comment and closes the bead)", { exact: true }).waitFor();
  // The default card is unchanged.
  await plainCard.getByRole("button", { name: "Respond", exact: true }).waitFor();
  await plainCard.getByRole("button", { name: "Dismiss", exact: true }).waitFor();
  await plainCard.getByPlaceholder("Answer the agent's question… (posts a comment; the bead stays open)", { exact: true }).waitFor();
  assert.equal(await plainCard.getByRole("button", { name: /close/ }).count(), 0, "a plain card never offers to close");

  // The hint counts the open beads that wait on the answer, on either kind of card.
  const qHint = qCard.getByText(/waiting on this answer/);
  assert.equal((await qHint.innerText()).trim(), "2 beads are waiting on this answer: hq-w1, hq-w2.");
  const plainHint = plainCard.getByText(/waiting on this answer/);
  assert.equal((await plainHint.innerText()).trim(), "1 bead is waiting on this answer: hq-w4.");
  assert.equal(await loneCard.getByText(/waiting on this answer/).count(), 0, "no hint when nothing waits");

  // The hint's ids open the waiting bead.
  await qHint.getByRole("button", { name: "hq-w2", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: "Write sign-in docs", exact: true }).waitFor();
  await drawer.getByTitle("Close", { exact: true }).click();
  await drawer.waitFor({ state: "detached" });

  // The client sends the same request for both kinds: the server reads the label.
  await qCard.getByRole("textbox").fill("Use OAuth");
  let sent = page.waitForRequest((r) => r.url().endsWith("/beads/hq-1/human"));
  await qCard.getByRole("button", { name: "Respond & close", exact: true }).click();
  await sent;
  sent = page.waitForRequest((r) => r.url().endsWith("/beads/hq-plain/human"));
  await plainCard.getByRole("button", { name: "Dismiss", exact: true }).click();
  await sent;
  assert.deepEqual(writes, [
    { path: "/api/p/demo/beads/hq-1/human", body: { action: "respond", text: "Use OAuth" } },
    { path: "/api/p/demo/beads/hq-plain/human", body: { action: "dismiss" } },
  ]);
  console.log("PASS human-question: the card's buttons, placeholder and waiting hint");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}

// ---- the route ----
// The bd part runs before any other fetch from this process: its setup takes
// longer than the server's keep-alive, and a POST on a socket the server has
// closed fails instead of retrying.

async function post(projectId, id, body) {
  const r = await fetch(`${base}/api/p/${projectId}/beads/${id}/human`, { method: "POST", headers: json, body: JSON.stringify(body) });
  const text = await r.text();
  assert.equal(r.status, 200, `${body.action} ${id}: ${text}`);
  return JSON.parse(text);
}
async function createDemo(title, labels) {
  const r = await fetch(`${base}/api/p/demo/beads`, { method: "POST", headers: json, body: JSON.stringify({ title, labels }) });
  const text = await r.text();
  assert.equal(r.status, 201, `create ${title}: ${text}`);
  return JSON.parse(text).id;
}
async function getDemo(id) {
  return (await fetch(`${base}/api/p/demo/beads/${id}`)).json();
}
// ---- the route, on a throwaway bd repo: the same result as the CLI ----

let haveBd = true;
try { execFileSync("bd", ["--version"], { stdio: "ignore" }); } catch { haveBd = false; }
let projectId;
if (!haveBd) {
  console.log("SKIP human-question bd parity: bd is not installed");
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scotty-hq-"));
  try {
    const bd = (args, actor = "an-agent") =>
      execFileSync("bd", args, { cwd: dir, encoding: "utf8", env: { ...process.env, BEADS_ACTOR: actor } });
    const shown = (id) => {
      const out = JSON.parse(bd(["show", id, "--json"]));
      return Array.isArray(out) ? out[0] : out;
    };
    const comments = (id) => JSON.parse(bd(["comments", id, "--json"])).map((c) => c.text);
    const ready = () => JSON.parse(bd(["ready", "--json"])).map((b) => b.id);
    const create = (title, labels) =>
      JSON.parse(bd(["create", title, ...(labels ? ["-l", labels] : []), "--json"])).id;
    execFileSync("git", ["init", "-q"], { cwd: dir });
    bd(["init", "--prefix", "hq"]);

    const q = create("Which provider?", "human,human-question");
    const work = create("Build sign-in");
    bd(["dep", "add", work, q]);
    const dismissQ = create("Still needed?", "human,human-question");
    const claimedQ = create("Asked and claimed by the agent", "human,human-question");
    bd(["update", claimedQ, "--assignee", "an-agent", "-s", "in_progress"]);
    const ownWork = create("Agent asks on its own work bead", "human");
    const ownWorkDismiss = create("Agent asks again on its own work", "human");
    assert.ok(!ready().includes(work), "the work bead waits on the question");

    const added = await fetch(`${base}/api/projects`, { method: "POST", headers: json, body: JSON.stringify({ path: dir }) });
    assert.equal(added.status, 201, `add project: ${await added.clone().text()}`);
    projectId = (await added.json()).id;

    await post(projectId, q, { action: "respond", text: "Use OAuth" });
    let b = shown(q);
    assert.equal(b.status, "closed");
    assert.equal(b.close_reason, "Responded");
    assert.deepEqual([...b.labels].sort(), ["human", "human-question"], "the human label stays");
    assert.deepEqual(comments(q), ["Response: Use OAuth"], "the same comment as bd human respond");
    assert.ok(ready().includes(work), "the work bead becomes ready, as after the CLI");
  // A second click (a retry) on the answered bead adds no second answer.
  await post(projectId, q, { action: "respond", text: "Use OAuth" });
  assert.deepEqual(comments(q), ["Response: Use OAuth"], "a retry adds nothing");
  assert.equal(shown(q).close_reason, "Responded");

    await post(projectId, dismissQ, { action: "dismiss" });
    b = shown(dismissQ);
    assert.equal(b.status, "closed");
    assert.equal(b.close_reason, "Dismissed");
    assert.deepEqual(comments(dismissQ), [], "dismiss adds no comment, as the CLI");
  await post(projectId, dismissQ, { action: "respond", text: "Too late" });
  assert.deepEqual(comments(dismissQ), [], "an answer after a dismiss adds nothing");
  assert.equal(shown(dismissQ).close_reason, "Dismissed");

    // bd human respond closes a question that the asking agent claimed; so does Scotty.
    await post(projectId, claimedQ, { action: "respond", text: "Yes" });
    assert.equal(shown(claimedQ).status, "closed");

    // The default: open, the human flag cleared, the answer as typed.
    await post(projectId, ownWork, { action: "respond", text: "Keep going" });
    b = shown(ownWork);
    assert.equal(b.status, "open");
    assert.ok(!(b.labels ?? []).includes("human"));
    assert.deepEqual(comments(ownWork), ["Keep going"]);
    await post(projectId, ownWorkDismiss, { action: "dismiss" });
    b = shown(ownWorkDismiss);
    assert.equal(b.status, "open");
    assert.ok(!(b.labels ?? []).includes("human"));
    console.log("PASS human-question: Respond and Dismiss match bd human on a real repo; the default is unchanged");
  } finally {
    if (projectId) await fetch(`${base}/api/projects/${projectId}`, { method: "DELETE" });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- the route, on the server's demo store ----

{
  const answered = await createDemo("Demo human-question to answer", ["human", "human-question"]);
  const dismissed = await createDemo("Demo human-question to dismiss", ["human", "human-question"]);
  const ownWork = await createDemo("Demo question on an agent's own work", ["human"]);
  await post("demo", answered, { action: "respond", text: "Use OAuth" });
  await post("demo", dismissed, { action: "dismiss" });
  await post("demo", ownWork, { action: "respond", text: "Keep going" });
  const a = await getDemo(answered);
  assert.equal(a.status, "closed");
  assert.equal(a.close_reason, "Responded");
  assert.deepEqual(a.labels, ["human", "human-question"], "the human label stays, as bd leaves it");
  assert.equal(a.comments.at(-1).text, "Response: Use OAuth", "the comment reads as bd's");
  await post("demo", answered, { action: "respond", text: "Use OAuth" });
  assert.equal((await getDemo(answered)).comments.length, a.comments.length, "a retry adds nothing");
  const d = await getDemo(dismissed);
  assert.equal(d.status, "closed");
  assert.equal(d.close_reason, "Dismissed");
  assert.deepEqual(d.labels, ["human", "human-question"]);
  const o = await getDemo(ownWork);
  assert.equal(o.status, "open", "the default leaves the bead open");
  assert.deepEqual(o.labels, [], "the default clears the human flag");
  assert.equal(o.comments.at(-1).text, "Keep going", "the default comment is the answer as typed");
  console.log("PASS human-question: the demo store closes as bd does; the default is unchanged");
}
