// SPDX-License-Identifier: GPL-3.0-only
import { isIP } from 'node:net';
import { parseArgs } from 'node:util';
import { buildApp } from './app.js';
import { Auth } from './auth/auth.js';
import { runAuthCommand } from './auth/cli.js';
import { authPaths } from './auth/file.js';
import { loadConfig, parseOrigins, parseTrustProxy } from './config.js';
import { startLiveness } from './liveness.js';
import { startWatcher } from './watcher.js';

process.title = 'droverstatus';

let args: ReturnType<typeof parse>;
function parse() {
  return parseArgs({
    allowPositionals: true,
    options: { port: { type: 'string', short: 'p' }, 'web-port': { type: 'string', short: 'w' }, bind: { type: 'string' }, 'allowed-origins': { type: 'string' }, 'trust-proxy': { type: 'string' } },
  });
}
try {
  args = parse();
} catch (e) {
  console.error(`droverstatus: ${(e as Error).message}`);
  process.exit(2);
}
// reset-password / set-password: no drover.sh or server needed
if (args.positionals.length) process.exit(await runAuthCommand(args.positionals, authPaths().file));

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
  const { values } = args;
  const toPort = (v: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid port: ${v}`);
    return n;
  };
  if (values.bind !== undefined) config.host = values.bind;
  if (isIP(config.host) === 0) throw new Error(`invalid bind address (IP expected): ${config.host}`);
  if (values.port !== undefined) config.port = toPort(values.port);
  if (values['web-port'] !== undefined) config.webPort = toPort(values['web-port']);
  if (values['allowed-origins'] !== undefined) config.allowedOrigins = parseOrigins(values['allowed-origins']);
  if (values['trust-proxy'] !== undefined) config.trustProxy = parseTrustProxy(values['trust-proxy']);
} catch (e) {
  console.error(`droverstatus: ${(e as Error).message}`);
  process.exit(1);
}
config.warnings.forEach((w) => console.warn(`droverstatus: warning: ${w}`));
const opened = await Auth.open(config.authPaths);
if (!opened.ok) {
  console.error(`droverstatus: ${opened.error}`);
  process.exit(1);
}
const auth = opened.value;
const { app, store } = await buildApp({ ...config, auth });
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

// the #fragment never reaches the server or proxy logs; under systemd stdout is the journal, so only the path goes there
const loginBase = config.dev ? `http://127.0.0.1:${config.webPort}` : base;
const announce = (token: string, file?: string) => {
  if (process.stdout.isTTY) console.log(`droverstatus: no password set, log in at ${loginBase}/login#token=${token}`);
  else if (file) console.log(`droverstatus: no password set, the login token is in ${file}`);
  else console.warn('droverstatus: no password set and XDG_RUNTIME_DIR is unset: start on a TTY to see the login token, or run `droverstatus set-password`');
};
if (auth.bootstrapToken) announce(auth.bootstrapToken, auth.tokenFile);
auth.on('bootstrap', announce);
if (config.host !== '127.0.0.1' && !/^\[?(0{0,4}:)+0{0,3}1\]?$/.test(config.host))
  console.warn(`droverstatus: warning: listening on ${config.host}, not loopback. Plain HTTP sends the password and session cookie unencrypted: put an HTTPS reverse proxy in front.`);

if (process.stdin.isTTY) {
  // Raw mode swallows SIGINT, so handle Ctrl+C here along with Esc
  process.stdin.setRawMode(true);
  process.stdin.on('data', (d) => {
    if (d[0] === 0x03 || (d.length === 1 && d[0] === 0x1b)) void shutdown();
  });
  console.log('Ctrl+C or Esc to stop');
}
