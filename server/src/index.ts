// SPDX-License-Identifier: GPL-3.0-only
import { isIP } from 'node:net';
import { parseArgs } from 'node:util';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

process.title = 'droverstatus';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
  const { values } = parseArgs({ options: { port: { type: 'string', short: 'p' }, 'web-port': { type: 'string', short: 'w' }, bind: { type: 'string' } } });
  const toPort = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid port: ${v}`);
    return n;
  };
  if (values.bind !== undefined) config.host = values.bind;
  if (isIP(config.host) === 0) throw new Error(`invalid bind address (IP expected): ${config.host}`);
  if (values.port !== undefined) config.port = toPort(values.port);
  if (values['web-port'] !== undefined) config.webPort = toPort(values['web-port']);
} catch (e) {
  console.error(`droverstatus: ${(e as Error).message}`);
  process.exit(1);
}
config.warnings.forEach((w) => console.warn(`droverstatus: warning: ${w}`));
const { app, store } = await buildApp(config);
const stopWatcher = startWatcher(config.root, store);
const stopLiveness = startLiveness(store, config.zellijBin);

const restoreTty = () => {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {}
};
process.on('exit', restoreTty);
process.on('unhandledRejection', (e) => console.error('droverstatus: unhandled rejection:', e));
process.on('uncaughtException', (e) => {
  console.error('droverstatus: uncaught exception:', e);
  process.exit(1);
});

const shutdown = async (code = 0) => {
  // never hang on a stuck close
  setTimeout(() => process.exit(code), 5000).unref();
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
const hostUrl = config.host.includes(':') ? `[${config.host}]` : config.host;
const base = `http://${hostUrl}:${config.port}`;
if (config.dev) {
  console.log(`webui:  http://127.0.0.1:${config.webPort}`);
  console.log(`server: ${base} (root ${config.root})`);
} else console.log(`droverstatus: ${base} (root ${config.root})`);

console.warn('droverstatus: WARNING: no authentication or CSRF token. Anyone who can reach the port can launch, message and stop agents.');
if (config.host !== '127.0.0.1' && !/^\[?(0{0,4}:)+0{0,3}1\]?$/.test(config.host))
  console.warn(
    `\n!!! WARNING: listening on ${config.host}, NOT loopback. There is no authentication: anyone who can reach ${hostUrl}:${config.port} can launch and stop your agents and run commands through them. Use only on trusted, firewalled networks.\n`,
  );

if (process.stdin.isTTY) {
  // Raw mode swallows SIGINT, so handle Ctrl+C here along with Esc
  process.stdin.setRawMode(true);
  process.stdin.on('data', (d) => {
    if (d[0] === 0x03 || (d.length === 1 && d[0] === 0x1b)) void shutdown();
  });
  console.log('Ctrl+C or Esc to stop');
}
