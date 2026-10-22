// SPDX-License-Identifier: GPL-3.0-only
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareVersions, findDroverSh, loadConfig, pluginVersion } from './config.js';

const home = mkdtempSync(join(tmpdir(), 'ds-cfg-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

function plugin(version: string, withManifest = true) {
  const root = join(home, '.claude/plugins/cache/mk/pl', version);
  mkdirSync(join(root, 'skills/drover/scripts'), { recursive: true });
  const sh = join(root, 'skills/drover/scripts/drover.sh');
  writeFileSync(sh, '#!/bin/sh\n');
  chmodSync(sh, 0o755);
  if (withManifest) {
    mkdirSync(join(root, '.claude-plugin'), { recursive: true });
    writeFileSync(join(root, '.claude-plugin/plugin.json'), JSON.stringify({ version }));
  }
  return sh;
}

describe('drover.sh discovery', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.8.0', '0.9.0')).toBeLessThan(0);
  });
  it('fails with a "set DROVER_SH" message when nothing is found', () => {
    const env = { HOME: home, PATH: '/nonexistent' };
    expect(findDroverSh('/nonexistent', home)).toBeUndefined();
    expect(() => loadConfig(env, home)).toThrow(/set DROVER_SH/);
  });
  it('picks the newest plugin version from the cache', () => {
    plugin('0.8.0');
    const newest = plugin('0.10.0');
    expect(findDroverSh('/nonexistent', home)).toBe(newest);
  });
  it('prefers PATH', () => {
    const dir = join(home, 'bin');
    mkdirSync(dir);
    const f = join(dir, 'drover.sh');
    writeFileSync(f, '#!/bin/sh\n');
    chmodSync(f, 0o755);
    expect(findDroverSh(dir, home)).toBe(f);
  });
  it('DROVER_SH must exist; warns when the plugin is older than 0.11.0', () => {
    expect(() => loadConfig({ DROVER_SH: join(home, 'nope') })).toThrow(/does not exist/);
    const old = plugin('0.8.0');
    expect(pluginVersion(old)).toBe('0.8.0');
    expect(loadConfig({ DROVER_SH: old }).warnings).toHaveLength(1);
    expect(loadConfig({ DROVER_SH: plugin('0.11.0') }).warnings).toEqual([]);
    expect(loadConfig({ DROVER_SH: plugin('1.0.0', false) }).warnings).toEqual([]);
  });
});
