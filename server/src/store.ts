// SPDX-License-Identifier: GPL-3.0-only
import { EventEmitter } from 'node:events';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HID_RE } from '@droverstatus/shared';
import type { Agent, AgentStatus, Corral, Liveness, DocEntry, Message, ReportMeta, Story, StoryMode, Task } from '@droverstatus/shared';

async function stamp(file: string): Promise<string | undefined> {
  try {
    const st = await stat(file, { bigint: true });
    return `${st.mtimeNs}:${st.size}`;
  } catch {
    return undefined;
  }
}

const jsonCache = new Map<string, { key: string; val: unknown }>();

/** re-read only when mtime/size changed; a parse failure (torn write) keeps the last good value, a missing file clears it */
async function json<T>(file: string): Promise<T | undefined> {
  const key = await stamp(file);
  const hit = jsonCache.get(file);
  if (!key) {
    jsonCache.delete(file);
    return undefined;
  }
  if (hit?.key === key) return hit.val as T;
  try {
    const val = JSON.parse(await readFile(file, 'utf8')) as T;
    jsonCache.set(file, { key, val });
    return val;
  } catch {
    return hit?.val as T | undefined;
  }
}

const TAIL_CAP = 200;
const TAIL_WINDOW = 256 * 1024;

export interface Tail {
  lines: string[];
  /** non-empty line count of the whole file */
  total: number;
  /** byte offset where `lines` starts (0 = nothing older) */
  offset: number;
}

const tailCache = new Map<string, { key: string; size: number; total: number; tail: Tail }>();

/** last `cap` lines of a log ending before byte `end`; only the tail window is read, the line total is counted incrementally */
export async function tailLines(file: string, cap = TAIL_CAP, end?: number): Promise<Tail> {
  const empty: Tail = { lines: [], total: 0, offset: 0 };
  const key = await stamp(file);
  if (!key) {
    tailCache.delete(file);
    return empty;
  }
  const hit = tailCache.get(file);
  if (end === undefined && hit?.key === key) return hit.tail;
  let fh;
  try {
    fh = await open(file, 'r');
    const size = (await fh.stat()).size;
    let total = 0;
    if (end === undefined) {
      let from = hit && size >= hit.size ? hit.size : 0;
      total = hit && size >= hit.size ? hit.total : 0;
      const buf = Buffer.alloc(64 * 1024);
      while (from < size) {
        const { bytesRead } = await fh.read(buf, 0, buf.length, from);
        if (!bytesRead) break;
        for (let i = 0; i < bytesRead; i++) if (buf[i] === 10) total++;
        from += bytesRead;
      }
    }
    const stop = Math.min(end ?? size, size);
    const start = Math.max(0, stop - TAIL_WINDOW);
    const buf = Buffer.alloc(stop - start);
    await fh.read(buf, 0, buf.length, start);
    let chunk = buf;
    let offset = start;
    if (start > 0) {
      const nl = chunk.indexOf(10);
      chunk = nl < 0 ? Buffer.alloc(0) : chunk.subarray(nl + 1);
      offset = start + (nl < 0 ? chunk.length : nl + 1);
    }
    // the last element is '' or an unterminated line that is still being written
    const complete = chunk.toString('utf8').split('\n').slice(0, -1);
    const dropped = complete.slice(0, Math.max(0, complete.length - cap));
    if (dropped.length) offset += Buffer.byteLength(dropped.join('\n') + '\n');
    const kept = complete.slice(dropped.length).filter(Boolean);
    const tail: Tail = { lines: kept, total, offset };
    if (end === undefined) tailCache.set(file, { key, size, total, tail });
    return tail;
  } catch {
    return empty;
  } finally {
    await fh?.close();
  }
}

/** `task set k=v` stores strings; tolerate missing/odd fields */
function normTask(t: Partial<Task>): Task {
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return { ...t, id: String(t.id ?? ''), title: String(t.title ?? ''), acceptance: list(t.acceptance), depends_on: list(t.depends_on), state: String(t.state ?? 'todo'), attempts: Number(t.attempts) || 0, story: t.story == null ? undefined : String(t.story), kind: t.kind == null ? undefined : String(t.kind) };
}

function normStory(s: Partial<Story>): Story {
  return { ...s, id: String(s.id ?? ''), title: String(s.title ?? ''), status: String(s.status ?? 'backlog') };
}

const byOrder = (a: Story, b: Story) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id, undefined, { numeric: true });

export function parseMessages(log: string): Message[] {
  const out: Message[] = [];
  for (const line of log.split('\n')) {
    const m = /^(\S+) \[(.+?) -> (.+?)\] ?(.*)$/.exec(line);
    if (m) out.push({ at: m[1], from: m[2], to: m[3], text: m[4] });
  }
  return out;
}

function toStatus(raw: Partial<AgentStatus> | undefined): AgentStatus {
  const s = raw?.state;
  const state = s === 'busy' || s === 'idle' || s === 'blocked' ? s : 'unknown';
  return { ...raw, state };
}

async function names(dir: string, ext: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();
  } catch {
    return [];
  }
}

/** report names (.md) newest first; reports/<id>.json supplies status/summary/at where the skill writes it */
async function reports(dir: string): Promise<{ reports: string[]; report_meta: Record<string, ReportMeta> }> {
  const ids = await names(join(dir, 'reports'), '.md');
  const report_meta: Record<string, ReportMeta> = {};
  for (const id of ids) {
    const m = await json<ReportMeta>(join(dir, 'reports', `${id}.json`));
    if (m && typeof m === 'object') report_meta[id] = { task: m.task, status: m.status, summary: m.summary, at: m.at };
  }
  const at = (id: string) => report_meta[id]?.at ?? '';
  return { reports: ids.sort((a, b) => at(b).localeCompare(at(a)) || a.localeCompare(b)), report_meta };
}

/** docs.json (drover >= 0.11) plus the corral's brief.md/plan.md when present */
export async function docsOf(dir: string): Promise<DocEntry[]> {
  const out: DocEntry[] = [];
  for (const f of ['brief.md', 'plan.md']) if (await stamp(join(dir, f))) out.push({ path: join(dir, f), note: f.slice(0, -3) });
  const list = await json<Partial<DocEntry>[]>(join(dir, 'docs.json'));
  if (Array.isArray(list))
    for (const d of list)
      if (d && typeof d.path === 'string' && d.path.startsWith('/'))
        out.push({ path: d.path, note: String(d.note ?? ''), agent: d.agent ? String(d.agent) : undefined, added_at: d.added_at });
  return out;
}

/** Builds a corral from files; null if registry.json is missing/unreadable. Tolerates missing or half-written files. */
interface RawAgent {
  model?: string;
  tab_name?: string;
  tab_id?: number;
  pane_id?: string;
  purpose?: string;
  cwd?: string;
  worktree?: string | null;
  story?: string | null;
  claude_session_id?: string;
  created?: string;
}

interface RawRegistry {
  session?: string;
  project?: string;
  slug?: string;
  closed?: boolean;
  closing_at?: number;
  agents?: Record<string, RawAgent | undefined>;
  drover?: { mode?: string; model?: string; session_id?: string; tab_id?: number };
  story_mode?: StoryMode;
  schema?: number;
  drover_version?: string;
}

export async function buildCorral(root: string, hid: string, liveness: Liveness): Promise<Corral | null> {
  const dir = join(root, hid);
  const reg = await json<RawRegistry>(join(dir, 'registry.json'));
  if (!reg || typeof reg !== 'object') return null;
  const status = async (id: string) => toStatus(await json<AgentStatus>(join(dir, 'status', `${id}.json`)));
  const agents: Agent[] = await Promise.all(
    Object.entries(reg.agents ?? {}).map(async ([id, a]) => ({
      id,
      model: a?.model,
      tab_name: a?.tab_name,
      tab_id: a?.tab_id,
      pane_id: a?.pane_id,
      purpose: a?.purpose,
      cwd: a?.cwd,
      worktree: a?.worktree,
      story: a?.story ?? undefined,
      session_id: a?.claude_session_id,
      created: a?.created,
      queued: (await tailLines(join(dir, 'queue', `${id}.txt`), 1)).total || undefined,
      status: await status(id),
    })),
  );
  const tasks = await json<Task[]>(join(dir, 'tasks.json'));
  const stories = await json<Story[]>(join(dir, 'stories.json'));
  // closed corrals are history: skip the logs
  const inbox = reg.closed === true ? undefined : await tailLines(join(dir, 'inbox', 'drover.log'));
  const messages = reg.closed === true ? undefined : await tailLines(join(dir, 'messages.log'));
  return {
    hid,
    session: reg.session ?? '',
    project: reg.project ?? '',
    slug: reg.slug ?? '',
    closed: reg.closed === true,
    closing: reg.closed !== true && reg.closing_at != null,
    liveness,
    drover: {
      mode: reg.drover?.mode,
      model: reg.drover?.model,
      session_id: reg.drover?.session_id,
      tab_id: reg.drover?.tab_id,
      status: await status('drover'),
    },
    agents,
    tasks: Array.isArray(tasks) ? tasks.filter((t) => t && typeof t === 'object').map(normTask) : [],
    stories: Array.isArray(stories) ? stories.filter((s) => s && typeof s === 'object').map(normStory).sort(byOrder) : [],
    story_mode: reg.story_mode && typeof reg.story_mode === 'object' ? reg.story_mode : undefined,
    messages: parseMessages(messages?.lines.join('\n') ?? ''),
    messages_total: messages?.total ?? 0,
    messages_offset: messages?.offset ?? 0,
    inbox: inbox?.lines ?? [],
    ...(await reports(dir)),
    docs: await docsOf(dir),
    schema: typeof reg.schema === 'number' ? reg.schema : undefined,
    drover_version: typeof reg.drover_version === 'string' ? reg.drover_version : undefined,
  };
}

export class Store extends EventEmitter {
  private corrals = new Map<string, Corral>();
  /** session name -> alive; undefined = unknown */
  private sessions: Map<string, boolean> | undefined;

  constructor(private root: string) {
    super();
  }

  list(): Corral[] {
    return [...this.corrals.values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.hid.localeCompare(b.hid));
  }

  get(hid: string): Corral | undefined {
    return this.corrals.get(hid);
  }

  private liveness(session: string): Liveness {
    if (!this.sessions) return 'unknown';
    return this.sessions.get(session) ? 'alive' : 'dead';
  }

  async scan(): Promise<void> {
    let ents: string[] = [];
    try {
      ents = await readdir(this.root);
    } catch {}
    const hids = ents.filter((e) => HID_RE.test(e));
    await Promise.all(hids.map((h) => this.refresh(h, false)));
    for (const h of this.corrals.keys()) if (!hids.includes(h)) this.remove(h);
  }

  private pending = new Map<string, Promise<void>>();

  /** serialized per hid so a slow older build can't overwrite a newer one */
  refresh(hid: string, emit = true): Promise<void> {
    const run = (this.pending.get(hid) ?? Promise.resolve()).then(() => this.doRefresh(hid, emit));
    this.pending.set(hid, run);
    void run.finally(() => this.pending.get(hid) === run && this.pending.delete(hid));
    return run;
  }

  private async doRefresh(hid: string, emit: boolean): Promise<void> {
    const prev = this.corrals.get(hid);
    const next = await buildCorral(this.root, hid, prev ? prev.liveness : 'unknown');
    if (!next) {
      if (prev) this.remove(hid);
      return;
    }
    next.liveness = this.liveness(next.session);
    this.corrals.set(hid, next);
    if (emit && JSON.stringify(prev) !== JSON.stringify(next)) this.emit('updated', hid, next);
  }

  remove(hid: string): void {
    if (this.corrals.delete(hid)) this.emit('removed', hid);
  }

  /** undefined = zellij unreachable */
  setSessions(sessions: Map<string, boolean> | undefined): void {
    this.sessions = sessions;
    for (const [hid, c] of this.corrals) {
      const liveness = this.liveness(c.session);
      if (liveness !== c.liveness) {
        const next = { ...c, liveness };
        this.corrals.set(hid, next);
        this.emit('updated', hid, next);
      }
    }
  }

}
