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

export class DroverCli {
  constructor(private bin: string, private timeoutMs = 30_000) {}

  run(args: string[], timeout = this.timeoutMs): Promise<CliResult> {
    return new Promise((resolve) => {
      execFile(this.bin, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const code = !e ? 0 : typeof e.code === 'number' ? e.code : 1;
        const extra = !e || typeof e.code === 'number' ? '' : e.killed ? 'timeout' : `${e.code ?? 'error'}: ${e.message}`;
        resolve({ ok: !e, code, stdout, stderr: [stderr, extra].filter(Boolean).join('\n') });
      });
    });
  }

  async newDrover(slug: string, dir: string, model: string, brief: string): Promise<CliResult & { hid?: string }> {
    const tmp = await mkdtemp(join(tmpdir(), 'droverstatus-'));
    try {
      const file = join(tmp, 'brief.md');
      await writeFile(file, brief);
      const r = await this.run(['new', slug, dir, '--model', model, '--brief', file], 120_000);
      return { ...r, hid: /^HID=([0-9a-f]{8})$/m.exec(r.stdout)?.[1] };
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  close(hid: string, worktrees?: 'remove' | 'keep') {
    const flag = worktrees === 'remove' ? ['--remove-worktrees'] : worktrees === 'keep' ? ['--keep-worktrees'] : [];
    // close waits up to 60s for the session to shut down
    return this.run(['close', hid, ...flag], 90_000);
  }

  kill(hid: string, id: string) {
    return this.run(['kill', hid, '--force', id]);
  }

  send(hid: string, msg: string) {
    return this.run(['send', hid, 'drover', 'droverstatusui', msg]);
  }

  revive(hid: string) {
    return this.run(['revive', hid], 120_000);
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
