// SPDX-License-Identifier: GPL-3.0-only
import { randomBytes } from 'node:crypto';

interface Session {
  epoch: number;
  created: number;
  seen: number;
  /** closes the session's open event streams */
  streams: Set<() => void>;
}

export const SESSION_MAX_AGE_S = 30 * 24 * 3600;

/** opaque random ids in memory: a restart logs everyone out */
export class Sessions {
  private readonly map = new Map<string, Session>();

  constructor(
    private readonly maxAgeMs = SESSION_MAX_AGE_S * 1000,
    private readonly idleMs = 7 * 24 * 3600_000,
    private readonly now = Date.now,
  ) {}

  create(epoch: number): string {
    const t = this.now();
    for (const [id, s] of this.map) if (!this.live(s, epoch, t)) this.delete(id);
    const id = randomBytes(32).toString('base64url');
    this.map.set(id, { epoch, created: t, seen: t, streams: new Set() });
    return id;
  }

  /** valid for `epoch`, and not expired; refreshes the idle timer */
  check(id: string | undefined, epoch: number): boolean {
    const s = id === undefined ? undefined : this.map.get(id);
    if (!s) return false;
    const t = this.now();
    if (!this.live(s, epoch, t)) {
      this.delete(id!);
      return false;
    }
    s.seen = t;
    return true;
  }

  delete(id: string): void {
    const s = this.map.get(id);
    if (!s) return;
    this.map.delete(id);
    s.streams.forEach((end) => end());
  }

  clear(): void {
    [...this.map.keys()].forEach((id) => this.delete(id));
  }

  /** `end` runs when the session goes away; the returned function unregisters it */
  track(id: string | undefined, end: () => void): () => void {
    const s = id === undefined ? undefined : this.map.get(id);
    if (!s) return () => {};
    s.streams.add(end);
    return () => s.streams.delete(end);
  }

  private live(s: Session, epoch: number, t: number) {
    return s.epoch === epoch && t - s.created < this.maxAgeMs && t - s.seen < this.idleMs;
  }
}
