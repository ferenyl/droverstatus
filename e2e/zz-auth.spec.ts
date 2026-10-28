// SPDX-License-Identifier: GPL-3.0-only
import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'node:fs';

// Runs last (name order): the reset (what `droverstatus reset-password` does) ends the shared storageState session.
test.use({ storageState: { cookies: [], origins: [] } });

test('bootstrap -> set password -> logout -> login', async ({ page }) => {
  const tokenFile = process.env.E2E_TOKEN_FILE!;
  expect(existsSync(tokenFile)).toBe(false); // a password is set
  rmSync(process.env.E2E_AUTH_FILE!); // the running server notices and re-enters bootstrap mode
  await expect.poll(() => existsSync(tokenFile)).toBe(true);
  const token = readFileSync(tokenFile, 'utf8').trim();
  const password = 'correct horse battery staple';

  await page.goto('/');
  await expect(page.getByTestId('login')).toBeVisible();
  await page.getByTestId('login-secret').fill(token);
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('settings')).toBeVisible(); // bootstrap mode forces /settings
  await page.getByTestId('pw-new').fill(password);
  await page.getByTestId('pw-repeat').fill(password);
  await page.getByTestId('pw-submit').click();
  await expect(page.getByTestId('pw-current')).toBeVisible(); // now in change-password mode

  await page.getByTestId('logout').click();
  await expect(page.getByTestId('login')).toBeVisible();

  await page.getByTestId('login-secret').fill(token); // the token no longer works
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();

  await page.getByTestId('login-secret').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login')).toHaveCount(0);
  await expect(page.getByTestId('logout')).toHaveCount(0);
});
