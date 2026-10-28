// SPDX-License-Identifier: GPL-3.0-only
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthSession, LoginBody, PasswordBody } from '@droverstatus/shared';
import type { Auth, AuthFailure } from './auth.js';
import { clearedCookie, sessionCookie, sessionFromCookie } from './cookie.js';

const PUBLIC = new Set(['GET /api/auth/session', 'HEAD /api/auth/session', 'POST /api/auth/login', 'POST /api/auth/logout']);

export const sessionOf = (req: FastifyRequest) => sessionFromCookie(req.headers.cookie);
// req.protocol honours X-Forwarded-Proto only with trustProxy
const https = (req: FastifyRequest) => req.protocol === 'https';

const decoded = (url: string) => {
  try {
    return decodeURIComponent(url.split('?')[0]);
  } catch {
    return url;
  }
};

const failed = (reply: FastifyReply, f: AuthFailure) => {
  if (f.retryAfter) reply.header('retry-after', String(f.retryAfter));
  return reply.code(f.status).send({ error: f.error });
};

/** register after the Host/Origin guard: hooks run in order */
export function registerAuth(app: FastifyInstance, auth: Auth): void {
  app.addHook('onRequest', async (req, reply) => {
    // the matched route, so encoded paths cannot slip past; unmatched /api/* is gated too
    const route = req.routeOptions.url;
    const api = route?.startsWith('/api/') || decoded(req.url).toLowerCase().startsWith('/api/');
    if (!api || (route && PUBLIC.has(`${req.method} ${route}`))) return;
    if (!auth.valid(sessionOf(req))) return reply.code(401).send({ error: 'unauthorized' });
  });
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/auth/')) reply.header('cache-control', 'no-store');
  });

  app.get('/api/auth/session', async (req): Promise<AuthSession> => ({ authenticated: auth.valid(sessionOf(req)), passwordSet: auth.passwordSet }));

  app.post<{ Body: LoginBody }>('/api/auth/login', async (req, reply) => {
    const r = await auth.login(req.ip, req.body?.password, req.body?.token);
    if (!r.ok) return failed(reply, r);
    return reply.code(204).header('set-cookie', sessionCookie(r.session, https(req))).send();
  });

  app.post('/api/auth/logout', async (req, reply) => {
    auth.logout(sessionOf(req));
    return reply.code(204).header('set-cookie', clearedCookie(https(req))).send();
  });

  app.post<{ Body: PasswordBody }>('/api/auth/password', async (req, reply) => {
    const b = req.body;
    const r = await auth.changePassword(req.ip, b?.current, b?.token, b?.password);
    if (!r.ok) return failed(reply, r);
    return reply.code(204).header('set-cookie', sessionCookie(r.session, https(req))).send();
  });
}
