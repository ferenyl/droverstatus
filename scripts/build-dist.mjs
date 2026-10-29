// SPDX-License-Identifier: GPL-3.0-only
// Bundles server + built web into a single executable file: dist/droverstatus
import { chmodSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const webDist = 'web/dist';
const files = readdirSync(webDist, { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
const assets = Object.fromEntries(
  files.map((d) => {
    const f = join(d.parentPath, d.name);
    return ['/' + relative(webDist, f), [types[extname(f)] ?? 'application/octet-stream', gzipSync(readFileSync(f), { level: 9 }).toString('base64')]];
  }),
);

const out = 'dist/droverstatus';
await build({
  entryPoints: ['server/src/index.ts'],
  outfile: out,
  bundle: true,
  platform: 'node',
  target: 'node26',
  format: 'esm',
  minify: true,
  legalComments: 'none',
  // only used when serving web/dist from disk
  external: ['@fastify/static'],
  define: { __WEB_ASSETS__: JSON.stringify(assets) },
  // CJS deps in an ESM bundle need require
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
chmodSync(out, 0o755);
console.log(`built ${out}`);
