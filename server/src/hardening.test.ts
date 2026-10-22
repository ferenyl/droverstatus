// SPDX-License-Identifier: GPL-3.0-only
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { DroverCli, parseWorktrees } from './droverCli.js';
import { Store, tailLines } from './store.js';

const tmp = mkdtempSync(join(tmpdir(), 'ds-hard-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function corral(root: string, hid: string, reg: object = { session: 's', slug: 'x', agents: { dev: {} } }) {
  mkdirSync(join(root, hid, 'reports'), { recursive: true });
  writeFileSync(join(root, hid, 'registry.json'), JSON.stringify(reg));
}

function script(file: string, body: string) {
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

describe('Host/Origin guard', () => {
  const root = join(tmp, 'guard');
  corral(root, 'aaaaaaaa');
  const post = async (headers: Record<string, string | undefined>, opts: { webPort?: number; host?: string } = {}) => {
    const { app } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none'), ...opts });
    return (await app.inject({ method: 'POST', url: '/api/corrals/zz/revive', headers })).statusCode;
  };
  it('IPv6 loopback Host passes, other hosts do not', async () => {
    expect(await post({ host: '[::1]:4177' })).toBe(400);
    expect(await post({ host: '10.0.0.5:4177' })).toBe(403);
  });
  it('origin: same-origin and dev UI port pass; other port, null, foreign are 403', async () => {
    const h = 'localhost:4177';
    expect(await post({ host: h, origin: 'http://localhost:4177' })).toBe(400);
    expect(await post({ host: h, origin: 'http://127.0.0.1:5187' })).toBe(400);
    expect(await post({ host: h, origin: 'http://localhost:9999' })).toBe(403);
    expect(await post({ host: h, origin: 'null' })).toBe(403);
    expect(await post({ host: h, origin: 'http://evil.example:4177' })).toBe(403);
  });
  it('wildcard bind allows IP literals only', async () => {
    expect(await post({ host: '192.168.1.5:4177' }, { host: '0.0.0.0' })).toBe(400);
    expect(await post({ host: 'evil.example:4177' }, { host: '0.0.0.0' })).toBe(403);
  });
  it('wildcard bind: dev UI port origin only from loopback, not any IP', async () => {
    const h = '192.168.1.5:4177';
    expect(await post({ host: h, origin: 'http://127.0.0.1:5187' }, { host: '0.0.0.0' })).toBe(400);
    expect(await post({ host: h, origin: 'http://6.6.6.6:5187' }, { host: '0.0.0.0' })).toBe(403);
    expect(await post({ host: h, origin: 'http://192.168.1.5:5187' }, { host: '0.0.0.0' })).toBe(403);
    expect(await post({ host: h, origin: 'http://192.168.1.5:5187' }, { host: '192.168.1.5' })).toBe(400);
    expect(await post({ host: h, origin: 'http://6.6.6.6:5187' }, { host: '192.168.1.5' })).toBe(403);
  });
  it('sets hardening headers', async () => {
    const { app } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none') });
    const r = await app.inject({ method: 'GET', url: '/api/corrals', headers: { host: 'localhost' } });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
});

describe('path safety', () => {
  const root = join(tmp, 'paths');
  const outside = join(tmp, 'outside');
  const hid = 'bbbbbbbb';
  it('/doc: ext, symlink, dot-dir secrets, unregistered', async () => {
    corral(root, hid);
    mkdirSync(join(outside, '.ssh'), { recursive: true });
    writeFileSync(join(outside, 'ok.md'), '# ok');
    writeFileSync(join(outside, 'notes.txt'), 'x');
    writeFileSync(join(outside, 'run.log'), 'l');
    writeFileSync(join(outside, 'data.bin'), 'b');
    writeFileSync(join(outside, '.ssh', 'key.md'), 'secret');
    symlinkSync(join(outside, 'data.bin'), join(outside, 'link.md'));
    const paths = [join(outside, 'ok.md'), join(outside, '.ssh', 'key.md'), join(outside, 'link.md'), join(outside, 'data.bin'), outside];
    writeFileSync(join(root, hid, 'docs.json'), JSON.stringify([...paths, join(outside, 'notes.txt'), join(outside, 'run.log')].map((path) => ({ path }))));
    const { app } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none') });
    const get = (path: string) => app.inject({ method: 'GET', url: `/api/corrals/${hid}/doc?path=${encodeURIComponent(path)}`, headers: { host: 'localhost' } });
    expect((await get(paths[0])).body).toBe('# ok');
    expect((await get(join(outside, 'notes.txt'))).body).toBe('x');
    expect((await get(join(outside, 'run.log'))).body).toBe('l');
    for (const p of paths.slice(1)) expect((await get(p)).statusCode).toBe(404);
    expect((await get('/etc/passwd')).statusCode).toBe(404);
  });
  it('stories/reports/brief: traversal rejected, symlink escape rejected', async () => {
    mkdirSync(join(root, hid, 'stories'), { recursive: true });
    writeFileSync(join(outside, 'secret.md'), 'secret');
    symlinkSync(join(outside, 'secret.md'), join(root, hid, 'stories', 's1.md'));
    symlinkSync(join(outside, 'secret.md'), join(root, hid, 'reports', 'r1.md'));
    writeFileSync(join(root, hid, 'stories', 's2.md'), 'fine');
    const { app } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none') });
    const get = (url: string) => app.inject({ method: 'GET', url: `/api/corrals/${hid}${url}`, headers: { host: 'localhost' } });
    expect((await get('/stories/..%2Fregistry')).statusCode).toBe(400);
    expect((await get('/stories/s1')).statusCode).toBe(404);
    expect((await get('/reports/r1')).statusCode).toBe(404);
    const ok = await get('/stories/s2');
    expect([ok.statusCode, ok.body, ok.headers['x-content-type-options']]).toEqual([200, 'fine', 'nosniff']);
  });
  it('project dir allowlist', async () => {
    const allowed = join(tmp, 'allowed');
    mkdirSync(allowed);
    const sh = join(tmp, 'new.sh');
    script(sh, 'echo HID=cccccccc');
    const { app } = await buildApp({ root, droverSh: sh, webDist: join(tmp, 'none'), projectRoots: [allowed] });
    const post = (dir: string) => app.inject({ method: 'POST', url: '/api/corrals', headers: { host: 'localhost' }, payload: { slug: 'x', dir } });
    expect((await post(outside)).statusCode).toBe(403);
    expect((await post(allowed)).statusCode).toBe(201);
  });
});

describe('lifecycle guard', () => {
  it('concurrent close of the same corral gets 409', async () => {
    const root = join(tmp, 'life');
    corral(root, 'dddddddd');
    const sh = join(tmp, 'slow.sh');
    script(sh, 'sleep 0.5');
    const { app } = await buildApp({ root, droverSh: sh, webDist: join(tmp, 'none') });
    const del = () => app.inject({ method: 'DELETE', url: '/api/corrals/dddddddd?worktrees=keep', headers: { host: 'localhost' } });
    const [a, b] = await Promise.all([del(), del()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  });
});

describe('SSE lifecycle', () => {
  it('registers store listeners per client and removes them on disconnect; caps clients', async () => {
    const root = join(tmp, 'sse2');
    corral(root, '22222222');
    const { app, store } = await buildApp({ root, droverSh: join(tmp, 'none.sh'), webDist: join(tmp, 'none') });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;
    const base = store.listenerCount('updated');
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: ac.signal });
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: snapshot');
    expect(store.listenerCount('updated')).toBe(base + 1);
    ac.abort();
    await new Promise((r) => setTimeout(r, 200));
    expect(store.listenerCount('updated')).toBe(base);
    await app.close();
  });
});

describe('tailLines', () => {
  const f = join(tmp, 'tail.log');
  it('no trailing newline: unterminated line is not returned', async () => {
    writeFileSync(f, 'a\nb\nc');
    const t = await tailLines(f);
    expect([t.lines, t.total, t.offset]).toEqual([['a', 'b'], 2, 0]);
  });
  it('cap keeps the newest lines and reports the offset', async () => {
    writeFileSync(f, 'aa\nbb\ncc\n');
    const t = await tailLines(f, 2);
    expect([t.lines, t.offset]).toEqual([['bb', 'cc'], 3]);
    expect((await tailLines(f, 2, 3)).lines).toEqual(['aa']);
  });
  it('window boundary: starts at a line start, multibyte safe', async () => {
    const line = 'ö'.repeat(1000) + '\n';
    const big = join(tmp, 'big.log');
    writeFileSync(big, line.repeat(400));
    const t = await tailLines(big, 1000);
    expect(t.offset).toBeGreaterThan(0);
    expect(t.lines.every((l) => l === 'ö'.repeat(1000))).toBe(true);
    expect(t.total).toBe(400);
  });
  it('truncated file recounts from zero; appended file counts incrementally', async () => {
    writeFileSync(f, '1\n2\n3\n4\n');
    expect((await tailLines(f)).total).toBe(4);
    appendFileSync(f, '5\n');
    expect((await tailLines(f)).total).toBe(5);
    truncateSync(f, 2);
    writeFileSync(f, '9\n');
    const t = await tailLines(f);
    expect([t.lines, t.total]).toEqual([['9'], 1]);
  });
  it('missing file is empty', async () => {
    expect(await tailLines(join(tmp, 'nope.log'))).toEqual({ lines: [], total: 0, offset: 0 });
  });
});

describe('Store.refresh', () => {
  it('serializes per hid: last write wins; torn write keeps last good', async () => {
    const root = join(tmp, 'refresh');
    corral(root, 'eeeeeeee', { session: 's', slug: 'one' });
    const store = new Store(root);
    await store.scan();
    const seen: string[] = [];
    store.on('updated', (_h, c) => seen.push(c.slug));
    writeFileSync(join(root, 'eeeeeeee', 'registry.json'), JSON.stringify({ session: 's', slug: 'two' }));
    const a = store.refresh('eeeeeeee');
    writeFileSync(join(root, 'eeeeeeee', 'registry.json'), JSON.stringify({ session: 's', slug: 'three!' }));
    const b = store.refresh('eeeeeeee');
    await Promise.all([a, b]);
    expect(store.get('eeeeeeee')?.slug).toBe('three!');
    expect(seen.at(-1)).toBe('three!');
    writeFileSync(join(root, 'eeeeeeee', 'registry.json'), '{"session":');
    await store.refresh('eeeeeeee');
    expect(store.get('eeeeeeee')?.slug).toBe('three!');
  });
});

describe('DroverCli failures', () => {
  it('timeout, ENOENT, maxBuffer overflow, non-numeric exit', async () => {
    const sh = join(tmp, 'cli2.sh');
    script(sh, '[[ $1 == sleep ]] && sleep 5; [[ $1 == big ]] && head -c 5000000 /dev/zero; exit 0');
    const cli = new DroverCli(sh);
    expect((await cli.run(['sleep'], 100)).stderr).toBe('timeout');
    expect((await new DroverCli(join(tmp, 'missing')).run([])).stderr).toContain('ENOENT');
    const big = await cli.run(['big']);
    expect(big.ok).toBe(false);
    expect(big.stderr).toContain('maxBuffer');
  });
  it('parseWorktrees handles spaces in paths and detached HEAD', () => {
    expect(parseWorktrees('/p/my dir/x drover/1 dirty\n/p/y  clean\nnoise')).toEqual([
      { path: '/p/my dir/x', branch: 'drover/1', dirty: true },
      { path: '/p/y', branch: '', dirty: false },
    ]);
  });
});
