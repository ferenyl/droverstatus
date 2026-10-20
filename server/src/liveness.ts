import { execFile } from 'node:child_process';
import type { Store } from './store.js';

/** `zellij list-sessions -n` -> name -> alive (EXITED = dead) */
export function parseSessions(out: string): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const line of out.split('\n')) {
    const name = line.trim().split(/\s+/)[0];
    if (name) m.set(name, !line.includes('EXITED'));
  }
  return m;
}

export function listSessions(zellijBin: string): Promise<Map<string, boolean> | undefined> {
  return new Promise((resolve) => {
    execFile(zellijBin, ['list-sessions', '-n'], { timeout: 10_000 }, (err, stdout) => {
      // zellij exits 1 with no sessions; only a timeout/spawn failure is "unknown"
      if (err && (err.killed || (err as NodeJS.ErrnoException).code === 'ENOENT')) return resolve(undefined);
      resolve(parseSessions(stdout));
    });
  });
}

export function startLiveness(store: Store, zellijBin: string, intervalMs = 5000): () => void {
  const tick = async () => store.setSessions(await listSessions(zellijBin));
  void tick();
  const t = setInterval(tick, intervalMs);
  return () => clearInterval(t);
}
