// SPDX-License-Identifier: GPL-3.0-only
import { chmodSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { DroverCli } from './droverCli.js';
import { startWatcher } from './watcher.js';
import { Store } from './store.js';

const tmp = mkdtempSync(join(tmpdir(), 'ds-routes-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function corral(root: string, hid: string, reg: object) {
  mkdirSync(join(root, hid, 'reports'), { recursive: true });
  writeFileSync(join(root, hid, 'registry.json'), JSON.stringify(reg));
}

function fakeSh(file: string, body: string) {
  writeFileSync(file, `#!/usr/bin/env bash\necho "$@" >> "${file}.log"\n${body}\n`);
  chmodSync(file, 0o755);
}

describe('routes', () => {
  const root = join(tmp, 'root');
  const sh = join(tmp, 'drover.sh');
  let app: Awaited<ReturnType<typeof buildApp>>['app'];

  beforeAll(async () => {
    corral(root, 'aaaaaaaa', { session: 's1', slug: 'one', agents: { dev: { pane_id: 'terminal_1' } } });
    corral(root, 'bbbbbbbb', { session: 's2', slug: 'two', closed: true });
    writeFileSync(join(root, 'aaaaaaaa', 'reports', 'dev.md'), '# r');
    fakeSh(
      sh,
      `case $1 in
  new) echo "HID=cccccccc";;
  close) [[ $3 == --keep-worktrees || $3 == --remove-worktrees ]] || { echo "/w/x br dirty"; echo "wt" >&2; exit 4; };;
  read) echo screen;;
  fail) exit 2;;
esac`,
    );
    ({ app } = await buildApp({ root, droverSh: sh, webDist: join(tmp, 'none') }));
  });

  const req = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object, host = 'localhost:4177') =>
    app.inject({ method, url, payload, headers: { host } });

  it('rejects foreign Host', async () => {
    expect((await req('GET', '/api/corrals', undefined, 'evil.example:4177')).statusCode).toBe(403);
  });
  it('lists corrals', async () => {
    expect((await req('GET', '/api/corrals')).json().map((c: any) => c.hid)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });
  it('validates new corral input', async () => {
    const ok = { slug: 'x', dir: tmp, model: 'sonnet', brief: 'b' };
    for (const bad of [{ slug: 'Bad_Slug' }, { model: 'gpt' }, { dir: 'relative' }, { dir: join(tmp, 'nope') }, { dir: '-x' }, { slug: 5 }, { dir: 5 }, { model: ['sonnet'] }, { brief: {} }]) {
      expect((await req('POST', '/api/corrals', { ...ok, ...bad })).statusCode).toBe(400);
    }
    const r = await req('POST', '/api/corrals', ok);
    expect([r.statusCode, r.json()]).toEqual([201, { hid: 'cccccccc' }]);
  });
  it('400 bad hid, 404 unknown corral/agent', async () => {
    expect((await req('POST', '/api/corrals/zz/revive')).statusCode).toBe(400);
    expect((await req('POST', '/api/corrals/dddddddd/revive')).statusCode).toBe(404);
    expect((await req('DELETE', '/api/corrals/aaaaaaaa/agents/nobody')).statusCode).toBe(404);
  });
  it('revive guard: closed -> 409', async () => {
    expect((await req('POST', '/api/corrals/bbbbbbbb/revive')).statusCode).toBe(409);
  });
  it('close: exit 4 -> 409 with worktrees; keep -> ok; closed -> 409', async () => {
    const r = await req('DELETE', '/api/corrals/aaaaaaaa');
    expect(r.statusCode).toBe(409);
    expect(r.json().worktrees).toEqual([{ path: '/w/x', branch: 'br', dirty: true }]);
    expect((await req('DELETE', '/api/corrals/aaaaaaaa?worktrees=keep')).statusCode).toBe(200);
    expect((await req('DELETE', '/api/corrals/aaaaaaaa?worktrees=x')).statusCode).toBe(400);
    expect((await req('DELETE', '/api/corrals/bbbbbbbb')).statusCode).toBe(409);
  });
  it('message validation', async () => {
    expect((await req('POST', '/api/corrals/aaaaaaaa/messages', { message: ' ' })).statusCode).toBe(400);
    expect((await req('POST', '/api/corrals/aaaaaaaa/messages', { message: 'hi' })).statusCode).toBe(200);
  });
  it('screen clamps lines', async () => {
    const r = await req('GET', '/api/corrals/aaaaaaaa/agents/dev/screen?lines=99999');
    expect(r.json()).toEqual({ screen: 'screen\n' });
  });
  it('screen works for the drover id', async () => {
    expect((await req('GET', '/api/corrals/aaaaaaaa/agents/drover/screen')).statusCode).toBe(200);
  });
  it('reports: ok, traversal rejected', async () => {
    expect((await req('GET', '/api/corrals/aaaaaaaa/reports/dev')).body).toBe('# r');
    expect((await req('GET', '/api/corrals/aaaaaaaa/reports/..%2F..%2Fregistry')).statusCode).toBe(400);
    expect((await req('GET', '/api/corrals/aaaaaaaa/reports/none')).statusCode).toBe(404);
  });
});

describe('DroverCli', () => {
  it('passes args as array, parses exit codes and timeouts', async () => {
    const sh = join(tmp, 'cli.sh');
    fakeSh(sh, `[[ $1 == sleep ]] && sleep 5; [[ $1 == fail ]] && { echo oops >&2; exit 3; }; exit 0`);
    const cli = new DroverCli(sh);
    expect(await cli.run(['fail'])).toMatchObject({ ok: false, code: 3, stderr: 'oops\n' });
    const t = await cli.run(['sleep'], 100);
    expect([t.ok, t.stderr]).toEqual([false, 'timeout']);
    expect((await new DroverCli(join(tmp, 'missing')).run([])).stderr).toContain('ENOENT');
    const r = await cli.send('aaaaaaaa', '-x $(y) "q"');
    expect(r.ok).toBe(true);
    expect(readFileSync(`${sh}.log`, 'utf8')).toContain('send aaaaaaaa drover droverstatusui -x $(y) "q"');
  });
});

describe('Store', () => {
  it('emits only on change; liveness transitions; remove', async () => {
    const root = join(tmp, 'store');
    corral(root, 'eeeeeeee', { session: 's', slug: 'e' });
    const store = new Store(root);
    const ev: string[] = [];
    store.on('updated', (h) => ev.push(`u${h}`)).on('removed', (h) => ev.push(`r${h}`));
    await store.scan();
    await store.refresh('eeeeeeee');
    expect(ev).toEqual([]);
    expect(store.get('eeeeeeee')?.liveness).toBe('unknown');
    store.setSessions(new Map([['s', true]]));
    store.setSessions(new Map());
    store.setSessions(undefined);
    expect(store.get('eeeeeeee')?.liveness).toBe('unknown');
    expect(ev.length).toBe(3);
    rmSync(join(root, 'eeeeeeee'), { recursive: true });
    await store.refresh('eeeeeeee');
    expect(ev.at(-1)).toBe('reeeeeeee');
  });
});

describe('watcher', () => {
  it('debounces updates and ignores lock/tmp files', async () => {
    const root = join(tmp, 'watch');
    corral(root, 'ffffffff', { session: 's', slug: 'before' });
    const store = new Store(root);
    await store.scan();
    const seen: string[] = [];
    store.on('updated', (_h, c) => seen.push(c.slug));
    const stop = startWatcher(root, store, 50);
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(join(root, 'ffffffff', 'registry.json.lock'), '');
    writeFileSync(join(root, 'ffffffff', 'registry.json'), JSON.stringify({ session: 's', slug: 'after' }));
    await new Promise((r) => setTimeout(r, 1000));
    await stop();
    expect(seen).toEqual(['after']);
  });
});

describe('SSE', () => {
  it('sends snapshot, then corral-updated and corral-removed', async () => {
    const root = join(tmp, 'sse');
    corral(root, '11111111', { session: 's', slug: 'a' });
    const { app, store } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: ac.signal });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    let buf = '';
    const until = async (needle: string) => {
      while (!buf.includes(needle)) buf += new TextDecoder().decode((await reader.read()).value);
    };
    await until('event: snapshot');
    expect(buf).toContain('"slug":"a"');
    writeFileSync(join(root, '11111111', 'registry.json'), JSON.stringify({ session: 's', slug: 'b' }));
    await store.refresh('11111111');
    await until('event: corral-updated');
    expect(buf).toContain('"slug":"b"');
    rmSync(join(root, '11111111'), { recursive: true });
    await store.refresh('11111111');
    await until('event: corral-removed');
    ac.abort();
    await app.close();
  });
});

describe('SPA fallback', () => {
  it('serves index.html for non-api GETs, 404 JSON for api and non-GET', async () => {
    const dist = join(tmp, 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<h1>spa</h1>');
    const { app } = await buildApp({ root: join(tmp, 'spa-root'), droverSh: join(tmp, 'none.sh'), webDist: dist });
    const get = (url: string, method: 'GET' | 'POST' = 'GET') => app.inject({ method, url, headers: { host: 'localhost' } });
    expect((await get('/')).body).toBe('<h1>spa</h1>');
    expect((await get('/corral/aaaaaaaa')).body).toBe('<h1>spa</h1>');
    expect((await get('/api/nope')).statusCode).toBe(404);
    expect((await get('/x', 'POST')).statusCode).toBe(404);
  });
});
