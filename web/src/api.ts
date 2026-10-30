// SPDX-License-Identifier: GPL-3.0-only
import type { ApiError, AuthSession, Corral, LoginBody, Message, Model, PasswordBody, ServerEvent, Worktree } from '@droverstatus/shared';

export class ApiFail extends Error {
  constructor(public body: ApiError, public status: number) {
    super(body.error);
  }
}

let onUnauthorized: (() => void) | undefined;
/** Registers the handler run when a non-auth API call returns 401; returns an unregister function. */
export const setUnauthorizedHandler = (f: () => void) => {
  onUnauthorized = f;
  return () => {
    if (onUnauthorized === f) onUnauthorized = undefined;
  };
};

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text;
  if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
  if (!res.ok) throw new ApiFail(typeof data === 'object' ? data : { error: text || res.statusText }, res.status);
  return data as T;
}

const base = (hid: string) => `/api/corrals/${hid}`;

export const api = {
  session: () => call<AuthSession>('GET', '/api/auth/session'),
  login: (b: LoginBody) => call('POST', '/api/auth/login', b),
  logout: () => call('POST', '/api/auth/logout'),
  changePassword: (b: PasswordBody) => call('POST', '/api/auth/password', b),
  newDrover: (b: { slug: string; dir: string; model: Model; brief: string }) => call<{ hid: string }>('POST', '/api/corrals', b),
  close: (hid: string, worktrees?: 'remove' | 'keep') =>
    call('DELETE', `${base(hid)}${worktrees ? `?worktrees=${worktrees}` : ''}`),
  revive: (hid: string) => call('POST', `${base(hid)}/revive`),
  send: (hid: string, message: string, to?: string) => call('POST', `${base(hid)}/messages`, { message, to }),
  flush: (hid: string, id: string) => call('POST', `${base(hid)}/agents/${id}/flush`),
  kill: (hid: string, id: string) => call('DELETE', `${base(hid)}/agents/${id}`),
  screen: (hid: string, id: string, lines = 40) =>
    call<{ screen: string }>('GET', `${base(hid)}/agents/${id}/screen?lines=${lines}`),
  olderMessages: (hid: string, before: number) =>
    call<{ messages: Message[]; offset: number }>('GET', `${base(hid)}/messages?before=${before}`),
  story: (hid: string, id: string) => call<string>('GET', `${base(hid)}/stories/${encodeURIComponent(id)}`),
  docUrl: (hid: string, path: string) => `${base(hid)}/doc?path=${encodeURIComponent(path)}`,
  doc: (hid: string, path: string) => call<string>('GET', api.docUrl(hid, path)),
  brief: (hid: string) => call<string>('GET', `${base(hid)}/brief`),
  worktrees: (hid: string) => call<Worktree[]>('GET', `${base(hid)}/worktrees`),
  report: (hid: string, id: string) => call<string>('GET', `${base(hid)}/reports/${id}`),
};

export function openEvents(onEvent: (e: ServerEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let es: EventSource | undefined;
  let closed = false;
  // EventSource cannot see a 401, so the session is checked before connecting and on every error
  const authenticated = () => api.session().then((s) => s.authenticated, () => true);
  const lose = () => {
    es?.close();
    onStatus(false);
    onUnauthorized?.();
  };
  void authenticated().then((ok) => {
    if (closed) return;
    if (!ok) return lose();
    es = new EventSource('/api/events');
    es.onopen = () => onStatus(true);
    es.onerror = () => {
      onStatus(false);
      void authenticated().then((still) => {
        if (!still && !closed) lose();
      });
    };
    for (const t of ['snapshot', 'corral-updated', 'corral-removed'])
      es.addEventListener(t, (m) => {
        try {
          onEvent(JSON.parse((m as MessageEvent).data));
        } catch {
          /* ignore malformed event */
        }
      });
  });
  return () => {
    closed = true;
    es?.close();
  };
}

export type { Corral };
