// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from '@playwright/test';

// Run via: npm run test:e2e -- npx playwright test (testkit/e2e.sh isolates HOME/CLAUDE_CONFIG_DIR/DROVER_ROOT/XDG_*)
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/auth.setup.ts',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: process.env.E2E_URL ?? 'http://127.0.0.1:5178', storageState: 'e2e/.auth/state.json' },
});
