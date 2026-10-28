// SPDX-License-Identifier: GPL-3.0-only
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildAuthedApp } from './testAuth.js';
import { DroverCli, parseWorktrees } from './droverCli.js';
import { buildCorral } from './store.js';

// drover 0.9.0 behaviour, exercised through the testkit fake drover.sh
const kit = join(dirname(fileURLToPath(import.meta.url)), '../../testkit');
const root = mkdtempSync(join(tmpdir(), 'ds-compat-'));
process.env.DROVER_ROOT = root; // read by the fake
const cli = new DroverCli(join(kit, 'fake/drover.sh'));
const A = 'a1a1a1a1';
const read = (p: string) => readFileSync(join(root, A, p), 'utf8');

beforeAll(() => cpSync(join(kit, 'fixtures'), root, { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('0.9.0 formats', () => {
  it('worktree list: detached HEAD (empty branch) and spaces in path', () => {
    expect(parseWorktrees('/a b/x  clean\n/p/y drover/1/y dirty')).toEqual([
      { path: '/a b/x', branch: '', dirty: false },
      { path: '/p/y', branch: 'drover/1/y', dirty: true },
    ]);
  });
  it('tasks: string attempts, in_progress, missing fields; closing flag; agent worktree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ds-fmt-'));
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(dir, 'abcdef01'));
    writeFileSync(join(dir, 'abcdef01', 'registry.json'), JSON.stringify({ session: 's', closing_at: 1, agents: { a: { worktree: '/w/a' } } }));
    writeFileSync(join(dir, 'abcdef01', 'tasks.json'), JSON.stringify([{ id: 't', state: 'in_progress', attempts: '2' }, null]));
    const c = await buildCorral(dir, 'abcdef01', 'alive');
    expect(c?.closing).toBe(true);
    expect(c?.agents[0].worktree).toBe('/w/a');
    expect(c?.tasks).toEqual([{ id: 't', title: '', acceptance: [], depends_on: [], state: 'in_progress', attempts: 2 }]);
    rmSync(dir, { recursive: true });
  });
});

describe('fake drover.sh is faithful to 0.9.0', () => {
  it('new prints HID= amid the banner', async () => {
    const r = await cli.newDrover('x', root, 'sonnet', 'brief');
    expect(r.ok && /^[0-9a-f]{8}$/.test(r.hid ?? '')).toBe(true);
    expect(JSON.parse(readFileSync(join(root, r.hid!, 'registry.json'), 'utf8')).drover.mode).toBe('corral');
  });
  it('kill needs --force (cli passes it); unknown agent fails', async () => {
    expect((await cli.run(['kill', A, 'alpha'])).code).toBe(1);
    expect((await cli.kill(A, 'nobody')).stderr).toContain('unknown agent');
  });
  it('send to drover -> inbox + messages.log; to blocked agent -> queued; unknown agent fails', async () => {
    expect((await cli.send(A, 'hello')).ok).toBe(true);
    expect(read('inbox/drover.log')).toContain('[droverstatusui -> drover] hello');
    expect(read('messages.log')).toMatch(/ \[droverstatusui -> drover\] hello\n$/);
    const q = await cli.run(['send', A, 'beta', 'droverstatusui', 'hi']);
    expect([q.ok, q.stderr]).toEqual([true, 'queued for beta (blocked)\n']);
    expect(read('messages.log')).toContain('(queued)');
    expect((await cli.run(['send', A, 'nobody', 'x', 'y'])).code).toBe(1);
  });
  it('read: agent and drover ok, unknown fails', async () => {
    expect((await cli.read(A, 'drover')).ok).toBe(true);
    expect((await cli.read(A, 'alpha')).ok).toBe(true);
    expect((await cli.read(A, 'nobody')).code).toBe(1);
  });
  it('close: exit 4 with parseable list, keep -> closed + shutdown', async () => {
    const D = 'd4d4d4d4';
    const r = await cli.close(D);
    expect(r.code).toBe(4);
    expect(parseWorktrees(r.stdout).length).toBeGreaterThan(0);
    expect((await cli.close(D, 'keep')).ok).toBe(true);
    const reg = JSON.parse(readFileSync(join(root, D, 'registry.json'), 'utf8'));
    expect([reg.closed, reg.shutdown]).toEqual([true, true]);
  });
  it('close route -> 409 + worktrees via the fake', async () => {
    const { app, cookie } = await buildAuthedApp({ root, droverSh: join(kit, 'fake/drover.sh'), webDist: join(root, 'none') });
    const r = await app.inject({ method: 'DELETE', url: '/api/corrals/e5e5e5e5', headers: { host: 'localhost', cookie } });
    expect([r.statusCode, r.json().worktrees[0].dirty]).toEqual([409, true]);
  });
});
