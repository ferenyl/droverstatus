// SPDX-License-Identifier: GPL-3.0-only
import type { Corral } from '@droverstatus/shared';

export const relTime = (at?: string, now = Date.now()) => {
  if (!at) return '';
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (Number.isNaN(s)) return '';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const counts = (c: Corral) => {
  const n = { busy: 0, idle: 0, blocked: 0 };
  for (const a of c.agents) if (a.status.state in n) n[a.status.state as keyof typeof n]++;
  return n;
};

export const badge = (c: Corral) => (c.closed ? 'closed' : c.liveness === 'alive' ? 'alive' : c.liveness === 'dead' ? 'dead' : 'unknown');

export const errMsg = (e: unknown) => {
  const b = (e as { body?: { error: string; stderr?: string } }).body;
  return b ? `${b.error}${b.stderr ? `: ${b.stderr}` : ''}` : String(e);
};

export const nodeState = (c: Corral, state: string) => (c.closed ? 'closed' : c.liveness === 'dead' ? 'dead' : state);

export type Node = { kind: 'drover' } | { kind: 'agent'; id: string };

/** busy longer than this without a state change looks hung */
export const STUCK_MIN = 30;
/** state start (`since`, drover >= 0.11) falling back to the last hook event */
export const stateSince = (s: { state: string; since?: string; at?: string }) => s.since ?? s.at;
export const isStuck = (s: { state: string; since?: string; at?: string }, now = Date.now()) => {
  const t = Date.parse(stateSince(s) ?? '');
  return s.state === 'busy' && !Number.isNaN(t) && now - t > STUCK_MIN * 60_000;
};

/** things that need the user: blocked agents/drover, tasks failing repeatedly, stories waiting or blocked, queued messages, stuck agents */
export const attention = (c: Corral) => {
  if (c.closed || c.liveness === 'dead') return { count: 0, reasons: [] as string[] };
  const reasons: string[] = [];
  const blocked = [...c.agents.filter((a) => a.status.state === 'blocked').map((a) => a.id), ...(c.drover.status.state === 'blocked' ? ['drover'] : [])];
  if (blocked.length) reasons.push(`${blocked.length} blocked`);
  const stuck = c.agents.filter((a) => isStuck(a.status)).length;
  if (stuck) reasons.push(`${stuck} stuck`);
  const retries = c.tasks.filter((t) => (t.attempts ?? 0) >= 3 && t.state !== 'done').length;
  if (retries) reasons.push(`${retries} task${retries > 1 ? 's' : ''} at 3+ attempts`);
  const stories = c.stories.filter((s) => s.status === 'waiting-for-user' || s.blocked).length;
  if (stories) reasons.push(`${stories} stor${stories > 1 ? 'ies' : 'y'} waiting/blocked`);
  const queued = c.agents.reduce((n, a) => n + (a.queued ?? 0), 0);
  if (queued) reasons.push(`${queued} queued message${queued > 1 ? 's' : ''}`);
  return { count: blocked.length + stuck + retries + stories + queued, reasons };
};
