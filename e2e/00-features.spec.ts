// SPDX-License-Identifier: GPL-3.0-only
import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.DROVER_ROOT!;
const A = 'a1a1a1a1', B = 'b2b2b2b2', C = 'c3c3c3c3', D = 'd4d4d4d4', E = 'e5e5e5e5';
const callsAll = () => (existsSync(process.env.DROVER_CALLS!) ? readFileSync(process.env.DROVER_CALLS!, 'utf8') : '');
let mark = 0;
test.beforeEach(() => { mark = callsAll().length; });
const calls = () => callsAll().slice(mark);

// Edit a fixture file for the duration of fn, then restore it (keeps tests order-independent).
async function withFile(hid: string, rel: string, edit: (orig: string) => string, fn: () => Promise<void>) {
  const f = join(root, hid, rel);
  const orig = readFileSync(f, 'utf8');
  writeFileSync(f, edit(orig));
  try { await fn(); } finally { writeFileSync(f, orig); }
}
const lanes = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid^="board-lane-"]:not([data-testid*="toggle"])');

test.describe('board', () => {
  test('lanes, columns, show-closed and filter deep links', async ({ page }) => {
    await page.goto('/board');
    await expect(lanes(page)).toHaveCount(5); // A, B, D, E, F; closed C hidden
    await expect(page.getByTestId(`board-lane-${C}`)).toHaveCount(0);
    await expect(page.getByTestId(`board-col-${A}-done`).getByTestId(`task-card-${A}-scaffold`)).toBeVisible();
    await expect(page.getByTestId(`board-col-${A}-in_progress`).getByTestId(`task-card-${A}-api`)).toBeVisible();
    await expect(page.getByTestId(`board-col-${A}-todo`).getByTestId(`task-card-${A}-ui`)).toBeVisible();
    await expect(page.getByTestId(`board-col-${A}-failed`).getByTestId(`task-card-${A}-review`)).toBeVisible();
    await expect(page.getByTestId(`task-card-${A}-api`)).toContainText('scaffold'); // depends on

    await page.getByTestId('board-show-closed').check();
    await expect(page).toHaveURL(/\/board\?closed=1$/);
    await expect(page.getByTestId(`board-lane-${C}`)).toBeVisible();
    await expect(lanes(page)).toHaveCount(6);

    await page.getByTestId('board-filter').click();
    await page.getByTestId(`board-filter-${A}`).check();
    await page.getByTestId(`board-filter-${E}`).check();
    await expect(page).toHaveURL(new RegExp(`/board\\?corrals=${A},${E}&closed=1$`));
    await expect(lanes(page)).toHaveCount(2);
    await page.getByTestId('board-filter-all').check();
    await expect(lanes(page)).toHaveCount(6);
  });

  test('deep link with ?corrals= and back/forward between views', async ({ page }) => {
    await page.goto(`/board?corrals=${A},${B}`);
    await expect(lanes(page)).toHaveCount(2);
    await expect(page.getByTestId('board-filter')).toContainText('2 selected');
    await page.goto(`/board?closed=1&corrals=${C}`);
    await expect(lanes(page)).toHaveCount(1);
    await expect(page.getByTestId(`board-lane-${C}`)).toBeVisible();
    await page.getByTestId('nav-console').click();
    await expect(page.getByTestId('nav-console')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('board')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(lanes(page)).toHaveCount(1);
    await page.goForward();
    await expect(page.getByTestId('board')).toHaveCount(0);
  });

  test('live card moves incl. failed/in_progress and attention at attempts>=3', async ({ page }) => {
    await page.goto(`/board?corrals=${A}`);
    await expect(page.getByTestId(`task-card-${A}-ui`)).toHaveAttribute('data-state', 'todo');
    await expect(page.locator(`[data-testid^="card-attention-${A}-"]`)).toHaveCount(0);
    await withFile(A, 'tasks.json',
      (o) => o.replace('"id":"ui","title":"UI","acceptance":["renders","a11y"],"depends_on":["api"],"owner":"beta","state":"todo","attempts":0',
        '"id":"ui","title":"UI","acceptance":["renders","a11y"],"depends_on":["api"],"owner":"beta","state":"failed","attempts":3')
        .replace('"state":"failed","attempts":2', '"state":"in_progress","attempts":2'),
      async () => {
        await expect(page.getByTestId(`board-col-${A}-failed`).getByTestId(`task-card-${A}-ui`)).toBeVisible();
        await expect(page.getByTestId(`board-col-${A}-in_progress`).getByTestId(`task-card-${A}-review`)).toBeVisible();
        await expect(page.getByTestId(`card-attention-${A}-ui`)).toBeVisible();
        await expect(page.getByTestId(`card-attention-${A}-review`)).toHaveCount(0);
      });
    await expect(page.getByTestId(`board-col-${A}-todo`).getByTestId(`task-card-${A}-ui`)).toBeVisible();
    await expect(page.getByTestId(`card-attention-${A}-ui`)).toHaveCount(0);
  });

  test('card click opens owner agent screen; non-agent owner opens corral', async ({ page }) => {
    await page.goto(`/board?corrals=${A}`);
    await page.getByTestId(`task-card-${A}-scaffold`).click();
    await expect(page).toHaveURL(new RegExp(`/corrals/${A}/agents/alpha/screen$`));
    await expect(page.getByTestId('agent-screen-body')).toContainText(`fake screen of ${A}/alpha`);
    await withFile(A, 'tasks.json', (o) => o.replace('"owner":"gamma"', '"owner":"nobody"'), async () => {
      await page.goto(`/board?corrals=${A}`);
      await expect(page.getByTestId(`task-card-${A}-review`)).toContainText('nobody');
      await page.getByTestId(`task-card-${A}-review`).click();
      await expect(page).toHaveURL(new RegExp(`/corrals/${A}$`));
      await expect(page.getByTestId('corral-view')).toBeVisible();
    });
  });
});

test.describe('routing', () => {
  test('deep links select node and tab', async ({ page }) => {
    await page.goto(`/corrals/${A}`);
    await expect(page.getByTestId('corral-view')).toBeVisible();
    await page.goto(`/corrals/${A}/drover/messages`);
    await expect(page.getByTestId('drover-detail')).toBeVisible();
    await expect(page.getByTestId('tab-messages')).toHaveAttribute('aria-selected', 'true');
    await page.goto(`/corrals/${A}/agents/alpha/tasks`);
    await expect(page.getByTestId('agent-detail')).toBeVisible();
    await expect(page.getByTestId('tab-tasks')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('task-row-api')).toBeVisible();
    await page.goto(`/corrals/${A}/agents/alpha`);
    await expect(page.getByTestId('tab-screen')).toHaveAttribute('aria-selected', 'true'); // agent default
    await expect(page.getByTestId(`tree-agent-${A}-alpha`)).toHaveAttribute('aria-current', 'true');
  });

  test('back/forward follows tab and node changes', async ({ page }) => {
    await page.goto(`/corrals/${A}`);
    await page.getByTestId(`tree-agent-${A}-alpha`).click();
    await expect(page).toHaveURL(new RegExp(`/agents/alpha/screen$`));
    await page.getByTestId('tab-reports').click();
    await expect(page).toHaveURL(new RegExp(`/agents/alpha/reports$`));
    await page.getByTestId(`tree-drover-${A}`).click();
    await expect(page).toHaveURL(new RegExp(`/drover/overview$`));
    await page.goBack();
    await expect(page.getByTestId('agent-detail')).toBeVisible();
    await expect(page.getByTestId('tab-reports')).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(page.getByTestId('tab-screen')).toHaveAttribute('aria-selected', 'true');
    await page.goForward();
    await page.goForward();
    await expect(page.getByTestId('drover-detail')).toBeVisible();
  });

  test('unknown hid and unknown agent', async ({ page }) => {
    await page.goto('/corrals/deadbeef');
    await expect(page.getByTestId('empty')).toContainText('deadbeef');
    await expect(page.getByTestId('empty')).toContainText('not found');
    await page.goto(`/corrals/${A}/agents/nope/screen`);
    await expect(page.getByTestId('agent-gone')).toContainText('nope');
  });
});

test.describe('drover node', () => {
  test('messages composer sends as droverstatusui', async ({ page }) => {
    await page.goto(`/corrals/${A}/drover/messages`);
    await page.getByTestId('message-input').fill('ping from e2e5');
    await page.getByTestId('message-send').click();
    await expect(page.getByTestId('message-item').filter({ hasText: 'ping from e2e5' })).toBeVisible();
    expect(calls()).toMatch(new RegExp(`^\\S+ send ${A} drover droverstatusui ping from e2e5$`, 'm'));
  });

  test('screen tab shows fake screen and composer', async ({ page }) => {
    await page.goto(`/corrals/${A}/drover/screen`);
    await expect(page.getByTestId('agent-screen-body')).toContainText(`fake screen of ${A}/drover`);
    await expect(page.getByTestId('message-input')).toBeVisible();
    expect(calls()).toMatch(new RegExp(`^\\S+ read ${A} drover \\d+$`, 'm'));
  });
});

test('agent screen fills pane width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/corrals/${A}/agents/alpha/screen`);
  await expect(page.getByTestId('agent-screen-body')).toContainText('fake screen');
  const pre = (await page.getByTestId('agent-screen-body').boundingBox())!;
  const pane = (await page.locator('main.pane').boundingBox())!;
  expect(pre.width).toBeGreaterThan(pane.width - 60);
  expect(pre.width).toBeLessThanOrEqual(pane.width);
});

test('queued message pill', async ({ page }) => {
  await withFile(A, 'messages.log', (o) => `${o}2026-10-20T12:10:00+02:00 [drover -> beta] hold on (queued)\n`, async () => {
    await page.goto(`/corrals/${A}/agents/beta/messages`);
    const item = page.getByTestId('message-item').filter({ hasText: 'hold on' });
    await expect(item).toBeVisible();
    await expect(item.getByTestId('msg-queued')).toHaveText('queued');
    await expect(item).not.toContainText('(queued)');
  });
  await page.goto(`/corrals/${A}/agents/alpha/messages`);
  await expect(page.getByTestId('msg-queued')).toHaveCount(0);
});

test('composer sends to a worker agent', async ({ page }) => {
  await page.goto(`/corrals/${A}/agents/alpha/messages`);
  await page.getByTestId('message-input').fill('hi alpha');
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-item').filter({ hasText: 'hi alpha' })).toBeVisible();
  expect(calls()).toMatch(new RegExp(`^\\S+ send ${A} alpha droverstatusui hi alpha$`, 'm'));
});

test('flush queued messages once the agent is unblocked', async ({ page }) => {
  const q = join(root, A, 'queue');
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, 'alpha.txt'), 'droverstatusui\thold on\n');
  try {
    await page.goto(`/corrals/${A}/agents/alpha/overview`);
    await page.getByTestId('agent-flush-alpha').click();
    await expect(page.getByTestId('agent-flush-alpha')).toHaveCount(0);
    expect(calls()).toMatch(new RegExp(`^\\S+ flush ${A} --force alpha$`, 'm'));
  } finally { rmSync(q, { recursive: true, force: true }); }
});

test('detail: brief, worktrees, acceptance, story filter and body, agent fields', async ({ page }) => {
  await page.goto(`/corrals/${A}`);
  await page.getByTestId('brief').locator('summary').click();
  await expect(page.getByTestId('brief-body')).toHaveText('Fixture brief');
  await page.goto(`/corrals/${A}/tasks`);
  await expect(page.getByTestId(`task-accept-ui`)).toContainText('a11y');
  await page.goto(`/corrals/${D}`);
  await expect(page.getByTestId('worktree-row')).toHaveCount(2);
  await expect(page.getByTestId('worktrees')).toContainText('dirty');
  const F = 'f6f6f6f6';
  await page.goto(`/corrals/${F}/tasks`);
  await expect(page.getByTestId('task-kind-123-plan')).toHaveText('plan');
  await page.getByTestId('tasks-story-filter').selectOption('456');
  await expect(page.getByTestId('task-row-123-plan')).toHaveCount(0);
  await page.goto(`/corrals/${F}/board?story=123`);
  await page.getByTestId('story-doc').locator('summary').click();
  await expect(page.getByTestId('story-doc-body')).toContainText('Story 123 body');
  await expect(page.getByTestId('story-blocked-reason-456')).toHaveText('waiting for API team');
  await page.goto(`/corrals/${F}/agents/123-dev/overview`);
  await expect(page.getByTestId('agent-worktree')).toHaveText('/tmp/fake-wt/123');
  await expect(page.getByTestId('resume-cmd')).toHaveText('claude --resume sid-123');
});

test('contract fields: plugin version, report pills and order, task times, stuck, state since', async ({ page }) => {
  await page.goto(`/corrals/${A}`);
  await expect(page.getByTestId('drover-version')).toContainText('0.11.0 · schema 1');
  await expect(page.getByTestId('agent-stuck-alpha')).toBeVisible();
  await page.goto(`/corrals/${A}/reports`);
  await expect(page.getByTestId('report-status-alpha')).toHaveText('done');
  await expect(page.getByTestId('report-status-gamma')).toHaveText('failed');
  await expect(page.getByTestId('report-new-alpha')).toBeVisible();
  await expect(page.locator('[data-testid^="report-"][data-testid$="alpha"], [data-testid^="report-"][data-testid$="gamma"]').first()).toBeVisible();
  await page.getByTestId('report-alpha').click();
  await expect(page.getByTestId('report-new-alpha')).toHaveCount(0);
  await page.goto(`/corrals/${A}/tasks`);
  await expect(page.getByTestId('task-time-api')).toContainText('started');
  await page.goto(`/corrals/${A}/agents/alpha/overview`);
  await expect(page.getByTestId('state-since')).toBeVisible();
  await expect(page.getByTestId('agent-stuck')).toBeVisible();
  // old corral without the new fields renders unchanged
  await page.goto(`/corrals/${B}`);
  await expect(page.getByTestId('drover-version')).toHaveCount(0);
});

test('docs tab lists brief and registered docs; unregistered paths are refused', async ({ page, request }) => {
  const spec = join(root, 'spec-e2e.md'), list = join(root, A, 'docs.json');
  writeFileSync(spec, '# Spec body\n\n**bold** <script>window.__xss = 1</script><img src=x onerror="window.__xss = 2">\n\n```mermaid\ngraph TD; A-->B;\n```\n');
  writeFileSync(list, JSON.stringify([{ path: spec, note: 'the spec', agent: 'alpha', added_at: '2026-10-22T10:00:00Z' }]));
  try {
    await page.goto(`/corrals/${A}/docs`);
    await expect(page.getByTestId('tab-docs')).toContainText('(2)');
    await page.getByTestId('doc-brief').locator('summary').click();
    await expect(page.getByTestId('doc-brief-body')).toHaveText('Fixture brief');
    await page.getByTestId('doc-the spec').locator('summary').click();
    const body = page.getByTestId('doc-the spec-body');
    await expect(body.locator('h1')).toHaveText('Spec body');
    await expect(body.locator('strong')).toHaveText('bold');
    await expect(body.locator('pre.mermaid svg')).toBeVisible(); // lazy-loaded mermaid rendered
    await expect(body.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    const bad = await request.get(`${process.env.E2E_API}/api/corrals/${A}/doc?path=/etc/passwd`);
    expect(bad.status()).toBe(404);
  } finally { rmSync(spec, { force: true }); rmSync(list, { force: true }); }
});

test('image docs render as an image, not as text', async ({ page, request }) => {
  const png = join(root, 'shot-e2e.png'), list = join(root, A, 'docs.json');
  // 1x1 png
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
  writeFileSync(list, JSON.stringify([{ path: png, note: 'the shot', agent: 'alpha', added_at: '2026-10-22T10:00:00Z' }]));
  try {
    await page.goto(`/corrals/${A}/docs`);
    await page.getByTestId('doc-the shot').locator('summary').click();
    const img = page.getByTestId('doc-the shot-body');
    await expect(img).toHaveJSProperty('tagName', 'IMG');
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth)).toBe(1);
    const r = await request.get(`${process.env.E2E_API}/api/corrals/${A}/doc?path=${encodeURIComponent(png)}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toBe('image/png');
    expect(r.headers()['content-disposition']).toBe('inline; filename="shot-e2e.png"');
  } finally { rmSync(png, { force: true }); rmSync(list, { force: true }); }
});

test('attention badge counts blocked, stuck, stories and queued; title shows the total', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId(`attention-${A}`)).toHaveText('2'); // beta blocked + alpha stuck
  await expect(page.getByTestId('attention-f6f6f6f6')).toHaveText('2'); // busy agent stuck + story 456 blocked
  await expect(page).toHaveTitle(/^\(\d+\) Droverstatus$/);
  const q = join(root, A, 'queue');
  mkdirSync(q, { recursive: true });
  writeFileSync(join(q, 'alpha.txt'), 'droverstatusui\thold on\n');
  try {
    await expect(page.getByTestId(`attention-${A}`)).toHaveText('3');
  } finally { rmSync(q, { recursive: true, force: true }); }
  await expect(page.getByTestId(`attention-${A}`)).toHaveText('2');
});

test('closing pill in tree and corral view', async ({ page }) => {
  await page.goto(`/corrals/${D}`);
  await expect(page.getByTestId(`closing-${D}`)).toHaveCount(0);
  await withFile(D, 'registry.json', (o) => JSON.stringify({ ...JSON.parse(o), closing_at: Math.floor(Date.now() / 1000) }), async () => {
    await expect(page.getByTestId(`closing-${D}`)).toBeVisible();
    await expect(page.getByTestId('corral-closing')).toBeVisible();
  });
  await expect(page.getByTestId(`closing-${D}`)).toHaveCount(0);
  await expect(page.getByTestId('corral-closing')).toHaveCount(0);
});

test('structured report fields', async ({ page }) => {
  await page.goto(`/corrals/${A}/agents/alpha/reports`);
  await expect(page.getByTestId('report-field-task')).toHaveText('scaffold');
  await expect(page.getByTestId('report-field-status')).toHaveText('done');
  await expect(page.getByTestId('report-field-status')).toHaveClass(/rs-done/);
  await expect(page.getByTestId('report-field-summary')).toHaveText('ok');
  await expect(page.getByTestId('report-field-open')).toHaveText('none');
  // free-form markdown stays a plain <pre>
  await page.goto(`/corrals/${A}/agents/gamma/reports`);
  await expect(page.getByTestId('report-body')).toContainText('status: **failed**');
  await expect(page.locator('[data-testid^="report-field-"]')).toHaveCount(0);
});
