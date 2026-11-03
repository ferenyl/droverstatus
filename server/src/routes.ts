// SPDX-License-Identifier: GPL-3.0-only
import { existsSync, statSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, sep } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FLOWS, HID_RE, KEBAB_RE, MODELS, PERM_MODES, TRACKER_STEPS } from '@droverstatus/shared';
import type { ApiError, Corral, ServerEvent } from '@droverstatus/shared';
import type { CliResult, DroverCli } from './droverCli.js';
import { parseWorktrees } from './droverCli.js';
import { docsOf, parseMessages, tailLines } from './store.js';
import type { Store } from './store.js';

export interface Deps {
  store: Store;
  cli: DroverCli;
  root: string;
  /** optional allowlist for new-corral project dirs (empty = any existing dir) */
  projectRoots?: string[];
  maxSse?: number;
  /** registers `end` to close an event stream when its session ends; returns the unregister function */
  trackStream?: (req: FastifyRequest, end: () => void) => () => void;
}

const fail = (reply: FastifyReply, status: number, body: ApiError) => reply.code(status).send(body);
const cliFail = (reply: FastifyReply, r: CliResult) =>
  fail(reply, 500, { error: `drover.sh exited ${r.code}`, stderr: r.stderr, code: r.code });

const MAX_TEXT = 100_000;
const MAX_DOC = 1_000_000;
const DOC_EXT = /\.(md|markdown|html?|txt|log|json|jsonl|ya?ml|toml|csv|xml|ini|conf)$/i;
const MAX_IMAGE = 20_000_000;
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const imageType = (file: string) => IMAGE_TYPES[file.slice(file.lastIndexOf('.') + 1).toLowerCase()];
const SECRET_DIRS = new Set(['.ssh', '.gnupg', '.aws', '.kube', '.docker', '.password-store']);
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);

export function registerRoutes(app: FastifyInstance, { store, cli, root, projectRoots = [], maxSse = 50, trackStream }: Deps): void {
  /** one lifecycle action per key at a time; a second concurrent request gets 409 */
  const inflight = new Set<string>();
  const guarded = async <T>(key: string, reply: FastifyReply, fn: () => Promise<T>) => {
    if (inflight.has(key)) return fail(reply, 409, { error: 'action already in progress' });
    inflight.add(key);
    try {
      return await fn();
    } finally {
      inflight.delete(key);
    }
  };
  let sseClients = 0;
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

  const agentOr404 = (hid: string, id: string, reply: FastifyReply) => {
    const c = corralOr404(hid, reply);
    if (!c || badId(id, reply)) return;
    if (!c.agents.some((a) => a.id === id)) return void fail(reply, 404, { error: 'unknown agent' });
    return c;
  };
  const taskOr404 = (hid: string, tid: string, reply: FastifyReply) => {
    const c = corralOr404(hid, reply);
    if (!c) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tid)) return void fail(reply, 400, { error: 'bad task id' });
    if (!c.tasks.some((t) => t.id === tid)) return void fail(reply, 404, { error: 'unknown task' });
    return c;
  };
  const text = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined);

  app.get('/api/corrals', async () => store.list());

  app.get('/api/events', (req, reply) => {
    if (sseClients >= maxSse) return fail(reply, 503, { error: 'too many event streams' });
    sseClients++;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // nginx buffers proxied responses by default, which stalls the stream
      'x-accel-buffering': 'no',
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
    const untrack = trackStream?.(req, () => res.end());
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(ping);
      }
    }, 25_000);
    res.on('error', () => clearInterval(ping));
    res.on('close', () => clearInterval(ping));
    req.raw.on('close', () => {
      sseClients--;
      untrack?.();
      clearInterval(ping);
      store.off('updated', onUpdated).off('removed', onRemoved);
    });
  });

  app.post<{ Body: { slug?: string; dir?: string; brief?: string } }>('/api/corrals', async (req, reply) => {
    const { slug = '', dir = '', brief = '' } = req.body ?? {};
    if ([slug, dir, brief].some((v) => typeof v !== 'string')) return fail(reply, 400, { error: 'fields must be strings' });
    if (brief.length > MAX_TEXT) return fail(reply, 400, { error: 'brief too long' });
    if (!KEBAB_RE.test(slug)) return fail(reply, 400, { error: 'slug must be kebab-case' });
    if (!isAbsolute(dir) || !existsSync(dir) || !statSync(dir).isDirectory()) return fail(reply, 400, { error: 'project dir must be an existing absolute path' });
    if (projectRoots.length) {
      const real = await realpath(dir).catch(() => dir);
      if (!projectRoots.some((r) => inside(real, r))) return fail(reply, 403, { error: 'project dir outside allowed roots' });
    }
    const r = await cli.newDrover(slug, dir, brief);
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
    return guarded(c.hid, reply, async () => {
      const r = await cli.close(req.params.hid, w);
      if (r.code === 4) return fail(reply, 409, { error: 'worktrees exist', stderr: r.stderr, code: 4, worktrees: parseWorktrees(r.stdout) });
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.post<{ Params: { hid: string } }>('/api/corrals/:hid/revive', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c) return;
    if (c.closed || c.liveness === 'alive') return fail(reply, 409, { error: 'corral is closed or alive' });
    return guarded(c.hid, reply, async () => {
      const r = await cli.revive(c.hid);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.post<{ Params: { hid: string }; Body: { message?: string; to?: string } }>('/api/corrals/:hid/messages', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c) return;
    const message = req.body?.message?.trim();
    if (!message || typeof message !== 'string' || message.length > MAX_TEXT) return fail(reply, 400, { error: 'message required' });
    const to = req.body?.to ?? 'drover';
    if (to !== 'drover' && (typeof to !== 'string' || badId(to, reply) || !c.agents.some((a) => a.id === to))) return fail(reply, 404, { error: 'unknown agent' });
    const r = await cli.send(c.hid, message, to);
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.post<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/agents/:id/flush', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c || badId(req.params.id, reply)) return;
    if (!c.agents.some((a) => a.id === req.params.id)) return fail(reply, 404, { error: 'unknown agent' });
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.flush(c.hid, req.params.id);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.put<{ Params: { hid: string; id: string }; Body: { model?: string } }>('/api/corrals/:hid/agents/:id/model', async (req, reply) => {
    const c = agentOr404(req.params.hid, req.params.id, reply);
    if (!c) return;
    const model = req.body?.model;
    if (!(MODELS as unknown[]).includes(model)) return fail(reply, 400, { error: 'bad model' });
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.model(c.hid, req.params.id, model as string);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.put<{ Params: { hid: string; id: string }; Body: { mode?: string } }>('/api/corrals/:hid/agents/:id/perm', async (req, reply) => {
    const c = agentOr404(req.params.hid, req.params.id, reply);
    if (!c) return;
    const mode = req.body?.mode;
    if (!(PERM_MODES as readonly unknown[]).includes(mode)) return fail(reply, 400, { error: 'bad permission mode' });
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.perm(c.hid, req.params.id, mode as string);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.put<{ Params: { hid: string; id: string }; Body: { purpose?: string } }>('/api/corrals/:hid/agents/:id/purpose', async (req, reply) => {
    const c = agentOr404(req.params.hid, req.params.id, reply);
    if (!c) return;
    const purpose = text(req.body?.purpose);
    if (!purpose) return fail(reply, 400, { error: 'purpose required' });
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.purpose(c.hid, req.params.id, purpose);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.post<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/agents/:id/prlink', async (req, reply) => {
    const c = agentOr404(req.params.hid, req.params.id, reply);
    if (!c) return;
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.prlink(c.hid, req.params.id);
      if (!r.ok) return cliFail(reply, r);
      const url = r.stdout.trim().split('\n').pop() ?? '';
      return /^https:\/\//.test(url) ? { url } : fail(reply, 500, { error: 'no PR link in output', stderr: r.stdout });
    });
  });

  app.post<{ Params: { hid: string; tid: string }; Body: { scope?: string } }>('/api/corrals/:hid/tasks/:tid/approve', async (req, reply) => {
    const c = taskOr404(req.params.hid, req.params.tid, reply);
    if (!c) return;
    const scope = text(req.body?.scope, 2000);
    if (!scope) return fail(reply, 400, { error: 'scope required' });
    const r = await cli.approve(c.hid, req.params.tid, scope);
    return r.ok ? { ok: true } : cliFail(reply, r);
  });

  app.post<{ Params: { hid: string; tid: string }; Body: { agent?: string; fresh?: boolean } }>('/api/corrals/:hid/tasks/:tid/dispatch', async (req, reply) => {
    const c = taskOr404(req.params.hid, req.params.tid, reply);
    if (!c) return;
    const { agent, fresh } = req.body ?? {};
    if (agent !== undefined && (typeof agent !== 'string' || !c.agents.some((a) => a.id === agent))) return fail(reply, 404, { error: 'unknown agent' });
    if (fresh !== undefined && typeof fresh !== 'boolean') return fail(reply, 400, { error: 'fresh must be a boolean' });
    return guarded(`${c.hid}/task/${req.params.tid}`, reply, async () => {
      const r = await cli.dispatch(c.hid, req.params.tid, agent, fresh);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.put<{ Params: { hid: string }; Body: { name?: string; tracker?: string[]; story?: string } }>('/api/corrals/:hid/flow', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c) return;
    const { name, tracker, story } = req.body ?? {};
    // custom flows live in <project>/.drover/flows or ~/.claude/drover/flows; drover.sh validates them
    if (name !== undefined && (typeof name !== 'string' || !(FLOWS as readonly string[]).includes(name) && !KEBAB_RE.test(name))) return fail(reply, 400, { error: 'bad flow name' });
    if (tracker !== undefined && (!Array.isArray(tracker) || tracker.some((t) => !(TRACKER_STEPS as readonly unknown[]).includes(t)))) return fail(reply, 400, { error: 'bad tracker steps' });
    if (name === undefined && tracker === undefined) return fail(reply, 400, { error: 'name or tracker required' });
    if (story !== undefined && (typeof story !== 'string' || !c.stories.some((s) => s.id === story))) return fail(reply, 404, { error: 'unknown story' });
    return guarded(`${c.hid}/flow`, reply, async () => {
      const r = await cli.flow(c.hid, name, tracker, story);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
  });

  app.get<{ Params: { hid: string }; Querystring: { before?: string } }>('/api/corrals/:hid/messages', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    const before = Number(req.query.before);
    if (!Number.isInteger(before) || before < 0) return fail(reply, 400, { error: 'before must be a byte offset' });
    const t = await tailLines(join(root, req.params.hid, 'messages.log'), 200, before);
    return { messages: parseMessages(t.lines.join('\n')), offset: t.offset };
  });

  app.delete<{ Params: { hid: string; id: string }; Querystring: { reason?: string } }>('/api/corrals/:hid/agents/:id', async (req, reply) => {
    const c = corralOr404(req.params.hid, reply);
    if (!c || badId(req.params.id, reply)) return;
    if (!c.agents.some((a) => a.id === req.params.id)) return fail(reply, 404, { error: 'unknown agent' });
    const reason = req.query.reason === undefined ? undefined : text(req.query.reason, 2000);
    if (req.query.reason !== undefined && !reason) return fail(reply, 400, { error: 'bad reason' });
    return guarded(`${c.hid}/${req.params.id}`, reply, async () => {
      const r = await cli.kill(c.hid, req.params.id, reason);
      return r.ok ? { ok: true } : cliFail(reply, r);
    });
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

  /** `within`: the realpath of the file must stay inside this dir (symlink escape) */
  const md = async (file: string, reply: FastifyReply, within?: string) => {
    try {
      if (within && !inside(await realpath(file), await realpath(within))) return fail(reply, 404, { error: 'not found' });
      const st = await stat(file);
      if (!st.isFile()) return fail(reply, 404, { error: 'not found' });
      if (st.size > MAX_DOC) return fail(reply, 413, { error: 'doc too large' });
      return reply.type('text/markdown').header('x-content-type-options', 'nosniff').send(await readFile(file, 'utf8'));
    } catch {
      return fail(reply, 404, { error: 'not found' });
    }
  };

  app.get<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/stories/:id', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(req.params.id)) return fail(reply, 400, { error: 'bad story id' });
    return md(join(root, req.params.hid, 'stories', `${req.params.id}.md`), reply, join(root, req.params.hid));
  });

  // only files registered for the corral can be read
  app.get<{ Params: { hid: string }; Querystring: { path?: string } }>('/api/corrals/:hid/doc', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    const path = req.query.path;
    if (typeof path !== 'string' || !(await docsOf(join(root, req.params.hid))).some((d) => d.path === path)) return fail(reply, 404, { error: 'unknown doc' });
    // docs.json is agent-writable: only text/markdown/image files, resolved through symlinks, never secret dirs
    let real: string;
    try {
      real = await realpath(path);
    } catch {
      return fail(reply, 404, { error: 'not found' });
    }
    const image = imageType(real);
    if ((!DOC_EXT.test(real) && !image) || real.split(sep).some((p) => SECRET_DIRS.has(p))) return fail(reply, 404, { error: 'unknown doc' });
    if (!image) return md(real, reply);
    try {
      const st = await stat(real);
      if (!st.isFile()) return fail(reply, 404, { error: 'not found' });
      if (st.size > MAX_IMAGE) return fail(reply, 413, { error: 'doc too large' });
      const name = basename(real).replace(/[^\w.-]/g, '_');
      return reply.type(image).header('content-disposition', `inline; filename="${name}"`).send(await readFile(real));
    } catch {
      return fail(reply, 404, { error: 'not found' });
    }
  });

  app.get<{ Params: { hid: string } }>('/api/corrals/:hid/brief', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    return md(join(root, req.params.hid, 'brief.md'), reply, join(root, req.params.hid));
  });

  // on demand: runs git status per worktree
  app.get<{ Params: { hid: string } }>('/api/corrals/:hid/worktrees', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply)) return;
    const r = await cli.worktrees(req.params.hid);
    return r.ok ? parseWorktrees(r.stdout) : cliFail(reply, r);
  });

  app.get<{ Params: { hid: string; id: string } }>('/api/corrals/:hid/reports/:id', async (req, reply) => {
    if (!corralOr404(req.params.hid, reply) || badId(req.params.id, reply)) return;
    return md(join(root, req.params.hid, 'reports', `${req.params.id}.md`), reply, join(root, req.params.hid));
  });
}
