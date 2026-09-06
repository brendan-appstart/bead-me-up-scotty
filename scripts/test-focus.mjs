// Isolated demo server only; project data is intercepted and never written.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, 'Set SCOTTY_TEST_URL to an isolated app server');
const bead = (id, extra = {}) => ({ id, title: id, status: 'open', issue_type: 'task', priority: 1, labels: [], dependencies: [], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...extra });
const dep = (type, target) => ({ type, depends_on_id: target });
const beads = [
  bead('upstream', { priority: 3 }),
  bead('waiting', { dependencies: [dep('waits-for', 'upstream')], labels: ['ctx:alpha'] }),
  bead('conditional', { dependencies: [dep('conditional-blocks', 'upstream')], labels: ['ctx:beta'] }),
  bead('manual', { status: 'blocked' }),
  bead('flight', { status: 'in_progress', labels: ['ctx:alpha'] }),
  bead('ready', { labels: ['ctx:beta'] }),
  bead('parent', { issue_type: 'epic', priority: 3 }),
  bead('child', { dependencies: [dep('parent-child', 'parent')] }),
  bead('done', { status: 'closed' }),
  bead('archived', { labels: ['archived'] }),
  bead('gate', { issue_type: 'gate', await_type: 'human', priority: 3, dependencies: [dep('waits-for', 'upstream')] }),
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  let lanePrefix = 'ctx:';
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/p/demo/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/beads/stream')) return route.abort();
    if (path.endsWith('/beads')) return route.fulfill({ json: { beads, meta: { kind: 'demo', humanActor: 'reviewer', humanAllowlist: ['reviewer'], pollIntervalMs: 1000, lanePrefix } } });
    return route.fulfill({ json: beads.find(b => path.endsWith(`/beads/${b.id}`)) ?? {} });
  });
  await page.goto(`${base}/p/demo`);
  await page.locator('article').first().waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('bmus.view.demo')), null);
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0, 'Board is first-visit default');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  const column = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const ids = async name => (await column(name).locator('article').allTextContents()).join(' ');
  assert.match(await ids('Blocked'), /waiting/);
  assert.match(await ids('Blocked'), /conditional/);
  assert.match(await ids('Blocked'), /manual/);
  assert.match(await ids('Blocked'), /gate/);
  assert.doesNotMatch(await ids('Next up'), /waiting|conditional|gate/);
  assert.match(await ids('Next up'), /child/);
  assert.match(await ids('Next up'), /ready/);
  assert.match(await ids('In flight'), /flight/);
  assert.doesNotMatch((await page.locator('section article').allTextContents()).join(' '), /archived|done/);
  await page.screenshot({ path: '/tmp/scotty-focus-final.png' });
  await page.getByRole('button', { name: 'alpha', exact: true }).click();
  assert.match(await ids('Blocked'), /waiting/);
  assert.doesNotMatch(await ids('Blocked'), /conditional|manual/);
  assert.equal(await column('Next up').locator('article').count(), 0);
  await page.getByRole('button', { name: 'unlabeled', exact: true }).click();
  assert.match(await ids('Next up'), /child/);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const childCard = column('Next up').getByRole('button', { name: 'child', exact: true });
  await childCard.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').locator('select').first().isDisabled(), true);
  await page.getByTitle('Close', { exact: true }).click();
  await page.goto(`${base}/p/demo`); // An ordinary project link uses the default.
  await page.locator('article').first().waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('button', { name: 'alpha', exact: true }).click();
  beads.forEach(b => { b.labels = []; });
  // Wait for the normal live polling refresh without remounting Focus.
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent === 'alpha'));
  assert.match(await ids('Next up'), /child/);
  assert.match(await ids('Next up'), /ready/);
  lanePrefix = null;
  await page.reload();
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await page.getByRole('heading', { name: 'Focus', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'alpha', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.reload();
  await page.locator('article').first().waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Focus', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Board default, optional Focus, blocking columns, hierarchy, lane filters, archived exclusion, and read-only detail navigation');
} finally { await browser.close(); }
