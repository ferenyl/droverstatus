// SPDX-License-Identifier: GPL-3.0-only
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import Fastify, { type FastifyError } from 'fastify';
import { DroverCli } from './droverCli.js';
import { registerRoutes } from './routes.js';
import { Store } from './store.js';

// Injected by scripts/build-dist.mjs: url path -> [content type, base64 gzipped body]
declare const __WEB_ASSETS__: Record<string, [string, string]> | undefined;

export interface AppOpts {
  root: string;
  droverSh: string;
  webDist?: string;
  dev?: boolean;
  webPort?: number;
  host?: string;
  projectRoots?: string[];
  detached?: boolean;
}

export async function buildApp({ root, droverSh, webDist, dev, webPort = 5187, host: bind = '127.0.0.1', projectRoots, detached }: AppOpts) {
  const store = new Store(root);
  await store.scan();
  const app = Fastify({ bodyLimit: 256 * 1024, forceCloseConnections: true });
  const wildcard = bind === '0.0.0.0' || bind === '::';
  const bound = bind.includes(':') ? `[${bind}]` : bind;
  const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
  // loopback names, the bound IP, and (wildcard bind) any IP literal; never other hostnames
  const allowedHost = (h: string) =>
    LOOPBACK.has(h) || h === bound || (wildcard && /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i.test(h));
  app.addHook('onRequest', async (req, reply) => {
    // DNS-rebinding guard: the API can launch agents
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!allowedHost(host)) return reply.code(403).send({ error: 'bad host' });
    // cross-site POST/DELETE guard; non-browser clients send no Origin
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      // same origin as the Host (also through the Vite proxy) or the dev UI port
      const o = /^https?:\/\/([^/]+)$/.exec(origin)?.[1];
      const oh = o?.replace(/:\d+$/, '') ?? '';
      const uiOrigin = o?.replace(/^.*:/, '') === String(webPort) && (LOOPBACK.has(oh) || oh === bound);
      if (!o || !allowedHost(oh) || (o !== req.headers.host && !uiOrigin)) return reply.code(403).send({ error: 'bad origin' });
    }
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff').header('x-frame-options', 'DENY');
    reply.header('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  });
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'internal error' : err.message });
  });
  registerRoutes(app, { store, cli: new DroverCli(droverSh, undefined, detached), root, projectRoots });
  if (dev) {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: `not found (dev: API only, the UI is on the Vite dev server http://127.0.0.1:${webPort})` }));
    return { app, store };
  }
  if (typeof __WEB_ASSETS__ !== 'undefined' && !webDist) {
    const assets = new Map(Object.entries(__WEB_ASSETS__).map(([p, [type, b64]]) => [p, { type, gz: Buffer.from(b64, 'base64') }]));
    const index = assets.get('/index.html')!;
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      const a = assets.get(req.url.split('?')[0]) ?? index;
      reply.type(a.type).header('vary', 'accept-encoding');
      if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) return reply.header('content-encoding', 'gzip').send(a.gz);
      return reply.send(gunzipSync(a.gz));
    });
    return { app, store };
  }
  const dist = webDist ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(dist)) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.code(404).send({ error: 'not found' }),
    );
  }
  return { app, store };
}
