// SPDX-License-Identifier: GPL-3.0-only
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseWorktrees } from './droverCli.js';
import { parseSessions } from './liveness.js';
import { buildCorral, parseMessages } from './store.js';

describe('parsers', () => {
  it('parses messages.log', () => {
    expect(parseMessages('2026-10-18T07:50:33+02:00 [hook -> drover] done: hook\nbad')).toEqual([
      { at: '2026-10-18T07:50:33+02:00', from: 'hook', to: 'drover', text: 'done: hook' },
    ]);
  });
  it('parses sessions, EXITED = dead', () => {
    const m = parseSessions('a [Created 1h ago]\nb [Created 2h ago] (EXITED - attach to resurrect)\n');
    expect([m.get('a'), m.get('b')]).toEqual([true, false]);
  });
  it('parses worktrees', () => {
    expect(parseWorktrees('/p/x drover/1/x dirty\n/p/y b clean')).toEqual([
      { path: '/p/x', branch: 'drover/1/x', dirty: true },
      { path: '/p/y', branch: 'b', dirty: false },
    ]);
  });
});

describe('buildCorral', () => {
  const root = mkdtempSync(join(tmpdir(), 'ds-'));
  it('returns null without registry and tolerates half-written files', async () => {
    expect(await buildCorral(root, 'deadbeef', 'alive')).toBeNull();
    const d = join(root, 'abcd1234');
    mkdirSync(join(d, 'status'), { recursive: true });
    writeFileSync(join(d, 'registry.json'), JSON.stringify({ session: 's', slug: 'x', agents: { a: { model: 'sonnet' } } }));
    writeFileSync(join(d, 'status', 'a.json'), '{"state":"blo');
    writeFileSync(join(d, 'tasks.json'), '[');
    const c = await buildCorral(root, 'abcd1234', 'dead');
    expect(c?.agents[0].status.state).toBe('unknown');
    expect(c?.tasks).toEqual([]);
    writeFileSync(join(d, 'status', 'a.json'), '{"state":"blocked"}');
    expect((await buildCorral(root, 'abcd1234', 'dead'))?.agents[0].status.state).toBe('blocked');
  });
});
