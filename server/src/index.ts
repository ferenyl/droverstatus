import { buildApp } from './app.js';
import { config } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

const { app, store } = await buildApp(config);
startWatcher(config.root, store);
startLiveness(store, config.zellijBin);
await app.listen({ host: config.host, port: config.port });
console.log(`droverstatus on http://${config.host}:${config.port} (root ${config.root})`);
