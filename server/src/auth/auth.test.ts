// SPDX-License-Identifier: GPL-3.0-only
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { Auth } from './auth.js';
import { resetPassword, setPassword } from './cli.js';
import { sessionFromCookie } from './cookie.js';
import { hashPassword, verifyPassword } from './hash.js';
import { LoginLimiter } from './limiter.js';

const tmp = mkdtempSync(join(tmpdir(), 'ds-auth-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const FAST = { ln: 4, r: 8, p: 1 };
const PW = 'correct horse battery';
const mode = (f: string) => (statSync(f).mode & 0o777).toString(8);
const until = async (cond: () => boolean, ms = 2000) => {
  for (const t = Date.now(); !cond(); ) {
    if (Date.now() - t > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

let n = 0;
async function setup(opts: { trustProxy?: boolean } = {}) {
  const d = join(tmp, String(n++));
  const file = join(d, 'state', 'droverstatus', 'auth.json');
  const opened = await Auth.open({ file, runtimeDir: join(d, 'run', 'droverstatus'), params: FAST, log: () => {} });
  if (!opened.ok) throw new Error(opened.error);
  const auth = opened.value;
  const { app } = await buildApp({ root: join(d, 'root'), droverSh: join(d, 'none.sh'), webDist: join(d, 'none'), auth, ...opts });
  const req = (method: 'GET' | 'POST', url: string, payload?: object, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload, headers: { host: 'localhost', ...(cookie ? { cookie } : {}), ...headers } });
  const login = async (body: object) => {
    const r = await req('POST', '/api/auth/login', body);
    return { status: r.statusCode, cookie: r.statusCode === 204 ? String(r.headers['set-cookie']).split(';')[0] : undefined, r };
  };
  return { d, file, auth, app, req, login };
}

describe('hash', () => {
  it('round-trips, rejects a wrong password, flags outdated parameters', async () => {
    const phc = await hashPassword(PW, FAST);
    expect(phc).toMatch(/^\$scrypt\$ln=4,r=8,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(await verifyPassword(PW, phc, FAST)).toEqual({ ok: true, rehash: false });
    expect((await verifyPassword('wrong password!', phc, FAST)).ok).toBe(false);
    expect(await verifyPassword(PW, phc, { ln: 5, r: 8, p: 1 })).toEqual({ ok: true, rehash: true });
    expect((await verifyPassword(PW, 'garbage', FAST)).ok).toBe(false);
  });
});

describe('auth gate', () => {
  it('401 on protected and unmatched /api/*, public session/login, SPA untouched', async () => {
    const { req } = await setup();
    for (const url of ['/api/corrals', '/%61pi/corrals', '/api/nope', '/api/corrals/aaaaaaaa/brief'])
      expect([url, (await req('GET', url)).statusCode]).toEqual([url, 401]);
    expect((await req('GET', '/api/corrals')).json()).toEqual({ error: 'unauthorized' });
    expect((await req('POST', '/api/auth/password', { password: 'x'.repeat(12) })).statusCode).toBe(401);
    expect((await req('GET', '/api/auth/session')).json()).toEqual({ authenticated: false, passwordSet: false });
    expect((await req('GET', '/api/corrals', undefined, 'droverstatus_session=forged')).statusCode).toBe(401);
  });

  it('SSE without a session is 401 before the handler', async () => {
    const { req } = await setup();
    const r = await req('GET', '/api/events');
    expect([r.statusCode, r.headers['content-type']]).toEqual([401, expect.stringContaining('application/json')]);
  });
});

describe('bootstrap token -> password', () => {
  it('token logs in, setting a password disables it and ends other sessions and their streams', async () => {
    const { file, auth, app, req, login } = await setup();
    const tokenFile = auth.tokenFile!;
    expect(mode(tokenFile)).toBe('600');
    expect(mode(join(tokenFile, '..'))).toBe('700');
    const token = readFileSync(tokenFile, 'utf8').trim();
    expect(token).toBe(auth.bootstrapToken);

    expect((await login({ token: 'nope' })).status).toBe(401);
    const a = await login({ token });
    const b = await login({ token });
    expect(a.status).toBe(204);
    expect(String(a.r.headers['set-cookie'])).toMatch(/^droverstatus_session=[^;]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+$/);
    expect((await req('GET', '/api/auth/session', undefined, a.cookie)).json()).toEqual({ authenticated: true, passwordSet: false });
    expect((await req('GET', '/api/corrals', undefined, a.cookie)).statusCode).toBe(200);

    // b holds an event stream that must end with its session
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: { cookie: b.cookie! } });
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot');

    expect((await req('POST', '/api/auth/password', { token, password: 'short' }, a.cookie)).statusCode).toBe(400);
    expect((await req('POST', '/api/auth/password', { token: 'nope', password: PW }, a.cookie)).statusCode).toBe(401);
    const p = await req('POST', '/api/auth/password', { token, password: PW }, a.cookie);
    expect(p.statusCode).toBe(204);
    const a2 = String(p.headers['set-cookie']).split(';')[0];
    let done = false;
    while (!done) done = (await reader.read()).done;

    expect(existsSync(tokenFile)).toBe(false);
    expect([mode(file), mode(join(file, '..'))]).toEqual(['600', '700']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: 1, sessionEpoch: 1, password: expect.stringMatching(/^\$scrypt\$/) });
    for (const c of [a.cookie, b.cookie]) expect((await req('GET', '/api/corrals', undefined, c)).statusCode).toBe(401);
    expect((await req('GET', '/api/corrals', undefined, a2)).statusCode).toBe(200);
    expect((await login({ token })).status).toBe(401);
    expect((await login({ password: 'wrong password!' })).status).toBe(401);
    expect((await login({ password: PW })).status).toBe(204);
    // a change now needs the current password
    expect((await req('POST', '/api/auth/password', { token, password: PW + '2' }, a2)).statusCode).toBe(401);
    expect((await req('POST', '/api/auth/password', { current: PW, password: PW + '2' }, a2)).statusCode).toBe(204);
    await app.close();
    expect(existsSync(tokenFile)).toBe(false);
  });

  it('logout ends the session and clears the cookie', async () => {
    const { req, login, auth } = await setup();
    const { cookie } = await login({ token: auth.bootstrapToken });
    const r = await req('POST', '/api/auth/logout', undefined, cookie);
    expect([r.statusCode, String(r.headers['set-cookie'])]).toEqual([204, expect.stringContaining('Max-Age=0')]);
    expect((await req('GET', '/api/corrals', undefined, cookie)).statusCode).toBe(401);
  });

  it('Secure __Host- cookie over HTTPS behind a trusted proxy only', async () => {
    const proxied = await setup({ trustProxy: true });
    const r = await proxied.req('POST', '/api/auth/login', { token: proxied.auth.bootstrapToken }, undefined, { 'x-forwarded-proto': 'https' });
    const set = String(r.headers['set-cookie']);
    expect(set).toMatch(/^__Host-droverstatus_session=.*; Secure$/);
    expect((await proxied.req('GET', '/api/corrals', undefined, set.split(';')[0])).statusCode).toBe(200);
    const direct = await setup();
    const s = String((await direct.req('POST', '/api/auth/login', { token: direct.auth.bootstrapToken }, undefined, { 'x-forwarded-proto': 'https' })).headers['set-cookie']);
    expect(s).not.toContain('Secure');
  });
});

describe('limiter', () => {
  it('429 after 5 failures in the window, then the window expiry allows again', async () => {
    let now = 0;
    const l = new LoginLimiter(5, 15 * 60_000, 100, () => now);
    for (let i = 0; i < 5; i++) {
      expect(l.retryIn('a')).toBe(0);
      l.fail('a');
    }
    expect(l.retryIn('a')).toBe(15 * 60_000);
    expect(l.retryIn('b')).toBe(0);
    now += 15 * 60_000;
    expect(l.retryIn('a')).toBe(0);
    expect(l.acquire()).toBe(true);
    expect(l.acquire()).toBe(false);
    l.release();
    expect(l.acquire()).toBe(true);
  });

  it('over HTTP: the 6th attempt is 429 even with the right password', async () => {
    const { auth, req, login } = await setup();
    const { cookie } = await login({ token: auth.bootstrapToken });
    await req('POST', '/api/auth/password', { token: auth.bootstrapToken, password: PW }, cookie);
    for (let i = 0; i < 5; i++) expect((await login({ password: 'wrong password!' })).status).toBe(401);
    const r = await login({ password: PW });
    expect([r.status, Number(r.r.headers['retry-after'])]).toEqual([429, expect.any(Number)]);
    expect(Number(r.r.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('CLI and live reload', () => {
  it('set-password logs out a running server; reset-password returns it to bootstrap with a new token', async () => {
    const { file, auth, req, login, app } = await setup();
    const first = auth.bootstrapToken!;
    const { cookie } = await login({ token: first });
    expect((await setPassword(file, 'short')).ok).toBe(false);
    expect((await setPassword(file, PW)).ok).toBe(true);
    expect(mode(file)).toBe('600');
    await until(() => auth.passwordSet);
    expect((await req('GET', '/api/corrals', undefined, cookie)).statusCode).toBe(401);
    expect(existsSync(auth.tokenFile!)).toBe(false);
    expect((await login({ token: first })).status).toBe(401);
    const { cookie: c2 } = await login({ password: PW });
    expect((await req('GET', '/api/corrals', undefined, c2)).statusCode).toBe(200);

    const tokens: string[] = [];
    auth.on('bootstrap', (t: string) => tokens.push(t));
    expect(await resetPassword(file)).toMatchObject({ ok: true });
    await until(() => tokens.length > 0);
    expect(existsSync(file)).toBe(false);
    expect(readFileSync(auth.tokenFile!, 'utf8').trim()).toBe(tokens[0]);
    expect(tokens[0]).not.toBe(first);
    expect((await req('GET', '/api/corrals', undefined, c2)).statusCode).toBe(401);
    expect((await req('GET', '/api/auth/session')).json()).toEqual({ authenticated: false, passwordSet: false });
    expect((await login({ token: tokens[0] })).status).toBe(204);
    expect(await resetPassword(file)).toMatchObject({ ok: true, value: expect.stringContaining('no password set') });
    await app.close();
  });

  it('refuses a group/world-readable or malformed auth.json at startup', async () => {
    const d = join(tmp, 'perm');
    const file = join(d, 'auth.json');
    expect((await setPassword(file, PW)).ok).toBe(true);
    chmodSync(file, 0o644);
    const r = await Auth.open({ file });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('readable by group/others') });
    chmodSync(file, 0o600);
    writeFileSync(file, '{"version":2}');
    expect((await Auth.open({ file })).ok).toBe(false);
  });
});

describe('cookie', () => {
  it('prefers the __Host- name', () => {
    expect(sessionFromCookie('a=1; droverstatus_session=plain; __Host-droverstatus_session=host')).toBe('host');
    expect(sessionFromCookie('droverstatus_session=plain')).toBe('plain');
    expect(sessionFromCookie(undefined)).toBeUndefined();
  });
});
