// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from '@playwright/test';

// Run via: npm run test:e2e -- npx playwright test
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: process.env.E2E_URL ?? 'http://127.0.0.1:5178' },
});
