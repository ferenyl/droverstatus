import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError } from 'fastify';
import { DroverCli } from './droverCli.js';
import { registerRoutes } from './routes.js';
import { Store } from './store.js';

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
  const dist = webDist ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) =>
      req.method === 'GET' && !req.url.startsWith('/api/') ? reply.sendFile('index.html') : reply.code(404).send({ error: 'not found' }),
    );
  }
  return { app, store };
}
