// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { HID_RE, KEBAB_RE, MODELS } from '@droverstatus/shared';
import type { ApiError, Corral, ServerEvent } from '@droverstatus/shared';
import type { CliResult, DroverCli } from './droverCli.js';
import { parseWorktrees } from './droverCli.js';
import type { Store } from './store.js';

export interface Deps {
  store: Store;
  cli: DroverCli;
  root: string;
}

const fail = (reply: FastifyReply, status: number, body: ApiError) => reply.code(status).send(body);
const cliFail = (reply: FastifyReply, r: CliResult) =>
  fail(reply, 500, { error: `drover.sh exited ${r.code}`, stderr: r.stderr, code: r.code });

const MAX_TEXT = 100_000;

export function registerRoutes(app: FastifyInstance, { store, cli, root }: Deps): void {
  const corralOr404 = (hid: string, reply: FastifyReply) => {
    if (!HID_RE.test(hid)) return void fail(reply, 400, { error: 'bad hid' });
    const c = store.get(hid);
    if (!c) return void fail(reply, 404, { error: 'unknown corral' });
    return c;
  };
  const badId = (id: string, reply: FastifyReply) => {
    if (KEBAB_RE.test(id)) return false;
    fail(reply, 400, { error: 'bad agent id' });
    return true;
  };

  app.get('/api/corrals', async () => store.list());

  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.flushHeaders();
    const send = (e: ServerEvent) => {
      try {
        res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
      } catch {}
    };
    send({ type: 'snapshot', corrals: store.list() });
    const onUpdated = (hid: string, corral: Corral) => send({ type: 'corral-updated', hid, corral });
    const onRemoved = (hid: string) => send({ type: 'corral-removed', hid });
    store.on('updated', onUpdated).on('removed', onRemoved);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('error', () => clearInterval(ping));
    req.raw.on('close', () => {
      clearInterval(ping);
      store.off('updated', onUpdated).off('removed', onRemoved);
    });
  });

  app.post<{ Body: { slug?: string; dir?: string; model?: string; brief?: string } }>('/api/corrals', async (req, reply) => {
    const { slug = '', dir = '', model = 'sonnet', brief = '' } = req.body ?? {};
    if ([slug, dir, model, brief].some((v) => typeof v !== 'string')) return fail(reply, 400, { error: 'fields must be strings' });
    if (brief.length > MAX_TEXT) return fail(reply, 400, { error: 'brief too long' });
    if (!KEBAB_RE.test(slug)) return fail(reply, 400, { error: 'slug must be kebab-case' });
    if (!(MODELS as string[]).includes(model)) return fail(reply, 400, { error: 'bad model' });
    if (!isAbsolute(dir) || !existsSync(dir) || !statSync(dir).isDirectory()) return fail(reply, 400, { error: 'project dir must be an existing absolute path' });
    const r = await cli.newDrover(slug, dir, model, brief);
    if (!r.ok) return cliFail(reply, r);
    if (!r.hid) return fail(reply, 500, { error: 'no HID in output', stderr: r.stdout });
    return reply.code(201).send({ hid: r.hid });
  });

  app.delete<{ Params: { hid: string }; Querystring: { worktrees?: string } }>('/api/corrals/:hid', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c) return;
    if (c.closed) return fail(reply, 409, { error: 'corral already closed' });
    const w = req.query.worktrees;
    if (w !== undefined && w !== 'remove' && w !== 'keep') return fail(reply, 400, { error: 'worktrees must be remove|keep' });
    const r = await cli.close(req.params.hid, w);
    if (r.code === 4) return fail(reply, 409, { error: 'worktrees exist', stderr: r.stderr, code: 4, worktrees: parseWorktrees(r.stdout) });
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.post<{ Params: { hid: string } }>('/api/corrals/:hid/revive', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c) return;
    if (c.closed || c.liveness === 'alive') return fail(reply, 409, { error: 'corral is closed or alive' });
    const r = await cli.revive(c.hid);
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.post<{ Params: { hid: string }; Body: { message?: string } }>('/api/corrals/:hid/messages', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    const message = req.body?.message?.trim();
    if (!message || typeof message !== 'string' || message.length > MAX_TEXT) return fail(reply, 400, { error: 'message required' });
    const r = await cli.send(req.params.hid, message);
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.delete<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/agents/:id', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c || badId(req.params.id, reply)) return;
    if (!c.agents.some((a) => a.id === req.params.id)) return fail(reply, 404, { error: 'unknown agent' });
    const r = await cli.kill(c.hid, req.params.id);
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.get<{ Params: { hid: string; id: string }; Querystring: { lines?: string } }>(
    '/api/corrals/:hid/agents/:id/screen',
    async (req, reply) => {
      const c = corralOr404(req.params.hid, reply);
      if (!c || badId(req.params.id, reply)) return;
      const lines = Math.min(Math.max(Number(req.query.lines ?? 40) || 40, 1), 500);
      const r = await cli.read(c.hid, req.params.id, lines);
      return r.ok ? { screen: r.stdout } : cliFail(reply, r);
    },
  );

  app.get<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/reports/:id', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply) || badId(req.params.id, reply)) return;
    try {
      const md = await readFile(join(root, req.params.hid, 'reports', `${req.params.id}.md`), 'utf8');
      return reply.type('text/markdown').send(md);
    } catch {
      return fail(reply, 404, { error: 'no report' });
    }
  });
}
