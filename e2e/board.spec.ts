import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.env.DROVER_ROOT!;
const dir = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(dir, { recursive: true });
const A = 'a1a1a1a1';

test('board: card moves column on live state change; nav and filter in URL', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('nav-board')).toHaveAttribute('aria-current', 'page');
  const todo = page.getByTestId(`board-col-${A}-todo`);
  await expect(todo.getByTestId(`task-card-${A}-ui`)).toBeVisible();
  const file = join(root, A, 'tasks.json');
  const orig = readFileSync(file, 'utf8');
  try {
    writeFileSync(file, orig.replace('"state":"todo"', '"state":"in_progress"'));
    await expect(page.getByTestId(`board-col-${A}-in_progress`).getByTestId(`task-card-${A}-ui`)).toBeVisible();
    await expect(todo.getByTestId(`task-card-${A}-ui`)).toHaveCount(0);
  } finally {
    writeFileSync(file, orig);
  }
  await expect(todo.getByTestId(`task-card-${A}-ui`)).toBeVisible();

  await page.getByTestId('board-filter').click();
  await page.getByTestId(`board-filter-${A}`).check();
  await expect(page).toHaveURL(new RegExp(`/board\\?corrals=${A}$`));
  await expect(page.locator('[data-testid^="board-lane-"]:not([data-testid*="toggle"])')).toHaveCount(1);

  await page.getByTestId(`task-card-${A}-api`).click();
  await expect(page).toHaveURL(new RegExp(`/corrals/${A}/agents/alpha/screen$`));
  await page.getByTestId('nav-board').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await page.getByTestId('nav-console').click();
  await expect(page).toHaveURL(new RegExp(`/corrals/${A}/agents/alpha/screen$`));
});

for (const [w, h] of [[1440, 900], [1024, 768]] as const)
  for (const scheme of ['dark', 'light'] as const)
    test(`board shot ${w} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/board?closed=1');
      await expect(page.getByTestId(`board-lane-${A}`)).toBeVisible();
      await page.screenshot({ path: `${dir}/${w}-${scheme}-board.png` });
    });
