// SPDX-License-Identifier: GPL-3.0-only
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const bind = process.env.BIND_ADDR || '127.0.0.1';
const wildcard = bind === '0.0.0.0' || bind === '::';
const target = wildcard ? '127.0.0.1' : bind;

export default defineConfig({
  plugins: [react()],
  server: {
    host: bind,
    port: Number(process.env.WEB_PORT ?? 5187),
    strictPort: true,
    proxy: { '/api': `http://${target.includes(':') ? `[${target}]` : target}:${process.env.PORT ?? 4177}` },
  },
});
