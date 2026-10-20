import { relative, sep } from 'node:path';
import chokidar from 'chokidar';
import { HID_RE } from '@droverstatus/shared';
import type { Store } from './store.js';

const noise = /(\.lock|\.tmp|\.(json|log|md|kdl)\.[A-Za-z0-9]{6})$/;

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
  const w = chokidar.watch(root, {
    depth: 3,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    ignored: (p) => noise.test(p) || relative(root, p).split(sep)[0] === 'sessions',
  });
  w.on('error', (e) => console.error('watcher:', e));
  w.on('all', (_ev, p) => queue(p));
  return async () => {
    timers.forEach(clearTimeout);
    await w.close();
  };
}
