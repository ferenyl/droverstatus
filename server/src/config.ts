// SPDX-License-Identifier: GPL-3.0-only
import { accessSync, constants, existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

export const MIN_DROVER_VERSION = '0.11.0';

const executable = (f: string) => {
  try {
    accessSync(f, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const parts = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);

/** negative if a < b */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const subdirs = (d: string) => {
  try {
    return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

/** drover.sh from PATH, else the newest ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/drover/scripts/drover.sh */
export function findDroverSh(pathEnv = process.env.PATH ?? '', home = homedir(), claudeDir = join(home, '.claude')): string | undefined {
  for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
    const f = join(dir, 'drover.sh');
    if (executable(f)) return f;
  }
  const cache = join(claudeDir, 'plugins', 'cache');
  const found: { file: string; version: string }[] = [];
  for (const m of subdirs(cache))
    for (const p of subdirs(join(cache, m)))
      for (const v of subdirs(join(cache, m, p))) {
        const file = join(cache, m, p, v, 'skills', 'drover', 'scripts', 'drover.sh');
        if (executable(file)) found.push({ file, version: v });
      }
  found.sort((a, b) => compareVersions(b.version, a.version));
  return found[0]?.file;
}

/** version from the plugin's .claude-plugin/plugin.json above the script, if there is one */
export function pluginVersion(droverSh: string): string | undefined {
  let dir = dirname(droverSh);
  for (let i = 0; i < 4; i++, dir = dirname(dir)) {
    const f = join(dir, '.claude-plugin', 'plugin.json');
    if (!existsSync(f)) continue;
    try {
      const v = JSON.parse(readFileSync(f, 'utf8')).version;
      return typeof v === 'string' ? v : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, home = homedir()) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || join(home, '.claude');
  const droverSh = env.DROVER_SH ?? findDroverSh(env.PATH, home, claudeDir);
  if (!droverSh || !existsSync(droverSh))
    throw new Error(
      droverSh
        ? `DROVER_SH does not exist: ${droverSh}`
        : `drover.sh not found (not on PATH, not in ${join(claudeDir, 'plugins', 'cache')}): set DROVER_SH to its full path`,
    );
  const port = (name: string, def: number) => {
    const n = Number(env[name] ?? def);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`invalid ${name}: ${env[name]}`);
    return n;
  };
  const version = pluginVersion(droverSh);
  return {
    root: env.DROVER_ROOT ?? join(claudeDir, 'drover'),
    droverSh,
    droverVersion: version,
    warnings: version && compareVersions(version, MIN_DROVER_VERSION) < 0 ? [`drover plugin ${version} is older than ${MIN_DROVER_VERSION}; some actions may misbehave`] : [],
    zellijBin: env.ZELLIJ_BIN ?? 'zellij',
    port: port('PORT', 4177),
    webPort: port('WEB_PORT', 5187),
    projectRoots: (env.DROVER_PROJECT_ROOTS ?? '').split(delimiter).filter(Boolean).map((d) => {
      try {
        return realpathSync(d);
      } catch {
        return d;
      }
    }),
    host: env.BIND_ADDR || '127.0.0.1',
    dev: env.DROVER_DEV === '1',
    // corrals are started through the systemd user manager when it is reachable (DROVER_DETACH=0 opts out)
    detached: env.DROVER_DETACH !== '0' && !!env.XDG_RUNTIME_DIR && existsSync(join(env.XDG_RUNTIME_DIR, 'systemd', 'private')),
  };
}
