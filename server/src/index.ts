// SPDX-License-Identifier: GPL-3.0-only
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (e) {
  console.error(`droverstatus: ${(e as Error).message}`);
  process.exit(1);
}
config.warnings.forEach((w) => console.warn(`droverstatus: warning: ${w}`));
const { app, store } = await buildApp(config);
const stopWatcher = startWatcher(config.root, store);
const stopLiveness = startLiveness(store, config.zellijBin);
await app.listen({ host: config.host, port: config.port });
console.log(`droverstatus on http://${config.host}:${config.port} (root ${config.root})`);

const shutdown = async () => {
  stopLiveness();
  await stopWatcher();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
