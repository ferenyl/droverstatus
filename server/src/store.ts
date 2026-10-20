import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HID_RE } from '@droverstatus/shared';
import type { Agent, AgentStatus, Corral, Liveness, Message, Task } from '@droverstatus/shared';

async function text(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

async function json<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

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

/** Builds a corral from files; null if registry.json is missing/unreadable. Tolerates missing or half-written files. */
interface RawAgent {
  model?: string;
  tab_name?: string;
  tab_id?: number;
  pane_id?: string;
  purpose?: string;
  cwd?: string;
}

interface RawRegistry {
  session?: string;
  project?: string;
  slug?: string;
  closed?: boolean;
  agents?: Record<string, RawAgent | undefined>;
  drover?: { mode?: string; model?: string; session_id?: string; tab_id?: number };
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
      status: await status(id),
    })),
  );
  const tasks = await json<Task[]>(join(dir, 'tasks.json'));
  const inbox = (await text(join(dir, 'inbox', 'drover.log'))).split('\n').filter(Boolean);
  return {
    hid,
    session: reg.session ?? '',
    project: reg.project ?? '',
    slug: reg.slug ?? '',
    closed: reg.closed === true,
    liveness,
    drover: {
      mode: reg.drover?.mode,
      model: reg.drover?.model,
      session_id: reg.drover?.session_id,
      tab_id: reg.drover?.tab_id,
      status: await status('drover'),
    },
    agents,
    tasks: Array.isArray(tasks) ? tasks : [],
    messages: parseMessages(await text(join(dir, 'messages.log'))),
    inbox,
    reports: await names(join(dir, 'reports'), '.md'),
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
