import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.DROVER_ROOT!;
const calls = () => readFileSync(process.env.DROVER_CALLS!, 'utf8');
const A = 'a1a1a1a1', B = 'b2b2b2b2', D = 'd4d4d4d4';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('online');
});

test('corral list and badges', async ({ page }) => {
  await expect(page.getByTestId(`badge-${A}`)).toHaveText('alive');
  await expect(page.getByTestId(`badge-${B}`)).toHaveText('dead');
  await expect(page.getByTestId(`counts-${A}`)).toContainText('1b 1i 1!');
  await expect(page.getByTestId('corral-item-c3c3c3c3')).toHaveCount(0);
  await page.getByTestId('show-closed').check();
  await expect(page.getByTestId('badge-c3c3c3c3')).toHaveText('closed');
});

test('live agent state change', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('busy');
  writeFileSync(join(root, A, 'status/alpha.json'), JSON.stringify({ state: 'blocked', at: new Date().toISOString() }));
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('blocked');
  await expect(page.getByTestId(`counts-${A}`)).toContainText('0b 1i 2!');
  writeFileSync(join(root, A, 'status/alpha.json'), JSON.stringify({ state: 'busy', at: new Date().toISOString() }));
  await expect(page.getByTestId('agent-state-alpha')).toHaveText('busy');
});

test('send message', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
  await page.getByTestId('message-input').fill('hello e2e');
  await page.getByTestId('message-send').click();
  await expect(page.getByTestId('message-item').filter({ hasText: 'hello e2e' })).toBeVisible();
  await expect(page.getByTestId('message-input')).toHaveValue('');
  expect(calls()).toMatch(new RegExp(`send ${A} drover ui hello e2e`));
});

test('agent screen', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
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
  expect(calls()).toMatch(/new fresh .* --model haiku --brief/);
});

test('kill agent', async ({ page }) => {
  await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
  await page.getByTestId('agent-kill-beta').click();
  await expect(page.getByTestId('agent-row-beta')).toHaveCount(0);
  await expect(page.getByTestId('agent-row-alpha')).toBeVisible();
  expect(calls()).toMatch(new RegExp(`kill ${A} --force beta`));
});

test('close with worktrees (exit 4) dialog', async ({ page }) => {
  await page.getByTestId(`corral-item-${D}`).getByRole('button').click();
  await page.getByTestId('close-btn').click();
  await page.getByTestId('close-confirm').click();
  await expect(page.getByTestId('worktree-item')).toHaveCount(2);
  await expect(page.getByTestId('worktree-dirty')).toHaveCount(1);
  await page.getByTestId('close-remove').click();
  await expect(page.getByTestId('close-dialog')).toHaveCount(0);
  await expect(page.getByTestId('corral-badge')).toHaveText('closed');
  expect(calls()).toMatch(new RegExp(`close ${D} --force --remove-worktrees`));
});

test('revive dead corral', async ({ page }) => {
  await page.getByTestId(`corral-item-${B}`).getByRole('button').click();
  await expect(page.getByTestId('revive-btn')).toBeVisible();
  await page.getByTestId('revive-btn').click();
  await expect(page.getByTestId('revive-btn')).toHaveCount(0, { timeout: 15000 });
  await expect(page.getByTestId(`badge-${B}`)).toHaveText('alive');
});

test('forced exit 3 shows toast', async ({ page }) => {
  writeFileSync(join(root, '.exit'), 'close=3:boom forced\n');
  try {
    await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
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
    await page.getByTestId(`corral-item-${A}`).getByRole('button').click();
    await page.getByTestId('agent-kill-alpha').click();
    await expect(page.getByTestId('toast')).toContainText('kill boom');
  } finally {
    rmSync(join(root, '.exit'), { force: true });
  }
});
