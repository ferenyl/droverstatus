// SPDX-License-Identifier: GPL-3.0-only
import { parseArgs } from 'node:util';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

process.title = 'droverstatus';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
  const { values } = parseArgs({ options: { port: { type: 'string', short: 'p' } } });
  if (values.port !== undefined) {
    config.port = Number(values.port);
    if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error(`invalid port: ${values.port}`);
  }
} catch (e) {
  console.error(`droverstatus: ${(e as Error).message}`);
  process.exit(1);
}
config.warnings.forEach((w) => console.warn(`droverstatus: warning: ${w}`));
const { app, store } = await buildApp(config);
const stopWatcher = startWatcher(config.root, store);
const stopLiveness = startLiveness(store, config.zellijBin);

const shutdown = async (code = 0) => {
  stopLiveness();
  await stopWatcher();
  await app.close();
  process.exit(code);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ host: config.host, port: config.port });
} catch (e) {
  console.error(`droverstatus: cannot listen on ${config.host}:${config.port}: ${(e as Error).message}`);
  await shutdown(1);
}
console.log(`droverstatus on http://${config.host}:${config.port} (root ${config.root})`);

if (process.stdin.isTTY) {
  // Raw mode swallows SIGINT, so handle Ctrl+C here along with Esc
  process.stdin.setRawMode(true);
  process.stdin.on('data', (d) => {
    if (d[0] === 0x03 || (d.length === 1 && d[0] === 0x1b)) void shutdown();
  });
  console.log('Ctrl+C or Esc to stop');
}
