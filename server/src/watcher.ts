// SPDX-License-Identifier: GPL-3.0-only
import { existsSync } from 'node:fs';
import { relative, sep } from 'node:path';
import chokidar from 'chokidar';
import { HID_RE } from '@droverstatus/shared';
import type { Store } from './store.js';

const noise = /(\.lock|\.tmp|\.(json|log|md|kdl)\.[A-Za-z0-9]{6})$/;
const relevant = /^(registry\.json|docs\.json|brief\.md|plan\.md|tasks\.json|stories\.json|messages\.log|(status|inbox|queue)(\/.*)?|reports(\/.*\.(md|json))?)$/;

export function startWatcher(root: string, store: Store, debounceMs = 150): () => Promise<void> {
  const timers = new Map<string, NodeJS.Timeout>();
  const queue = (path: string) => {
    const hid = relative(root, path).split(sep)[0];
    if (!HID_RE.test(hid)) return;
    clearTimeout(timers.get(hid));
    timers.set(
      hid,
      setTimeout(() => {
        timers.delete(hid);
        void store.refresh(hid);
      }, debounceMs),
    );
  };
  let stopped = false;
  let w: ReturnType<typeof chokidar.watch> | undefined;
  let retry: NodeJS.Timeout | undefined;
  const start = () => {
    // root may not exist yet (drover never ran): poll until it does, then pick up what is there
    if (!existsSync(root)) {
      retry = setTimeout(start, 2000);
      return;
    }
    const cur = (w = chokidar.watch(root, {
      depth: 3,
      ignoreInitial: true,
      ignored: (p) => {
        if (noise.test(p)) return true;
        const parts = relative(root, p).split(sep);
        // [''] = root, [hid] = corral dir; below that only the files the store reads
        return parts.length > 1 && !relevant.test(parts.slice(1).join('/'));
      },
    }));
    cur.on('error', (e) => {
      console.error('watcher:', e);
      if (stopped || w !== cur) return;
      w = undefined;
      void cur.close().finally(() => !stopped && (retry = setTimeout(start, 5000)));
    });
    cur.on('all', (_ev, p) => queue(p));
    // later starts (root appeared, watcher restarted) may have missed changes
    if (!first) void store.scan().then(() => store.list().forEach((c) => store.emit('updated', c.hid, c)));
    first = false;
  };
  let first = true;
  start();
  return async () => {
    stopped = true;
    clearTimeout(retry);
    timers.forEach(clearTimeout);
    await w?.close();
  };
}
