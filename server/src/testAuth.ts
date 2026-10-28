// SPDX-License-Identifier: GPL-3.0-only
import { type AppOpts, buildApp } from './app.js';

/** buildApp with its throwaway bootstrap auth, logged in with the bootstrap token; `cookie` goes in the Cookie header */
export async function buildAuthedApp(opts: AppOpts) {
  const built = await buildApp(opts);
  const r = await built.app.inject({ method: 'POST', url: '/api/auth/login', headers: { host: 'localhost' }, payload: { token: built.auth.bootstrapToken } });
  if (r.statusCode !== 204) throw new Error(`login failed: ${r.statusCode} ${r.body}`);
  return { ...built, cookie: String(r.headers['set-cookie']).split(';')[0] };
}
