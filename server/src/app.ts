import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
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
  const app = Fastify();
  registerRoutes(app, { store, cli: new DroverCli(droverSh), root });
  const dist = webDist ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(dist)) await app.register(fastifyStatic, { root: dist });
  return { app, store };
}
