// Human-approval gates: both approval surfaces must leave an auditable, safe close reason.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const bead = (id, extra = {}) => ({
  id,
  title: `Approval ${id}`,
  status: "open",
  issue_type: "gate",
  await_type: "human",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const inboxGate = bead("inbox-gate", { description: "Approve this release decision." });
const drawerGate = bead("drawer-gate", { description: "Approve this deployment decision." });
const beads = [inboxGate, drawerGate];
const writes = [];
let inboxAttempts = 0;
let releaseDrawerApproval;
let markDrawerRequest;
const drawerRequest = new Promise((resolve) => { markDrawerRequest = resolve; });

function assertAuditableApproval(write) {
  assert.equal(write.method, "POST", "approval uses the status endpoint");
  assert.match(write.path, /\/beads\/(inbox-gate|drawer-gate)\/status$/, "approval must not use a generic close action");
  assert.equal(write.body.status, "closed");
  assert.equal(typeof write.body.reason, "string", "approval always supplies an audit reason");
  assert.ok(write.body.reason.length > 20, "approval reason is meaningful rather than a bare status change");
  assert.match(write.body.reason, /reviewer/i, "approval reason identifies the human actor");
  assert.match(write.body.reason, /approv/i, "approval reason records approval intent");
  assert.match(write.body.reason, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/, "approval reason records when the human approved");
}

const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (request.method() === "GET") {
      if (path.endsWith("/beads")) {
        return route.fulfill({
          json: {
            beads,
            meta: {
              kind: "demo",
              humanActor: "reviewer",
              humanAllowlist: ["reviewer"],
              pollIntervalMs: 300_000,
            },
          },
        });
      }
      return route.fulfill({ json: beads.find((entry) => path.endsWith(`/beads/${entry.id}`)) ?? {} });
    }

    const body = request.postDataJSON();
    writes.push({ path, method: request.method(), body });

    if (path.endsWith("/beads/inbox-gate/status") && inboxAttempts++ === 0) {
      return route.fulfill({ status: 500, json: { error: "temporary failure" } });
    }
    if (path.endsWith("/beads/drawer-gate/status")) {
      markDrawerRequest();
      await new Promise((resolve) => { releaseDrawerApproval = resolve; });
    }
    const target = beads.find((entry) => path.endsWith(`/beads/${entry.id}/status`));
    if (target) target.status = "closed";
    return route.fulfill({ json: target ?? {} });
  });

  await page.goto(`${base}/p/demo`);
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: false } });
  await page.getByRole("button", { name: "Read Only Mode", exact: true }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Needs You", exact: true }).click();
  const inboxCard = page.locator('[data-keyboard-bead-id="inbox-gate"]');
  await inboxCard.waitFor();

  // A typed approval note survives a failed request and is appended to the audit reason on retry.
  const directApprove = inboxCard.getByRole("button", { name: "Approve", exact: true });
  await inboxCard.getByRole("button", { name: "Add approval note", exact: true }).click();
  const inboxNote = inboxCard.getByPlaceholder("Optional approval note", { exact: true });
  const noteText = "The release owner confirmed the rollback plan.";
  await inboxNote.fill(noteText);
  const firstRequest = page.waitForRequest((request) => request.url().endsWith("/beads/inbox-gate/status"));
  await directApprove.click();
  await firstRequest;
  await page.getByText(/temporary failure/i).waitFor();
  assert.equal(dialogs.length, 0, "direct approval does not require an extra browser prompt");
  assert.equal(writes.length, 1);
  assertAuditableApproval(writes[0]);
  assert.match(writes[0].body.reason, /The release owner confirmed the rollback plan\./);
  await directApprove.waitFor();
  assert.equal(await directApprove.isEnabled(), true, "a failed approval keeps the gate open and retryable");
  assert.equal(await inboxNote.inputValue(), noteText, "a failed approval preserves the exact note draft");
  await directApprove.click();
  await page.waitForFunction(() => document.querySelector('[data-keyboard-bead-id="inbox-gate"]') === null);
  assert.equal(writes.length, 2, "a failed approval can be retried once");
  assertAuditableApproval(writes[1]);
  assert.match(writes[1].body.reason, /The release owner confirmed the rollback plan\./);

  // The drawer uses the same approval contract and suppresses duplicate pending clicks.
  await page.getByText("drawer-gate", { exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: "Approval drawer-gate", exact: true }).waitFor();
  const drawerApprove = drawer.getByRole("button", { name: "Approve", exact: true });
  await drawerApprove.dblclick();
  await drawerRequest;
  assert.equal(writes.filter((write) => write.path.endsWith("/beads/drawer-gate/status")).length, 1, "pending double clicks make one approval request");
  assertAuditableApproval(writes[2]);
  assert.equal("note" in writes[2].body, false, "direct approval works without sending an empty note field");
  releaseDrawerApproval();
  await drawerApprove.waitFor({ state: "detached" });
  await drawer.getByTitle("Close", { exact: true }).click();
  await drawer.waitFor({ state: "detached" });
  assert.equal(dialogs.length, 0, "drawer approval does not require an extra browser prompt");

  // Viewer mode remains an absolute write guard on both surfaces.
  await context.request.put(`${base}/api/viewer-mode`, { data: { readOnly: true } });
  await page.getByRole("button", { name: "Needs You", exact: true }).click();
  const readOnlyGate = bead("read-only-gate");
  beads.push(readOnlyGate);
  await page.reload();
  await page.getByRole("button", { name: "Needs You", exact: true }).click();
  const readOnlyCard = page.locator('[data-keyboard-bead-id="read-only-gate"]');
  await readOnlyCard.getByRole("button", { name: "Approve", exact: true }).waitFor();
  assert.equal(await readOnlyCard.getByRole("button", { name: "Approve", exact: true }).isDisabled(), true);
  await page.getByText("read-only-gate", { exact: true }).click();
  await drawer.getByRole("button", { name: "Approve", exact: true }).waitFor();
  assert.equal(await drawer.getByRole("button", { name: "Approve", exact: true }).isDisabled(), true);
  assert.equal(writes.length, 3, "read-only mode never sends an approval write");
  writes.forEach(assertAuditableApproval);

  console.log("PASS: audit-ready approvals from Needs You and drawer, retry/note preservation, pending dedupe, and read-only guards");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}
