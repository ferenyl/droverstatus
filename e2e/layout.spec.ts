import { expect, test } from '@playwright/test';

test('tree left, detail right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('conn-status')).toHaveText('online');
  await page.locator('[data-testid^="corral-item-"]').first().click();
  const tree = (await page.getByTestId('corral-list').boundingBox())!;
  const detail = (await page.getByTestId('corral-view').boundingBox())!;
  expect(tree.x + tree.width).toBeLessThanOrEqual(detail.x);
  expect(tree.width).toBeLessThan(detail.width);
  await page.screenshot({ path: process.env.SHOT ?? 'test-results/layout.png' });
});
