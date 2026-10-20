import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.DROVER_ROOT!;
const API = process.env.E2E_API!;
const callsAll = () => (existsSync(process.env.DROVER_CALLS!) ? readFileSync(process.env.DROVER_CALLS!, 'utf8') : '');
const A = 'a1a1a1a1', B = 'b2b2b2b2', C = 'c3c3c3c3', D = 'd4d4d4d4', E = 'e5e5e5e5';

// Only the fake calls made since this test started; match with anchored regexes (^ and $ per line).
let mark = 0;
const calls = () => callsAll().slice(mark);
const status = (hid: string, id: string, state: string) =>
  writeFileSync(join(root, hid, `status/${id}.json`), JSON.stringify({ state, at: new Date().toISOString() }));

test.beforeEach(async ({ page }) => {
  mark = callsAll().length;
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('online');
});

test('corral list and badges', async ({ page }) => {
  await expect(page.getByTestId(`badge-${A}`)).toHaveText('alive');
  await expect(page.getByTestId(`badge-${B}`)).toHaveText('dead');
  await expect(page.getByTestId(`counts-${A}`)).toContainText('1 busy · 1 idle · 1 blocked');
  await expect(page.getByTestId('corral-item-c3c3c3c3')).toHaveCount(0);
  await page.getByTestId('show-closed').check();
  await expect(page.getByTestId('badge-c3c3c3c3')).toHaveText('closed');
});

test('live agent state change', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('busy');
  writeFileSync(join(root, A, 'status/alpha.json'), JSON.stringify({ state: 'blocked', at: new Date().toISOString() }));
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('blocked');
  await expect(page.getByTestId(`counts-${A}`)).toContainText('0 busy · 1 idle · 2 blocked');
  writeFileSync(join(root, A, 'status/alpha.json'), JSON.stringify({ state: 'busy', at: new Date().toISOString() }));
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('busy');
});

test('send message', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId(`tree-drover-${A}`).click();
  await page.getByTestId('tab-messages').click();
  await page.getByTestId('message-input').fill('hello e2e');
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-item').filter({ hasText: 'hello e2e' })).toBeVisible();
  await expect(page.getByTestId('message-input')).toHaveValue('');
  expect(calls()).toMatch(new RegExp(`^\\S+ send ${A} drover ui hello e2e$`, 'm'));
});

test('agent screen', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId('agent-screen-alpha').click();
  await expect(page.getByTestId('agent-screen-body')).toContainText('fake screen of a1a1a1a1/alpha');
});

test('new drover', async ({ page }) => {
  await page.getByTestId('new-drover-btn').click();
  await expect(page.getByTestId('new-submit')).toBeDisabled();
  await page.getByTestId('new-slug').fill('fresh');
  await page.getByTestId('new-dir').fill(root);
  await page.getByTestId('new-model').selectOption('haiku');
  await page.getByTestId('new-brief').fill('do things');
  await page.getByTestId('new-submit').click();
  await expect(page.getByTestId('new-drover-dialog')).toHaveCount(0);
  await expect(page.getByTestId('corral-view')).toContainText('fresh');
  await expect(page.getByTestId('corral-badge')).toHaveText('alive');
  expect(calls()).toMatch(/^\S+ new fresh \S+ --model haiku --brief \S+$/m);
});

test('kill agent', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId('agent-kill-beta').click();
  await expect(page.getByTestId('agent-row-beta')).toHaveCount(0);
  await expect(page.getByTestId('agent-row-alpha')).toBeVisible();
  expect(calls()).toMatch(new RegExp(`^\\S+ kill ${A} --force beta$`, 'm'));
});

test('close with worktrees (exit 4) dialog', async ({ page }) => {
  await page.getByTestId(`corral-item-${D}`).click();
  await page.getByTestId('close-btn').click();
  await page.getByTestId('close-confirm').click();
  await expect(page.getByTestId('worktree-item')).toHaveCount(2);
  await expect(page.getByTestId('worktree-dirty')).toHaveCount(1);
  await page.getByTestId('close-remove').click();
  await expect(page.getByTestId('close-dialog')).toHaveCount(0);
  await expect(page.getByTestId('corral-badge')).toHaveText('closed');
  expect(calls()).toMatch(new RegExp(`^\\S+ close ${D} --remove-worktrees$`, 'm'));
});

test('tree status icons', async ({ page }) => {
  await page.getByTestId('show-closed').check();
  await expect(page.getByTestId(`status-corral-${A}`)).toHaveAttribute('data-state', 'alive');
  await expect(page.getByTestId(`status-corral-${B}`)).toHaveAttribute('data-state', 'dead');
  await expect(page.getByTestId(`status-corral-${C}`)).toHaveAttribute('data-state', 'closed');
  await page.getByTestId(`tree-toggle-${A}`).click();
  await page.getByTestId(`tree-toggle-${B}`).click();
  const gamma = page.getByTestId(`status-agent-${A}-gamma`);
  const alpha = page.getByTestId(`status-agent-${A}-alpha`);
  await expect(alpha).toHaveAttribute('data-state', 'busy');
  await expect(gamma).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId(`status-drover-${A}`)).toHaveAttribute('data-state', 'idle');
  await expect(page.getByTestId(`status-agent-${B}-alpha`)).toHaveAttribute('data-state', 'dead');
  await expect(page.getByTestId(`status-drover-${B}`)).toHaveAttribute('data-state', 'dead');
  try {
    status(A, 'gamma', 'blocked');
    await expect(gamma).toHaveAttribute('data-state', 'blocked');
    status(A, 'alpha', 'idle');
    await expect(alpha).toHaveAttribute('data-state', 'idle');
  } finally {
    status(A, 'gamma', 'idle');
    status(A, 'alpha', 'busy');
  }
  await expect(gamma).toHaveAttribute('data-state', 'idle');
  await expect(alpha).toHaveAttribute('data-state', 'busy');
});

test('dead drover node detail', async ({ page }) => {
  await page.getByTestId(`corral-item-${B}`).click();
  await page.getByTestId(`tree-drover-${B}`).click();
  await expect(page.getByTestId('drover-detail')).toBeVisible();
  await expect(page.getByTestId(`status-drover-${B}`)).toHaveAttribute('data-state', 'dead');
  await expect(page.getByTestId('corral-view')).toHaveCount(0);
});

test('revive dead corral', async ({ page }) => {
  await page.getByTestId(`corral-item-${B}`).click();
  await expect(page.getByTestId('revive-btn')).toBeVisible();
  await page.getByTestId('revive-btn').click();
  await expect(page.getByTestId('revive-btn')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId(`badge-${B}`)).toHaveText('alive');
});

test('forced exit 3 shows toast', async ({ page }) => {
  writeFileSync(join(root, '.exit'), 'close=3:boom forced\n');
  try {
    await page.getByTestId(`corral-item-${A}`).click();
    await page.getByTestId('close-btn').click();
    await page.getByTestId('close-confirm').click();
    await expect(page.getByTestId('close-error')).toContainText('boom forced');
    await expect(page.getByTestId('worktree-list')).toHaveCount(0);
  } finally {
    rmSync(join(root, '.exit'), { force: true });
  }
});

test('forced exit 3 on kill shows toast', async ({ page }) => {
  writeFileSync(join(root, '.exit'), 'kill=3:kill boom\n');
  try {
    await page.getByTestId(`corral-item-${A}`).click();
    await page.getByTestId('agent-kill-alpha').click();
    await expect(page.getByTestId('toast')).toContainText('kill boom');
  } finally {
    rmSync(join(root, '.exit'), { force: true });
  }
});

test('close with worktrees: keep', async ({ page }) => {
  await page.getByTestId(`corral-item-${E}`).click();
  await page.getByTestId('close-btn').click();
  await page.getByTestId('close-confirm').click();
  await expect(page.getByTestId('worktree-item')).toHaveCount(2);
  await page.getByTestId('close-keep').click();
  await expect(page.getByTestId('close-dialog')).toHaveCount(0);
  await expect(page.getByTestId('corral-badge')).toHaveText('closed');
  expect(calls()).toMatch(new RegExp(`^\\S+ close ${E} --keep-worktrees$`, 'm'));
  expect(readFileSync(join(root, E, 'worktrees.txt'), 'utf8')).toContain('/tmp/fake-wt/dev');
});

test('reports and tasks view', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId('tab-tasks').click();
  await expect(page.getByTestId('task-row-scaffold')).toContainText('done');
  await expect(page.getByTestId('task-row-api')).toContainText('running');
  await expect(page.getByTestId('task-row-api')).toContainText('scaffold');
  await expect(page.getByTestId('task-row-review')).toContainText('failed');
  await expect(page.getByTestId('task-row-review')).toContainText('2');
  await page.getByTestId('tab-reports').click();
  await page.getByTestId('report-alpha').click();
  const md = readFileSync(join(root, A, 'reports/alpha.md'), 'utf8').trim().split('\n')[0];
  await expect(page.getByTestId('report-body')).toContainText(md.replace(/^#+\s*/, ''));
  await page.getByTestId('report-alpha').click();
  await expect(page.getByTestId('report-body')).toHaveCount(0);
});

test('closed corral offers no actions and rejects them', async ({ page, request }) => {
  await page.getByTestId('show-closed').check();
  await page.getByTestId(`corral-item-${C}`).click();
  await expect(page.getByTestId('corral-badge')).toHaveText('closed');
  await expect(page.getByTestId('close-btn')).toHaveCount(0);
  await expect(page.getByTestId('revive-btn')).toHaveCount(0);
  expect((await request.delete(`${API}/api/corrals/${C}`)).status()).toBe(409);
  expect((await request.post(`${API}/api/corrals/${C}/revive`)).status()).toBe(409);
  expect(calls()).not.toMatch(new RegExp(`(close|revive) ${C}`));
});

test('rejects non-local Host header with 403', async ({ request }) => {
  const bad = await request.get(`${API}/api/corrals`, { headers: { host: 'evil.example.com' } });
  expect(bad.status()).toBe(403);
  const post = await request.post(`${API}/api/corrals`, {
    headers: { host: 'evil.example.com' },
    data: { slug: 'evil', dir: root, model: 'sonnet', brief: '' },
  });
  expect(post.status()).toBe(403);
  expect(calls()).not.toMatch(/ new evil /);
  expect((await request.get(`${API}/api/corrals`)).status()).toBe(200);
});

test('SSE reconnect flips offline to online', async ({ page }) => {
  await page.route('**/api/events', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('offline');
  await page.unroute('**/api/events');
  await expect(page.getByTestId('conn-status')).toHaveText('online', { timeout: 20000 });
  await page.getByTestId(`corral-item-${A}`).click();
  status(A, 'alpha', 'idle');
  try {
    await expect(page.getByTestId('agent-state-alpha')).toHaveText('idle');
  } finally {
    status(A, 'alpha', 'busy');
  }
});

test('blocked transition raises exactly one notification', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __notes: string[] };
    w.__notes = [];
    class N { static permission = 'granted'; static requestPermission = async () => 'granted'; constructor(m: string) { w.__notes.push(m); } }
    (window as unknown as { Notification: unknown }).Notification = N;
  });
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('online');
  const notes = () => page.evaluate(() => (window as unknown as { __notes: string[] }).__notes);
  try {
    status(A, 'gamma', 'blocked');
    await expect.poll(notes).toEqual(['live: gamma blocked']);
    status(A, 'gamma', 'blocked'); // rewrite while already blocked: no new notification
    status(A, 'alpha', 'idle');
    await expect.poll(async () => (await page.getByTestId(`counts-${A}`).textContent()) ?? '').toContain('0 busy · 1 idle · 1 blocked');
    expect(await notes()).toEqual(['live: gamma blocked']);
  } finally {
    status(A, 'gamma', 'idle');
    status(A, 'alpha', 'busy');
  }
});

test('tree expand/collapse and node selection', async ({ page }) => {
  const toggle = page.getByTestId(`tree-toggle-${A}`);
  await expect(page.getByTestId(`tree-drover-${A}`)).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-label', 'Expand live');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Collapse live');
  await expect(page.getByTestId(`tree-drover-${A}`)).toBeVisible();
  await expect(page.getByTestId(`tree-agent-${A}-alpha`)).toBeVisible();
  await expect(page.getByTestId('empty')).toBeVisible(); // expanding alone does not select
  await page.getByTestId(`tree-agent-${A}-alpha`).click();
  await expect(page.getByTestId('agent-detail')).toBeVisible();
  await expect(page.getByTestId('agent-detail-state')).toHaveText('busy');
  await expect(page.getByTestId('agent-screen-body')).toContainText(`fake screen of ${A}/alpha`);
  await page.getByTestId(`tree-drover-${A}`).click();
  await expect(page.getByTestId('drover-detail')).toBeVisible();
  await expect(page.getByTestId('drover-state')).toHaveText('idle');
  await toggle.click();
  await expect(page.getByTestId(`tree-agent-${A}-alpha`)).toHaveCount(0);
  // selecting a corral auto-expands it
  await page.getByTestId(`corral-item-${B}`).click();
  await expect(page.getByTestId(`tree-agent-${B}-alpha`)).toBeVisible();
  await expect(page.getByTestId('corral-view')).toBeVisible();
});

test('toggle exposes aria-expanded', async ({ page }) => {
  const toggle = page.getByTestId(`tree-toggle-${A}`);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('selection persists across SSE updates', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId(`tree-agent-${A}-alpha`).click();
  await expect(page.getByTestId('agent-detail-state')).toHaveText('busy');
  try {
    status(A, 'alpha', 'idle');
    await expect(page.getByTestId('agent-detail-state')).toHaveText('idle');
    status(A, 'gamma', 'blocked'); // update to a sibling must not drop selection
    await expect(page.getByTestId(`status-agent-${A}-gamma`)).toHaveAttribute('data-state', 'blocked');
    await expect(page.getByTestId('agent-detail')).toBeVisible();
    await expect(page.getByTestId(`tree-agent-${A}-alpha`)).toHaveAttribute('aria-current', 'true');
  } finally {
    status(A, 'alpha', 'busy');
    status(A, 'gamma', 'idle');
  }
});

test('screen polling stops on node change', async ({ page }) => {
  const reads = () => (calls().match(new RegExp(` read ${A} alpha `, 'g')) ?? []).length;
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId(`tree-agent-${A}-alpha`).click();
  await expect(page.getByTestId('agent-screen-body')).toContainText('fake screen');
  await expect.poll(reads).toBeGreaterThanOrEqual(2); // initial + at least one 2s tick
  await page.getByTestId(`tree-drover-${A}`).click();
  await expect(page.getByTestId('agent-screen')).toHaveCount(0);
  const n = reads();
  await page.waitForTimeout(4500);
  expect(reads()).toBe(n);
});

test('kill from agent detail, then agent-gone', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).click();
  await page.getByTestId(`tree-agent-${A}-gamma`).click();
  await page.getByTestId('agent-detail').getByTestId('agent-kill-gamma').click();
  await expect(page.getByTestId('agent-gone')).toContainText('gamma');
  await expect(page.getByTestId(`tree-agent-${A}-gamma`)).toHaveCount(0);
  await expect(page.getByTestId('agent-detail')).toHaveCount(0);
  expect(calls()).toMatch(new RegExp(`^\\S+ kill ${A} --force gamma$`, 'm'));
});
