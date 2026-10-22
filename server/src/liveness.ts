// SPDX-License-Identifier: GPL-3.0-only
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
    execFile(zellijBin, ['list-sessions', '-n'], { timeout: 10_000 }, (err, stdout, stderr) => {
      // zellij exits 1 with "No active zellij sessions found."; any other failure is "unknown"
      if (err && !stdout && !/no active/i.test(stderr)) return resolve(undefined);
      resolve(parseSessions(stdout));
    });
  });
}

export function startLiveness(store: Store, zellijBin: string, intervalMs = 5000): () => void {
  const tick = async () => store.setSessions(await listSessions(zellijBin));
  void tick();
  // idle when nobody watches (no SSE client) or every corral is closed
  // a fresh viewer must not get a snapshot with stale liveness
  store.on('newListener', (ev) => ev === 'updated' && void tick());
  const t = setInterval(() => {
    if (store.listenerCount('updated') > 0 && store.list().some((c) => !c.closed)) void tick();
  }, intervalMs);
  return () => clearInterval(t);
}
