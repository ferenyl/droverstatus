// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { request } from '@playwright/test';
import type { FullConfig } from '@playwright/test';

export const E2E_PASSWORD = 'e2e correct horse battery staple';

// Logs in once with the bootstrap token and sets a password (bootstrap mode forces /settings); every spec reuses the session cookie via storageState.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const token = readFileSync(process.env.E2E_TOKEN_FILE!, 'utf8').trim();
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const login = await ctx.post('/api/auth/login', { data: { token } });
  if (login.status() !== 204) throw new Error(`e2e login failed: ${login.status()}`);
  const res = await ctx.post('/api/auth/password', { data: { token, password: E2E_PASSWORD } });
  if (res.status() !== 204) throw new Error(`e2e set password failed: ${res.status()}`);
  await ctx.storageState({ path: 'e2e/.auth/state.json' });
  await ctx.dispose();
}
