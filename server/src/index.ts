import { buildApp } from './app.js';
import { config } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

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
