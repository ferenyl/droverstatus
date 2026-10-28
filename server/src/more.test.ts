// SPDX-License-Identifier: GPL-3.0-only
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAuthedApp } from './testAuth.js';
import { listSessions } from './liveness.js';
import { Store } from './store.js';
import { startWatcher } from './watcher.js';

const tmp = mkdtempSync(join(tmpdir(), 'ds-more-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function corral(root: string, hid: string, reg: object) {
  mkdirSync(join(root, hid), { recursive: true });
  writeFileSync(join(root, hid, 'registry.json'), JSON.stringify(reg));
}

function script(name: string, body: string) {
  const f = join(tmp, name);
  writeFileSync(f, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(f, 0o755);
  return f;
}

describe('listSessions', () => {
  it('parses output; "No active" = empty; other failures and missing binary = unknown', async () => {
    expect([...(await listSessions(script('z1', 'echo "a [Created 1m ago]"; echo "b (EXITED - attach to resurrect)"')))!]).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect((await listSessions(script('z2', 'echo "No active zellij sessions found." >&2; exit 1')))?.size).toBe(0);
    expect(await listSessions(script('z3', 'echo boom >&2; exit 1'))).toBeUndefined();
    expect(await listSessions(join(tmp, 'missing'))).toBeUndefined();
  });
});

describe('Store', () => {
  it('serializes concurrent refreshes: the last write wins, one event per change', async () => {
    const root = join(tmp, 'ser');
    corral(root, '22222222', { session: 's', slug: 'one' });
    const store = new Store(root);
    await store.scan();
    const slugs: string[] = [];
    store.on('updated', (_h, c) => slugs.push(c.slug));
    corral(root, '22222222', { session: 's', slug: 'two' });
    const a = store.refresh('22222222');
    corral(root, '22222222', { session: 's', slug: 'three' });
    const b = store.refresh('22222222');
    await Promise.all([a, b]);
    expect(store.get('22222222')?.slug).toBe('three');
    expect(slugs.at(-1)).toBe('three');
  });
  it('liveness follows the session list; closing flag from closing_at', async () => {
    const root = join(tmp, 'live');
    corral(root, '33333333', { session: 's', slug: 'x', closing_at: 5 });
    const store = new Store(root);
    store.setSessions(new Map([['s', true]]));
    await store.scan();
    expect([store.get('33333333')?.liveness, store.get('33333333')?.closing]).toEqual(['alive', true]);
    store.setSessions(new Map([['s', false]]));
    expect(store.get('33333333')?.liveness).toBe('dead');
  });
});

describe('watcher', () => {
  it('coalesces bursts into one refresh; ignores mktemp files and the sessions dir', async () => {
    const root = join(tmp, 'w');
    corral(root, '44444444', { session: 's', slug: 'a' });
    mkdirSync(join(root, 'sessions'));
    const store = new Store(root);
    await store.scan();
    let refreshes = 0;
    const orig = store.refresh.bind(store);
    store.refresh = (h, e) => (refreshes++, orig(h, e));
    const stop = startWatcher(root, store, 100);
    await sleep(300);
    writeFileSync(join(root, '44444444', 'registry.json.AbC123'), '{}'); // jq/mktemp scratch
    writeFileSync(join(root, 'sessions', 'x.json'), '{}');
    expect(refreshes).toBe(0);
    for (const slug of ['b', 'c', 'd']) corral(root, '44444444', { session: 's', slug });
    await sleep(1000);
    await stop();
    expect(refreshes).toBe(1);
    expect(store.get('44444444')?.slug).toBe('d');
  });
});

describe('SSE', () => {
  it('detaches store listeners when the client disconnects', async () => {
    const root = join(tmp, 'sse');
    corral(root, '55555555', { session: 's', slug: 'a' });
    const { app, store, cookie } = await buildAuthedApp({ root, droverSh: join(tmp, 'x.sh'), webDist: join(tmp, 'none') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: ac.signal, headers: { cookie } });
    await res.body!.getReader().read();
    expect(store.listenerCount('updated')).toBe(1);
    ac.abort();
    await sleep(200);
    expect(store.listenerCount('updated')).toBe(0);
    await app.close();
  });
});
