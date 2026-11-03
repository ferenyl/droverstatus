// SPDX-License-Identifier: GPL-3.0-only
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Worktree } from '@droverstatus/shared';

export interface CliResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

// passed to detached runs; everything else comes from the user manager
const FORWARD_ENV = ['PATH', 'DROVER_ROOT', 'CLAUDE_CONFIG_DIR'];

export class DroverCli {
  /**
   * detached: run mutations as a transient service of the systemd user manager, in their own scope, so corrals
   * share no process tree, cgroup, sandbox or environment with droverstatus and survive it being stopped or removed
   */
  constructor(private bin: string, private timeoutMs = 30_000, private detached = false) {}

  run(args: string[], timeout = this.timeoutMs, detach = false): Promise<CliResult> {
    const [file, argv] =
      detach && this.detached
        ? ['systemd-run', ['--user', '--pipe', '--wait', '--quiet', '--collect', ...FORWARD_ENV.filter((k) => process.env[k] !== undefined).flatMap((k) => ['-E', k]), 'systemd-run', '--user', '--scope', '--quiet', '--collect', this.bin, ...args]]
        : [this.bin, args];
    return new Promise((resolve) => {
      execFile(file, argv, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const code = !e ? 0 : typeof e.code === 'number' ? e.code : 1;
        const extra = !e || typeof e.code === 'number' ? '' : e.killed ? 'timeout' : `${e.code ?? 'error'}: ${e.message}`;
        resolve({ ok: !e, code, stdout, stderr: [stderr, extra].filter(Boolean).join('\n') });
      });
    });
  }

  async newDrover(slug: string, dir: string, brief: string): Promise<CliResult & { hid?: string }> {
    const tmp = await mkdtemp(join(tmpdir(), 'droverstatus-'));
    try {
      const file = join(tmp, 'brief.md');
      await writeFile(file, brief);
      const r = await this.run(['new', slug, dir, '--brief', file], 120_000, true);
      return { ...r, hid: /^HID=([0-9a-f]{8})$/m.exec(r.stdout)?.[1] };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  close(hid: string, worktrees?: 'remove' | 'keep') {
    const flag = worktrees === 'remove' ? ['--remove-worktrees'] : worktrees === 'keep' ? ['--keep-worktrees'] : [];
    // close waits up to 60s for the session to shut down
    return this.run(['close', hid, ...flag], 90_000, true);
  }

  kill(hid: string, id: string, reason?: string) {
    return this.run(['kill', hid, '--force', id, ...(reason ? ['--reason', reason] : [])], undefined, true);
  }

  model(hid: string, id: string, model: string) {
    // waits for the agent to go idle before typing /model
    return this.run(['model', hid, '--force', id, model], 120_000, true);
  }

  perm(hid: string, id: string, mode: string) {
    return this.run(['perm', hid, '--force', id, mode], 120_000, true);
  }

  purpose(hid: string, id: string, text: string) {
    return this.run(['purpose', hid, '--force', id, text], 120_000, true);
  }

  /** the user clicked it: that is the yes --yes stands for */
  prlink(hid: string, id: string) {
    return this.run(['prlink', hid, '--force', id, '--yes'], 120_000, true);
  }

  approve(hid: string, tid: string, scope: string) {
    return this.run(['approve', hid, '--force', tid, scope], undefined, true);
  }

  dispatch(hid: string, tid: string, agent?: string, fresh = false) {
    return this.run(['dispatch', hid, '--force', tid, ...(agent ? [agent] : []), ...(fresh ? ['--fresh'] : [])], 120_000, true);
  }

  /** name: built-in/custom flow or `ask` (clears); tracker: steps, [] = none, undefined = keep */
  flow(hid: string, name?: string, tracker?: string[], story?: string) {
    return this.run(['flow', hid, '--force', ...(name ? [name] : []), ...(tracker ? [`tracker=${tracker.join(',') || '-'}`] : []), ...(story ? ['--story', story] : [])], 120_000, true);
  }

  send(hid: string, msg: string, to = 'drover') {
    return this.run(['send', hid, to, 'droverstatusui', msg], undefined, true);
  }

  flush(hid: string, id: string) {
    return this.run(['flush', hid, '--force', id], undefined, true);
  }

  worktrees(hid: string) {
    return this.run(['worktrees', hid], 30_000);
  }

  revive(hid: string) {
    return this.run(['revive', hid], 120_000, true);
  }

  read(hid: string, id: string, lines = 40) {
    return this.run(['read', hid, id, String(lines)], 10_000);
  }
}

/** close exit 4 prints "<path> <branch> <dirty|clean>" lines (branch is empty for a detached HEAD) */
export function parseWorktrees(out: string): Worktree[] {
  return out
    .split('\n')
    .map((l) => /^(.+?) (\S*) (dirty|clean)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map(([, path, branch, st]) => ({ path, branch, dirty: st === 'dirty' }));
}
