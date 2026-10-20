import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const dir = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(dir, { recursive: true });

for (const [w, h] of [[1440, 900], [1024, 768]] as const)
  for (const scheme of ['dark', 'light'] as const) {
    test(`layout ${w} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await expect(page.getByTestId('conn-status')).toHaveText('online');
      await page.screenshot({ path: `${dir}/${w}-${scheme}-empty.png` });
      await page.locator('[data-testid^="tree-toggle-"]').first().click();
      await page.locator('[data-testid^="corral-item-"]').nth(2).click();
      const tree = (await page.getByTestId('corral-list').boundingBox())!;
      const detail = (await page.getByTestId('corral-view').boundingBox())!;
      expect(tree.x + tree.width).toBeLessThanOrEqual(detail.x);
      expect(tree.width).toBeLessThan(detail.width);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      await page.screenshot({ path: `${dir}/${w}-${scheme}-overview.png` });
      await page.getByTestId('tab-tasks').click();
      await page.screenshot({ path: `${dir}/${w}-${scheme}-tasks.png` });
      await page.locator('[data-testid^="tree-agent-"]').first().click();
      await expect(page.getByTestId('agent-screen-body')).not.toBeEmpty();
      await page.screenshot({ path: `${dir}/${w}-${scheme}-agent.png` });
    });
  }
