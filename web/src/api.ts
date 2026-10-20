// SPDX-License-Identifier: GPL-3.0-only
import type { ApiError, Corral, Model, ServerEvent } from '@droverstatus/shared';

export class ApiFail extends Error {
  constructor(public body: ApiError, public status: number) {
    super(body.error);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (!res.ok) throw new ApiFail(typeof data === 'object' ? data : { error: text || res.statusText }, res.status);
  return data as T;
}

const base = (hid: string) => `/api/corrals/${hid}`;

export const api = {
  newDrover: (b: { slug: string; dir: string; model: Model; brief: string }) => call<{ hid: string }>('POST', '/api/corrals', b),
  close: (hid: string, worktrees?: 'remove' | 'keep') =>
    call('DELETE', `${base(hid)}${worktrees ? `?worktrees=${worktrees}` : ''}`),
  revive: (hid: string) => call('POST', `${base(hid)}/revive`),
  send: (hid: string, message: string) => call('POST', `${base(hid)}/messages`, { message }),
  kill: (hid: string, id: string) => call('DELETE', `${base(hid)}/agents/${id}`),
  screen: (hid: string, id: string, lines = 40) =>
    call<{ screen: string }>('GET', `${base(hid)}/agents/${id}/screen?lines=${lines}`),
  report: (hid: string, id: string) => call<string>('GET', `${base(hid)}/reports/${id}`),
};

export function openEvents(onEvent: (e: ServerEvent) => void, onStatus: (connected: boolean) => void): () => void {
  const es = new EventSource('/api/events');
  es.onopen = () => onStatus(true);
  es.onerror = () => onStatus(false);
  for (const t of ['snapshot', 'corral-updated', 'corral-removed'])
    es.addEventListener(t, (m) => {
      try {
        onEvent(JSON.parse((m as MessageEvent).data));
      } catch {
        /* ignore malformed event */
      }
    });
  return () => es.close();
}

export type { Corral };
