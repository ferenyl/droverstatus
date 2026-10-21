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
}

export async function buildApp({ root, droverSh, webDist }: AppOpts) {
  const store = new Store(root);
  await store.scan();
  const app = Fastify({ bodyLimit: 256 * 1024 });
  app.addHook('onRequest', async (req, reply) => {
    // DNS-rebinding guard: the API can launch agents
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return reply.code(403).send({ error: 'bad host' });
  });
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? 'internal error' : err.message });
  });
  registerRoutes(app, { store, cli: new DroverCli(droverSh), root });
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
