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
