import { useLayoutEffect, useRef, useState } from 'react';
import type { Corral, Task } from '@droverstatus/shared';
import { badge, counts, nodeState } from '../util';
import type { BoardFilter } from '../route';
import { Icon, StateIcon } from './Icon';
import { StatusIcon } from './CorralList';

export const COLUMNS = [
  { state: 'todo', name: 'Backlog', icon: 'idle' },
  { state: 'in_progress', name: 'In progress', icon: 'busy' },
  { state: 'done', name: 'Done', icon: 'alive' },
  { state: 'failed', name: 'Failed', icon: 'dead' },
] as const;

export const columnOf = (t: Task) => (COLUMNS.some((c) => c.state === t.state) ? t.state : 'todo');

function useFlip(root: React.RefObject<HTMLElement>) {
  const prev = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const r = root.current;
    if (!r) return;
    const base = r.getBoundingClientRect();
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, { x: number; y: number }>();
    r.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const b = el.getBoundingClientRect();
      const pos = { x: b.left - base.left + r.scrollLeft, y: b.top - base.top + r.scrollTop };
      const old = prev.current.get(el.dataset.flip!);
      next.set(el.dataset.flip!, pos);
      if (old && !reduce && el.animate && (Math.abs(old.x - pos.x) > 1 || Math.abs(old.y - pos.y) > 1))
        el.animate([{ transform: `translate(${old.x - pos.x}px, ${old.y - pos.y}px)` }, { transform: 'none' }], { duration: 350, easing: 'ease' });
    });
    prev.current = next;
  });
}

function Card({ c, t, onOpen }: { c: Corral; t: Task; onOpen: (hid: string, owner?: string) => void }) {
  const agent = c.agents.find((a) => a.id === t.owner);
  const ownerState = agent ? nodeState(c, agent.status.state) : t.owner === 'drover' ? nodeState(c, c.drover.status.state) : undefined;
  const attempts = t.attempts ?? 0;
  return (
    <button className={`tcard ${attempts >= 3 ? 'hot' : ''}`} data-testid={`task-card-${c.hid}-${t.id}`} data-flip={`${c.hid}/${t.id}`} data-state={t.state} onClick={() => onOpen(c.hid, agent ? agent.id : undefined)}>
      <span className="tc-title">{t.title}</span>
      <span className="tc-meta">
        <code>{t.id}</code>
        {t.owner && <span className="tc-owner">{ownerState && <StatusIcon state={ownerState} id={`card-${c.hid}-${t.id}`} />}{t.owner}</span>}
      </span>
      <span className="tc-meta">
        <span className="mono muted" title="attempts">{attempts}×</span>
        {attempts >= 3 && <span data-testid={`card-attention-${c.hid}-${t.id}`} className="pill pill-blocked">ask user</span>}
        {t.acceptance.length > 0 && <span className="muted" title="acceptance criteria"><Icon n="tasks" /> {t.acceptance.length}</span>}
      </span>
      {t.depends_on.length > 0 && <span className="tc-meta">{t.depends_on.map((d) => <code key={d} className="chip-dep">{d}</code>)}</span>}
    </button>
  );
}

export function Board(p: {
  corrals: Corral[];
  filter: BoardFilter;
  onFilter: (f: BoardFilter) => void;
  onOpen: (hid: string, owner?: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [pop, setPop] = useState(false);
  useFlip(root);
  const { corrals: sel, closed } = p.filter;
  const visible = p.corrals.filter((c) => (closed || !c.closed || sel.includes(c.hid)) && (!sel.length || sel.includes(c.hid)));
  const setSel = (corrals: string[]) => p.onFilter({ ...p.filter, corrals });
  const toggleFold = (hid: string) => setFolded((f) => { const n = new Set(f); if (!n.delete(hid)) n.add(hid); return n; });
  return (
    <div className="board-wrap" data-testid="board">
      <div className="board-bar">
        <div className="popwrap">
          <button className="btn btn-sm btn-outline theme-secondary" data-testid="board-filter" aria-expanded={pop} aria-haspopup="true" onClick={() => setPop(!pop)}>
            <Icon n="search" /> Corrals: {sel.length ? `${sel.length} selected` : 'All'}
          </button>
          {pop && (
            <div className="popover-x" role="group" aria-label="Filter corrals" onKeyDown={(e) => e.key === 'Escape' && setPop(false)}>
              <label><input className="check" type="checkbox" data-testid="board-filter-all" checked={!sel.length} onChange={() => setSel([])} /> All</label>
              {p.corrals.filter((c) => closed || !c.closed || sel.includes(c.hid)).map((c) => (
                <label key={c.hid}>
                  <input className="check" type="checkbox" data-testid={`board-filter-${c.hid}`} checked={sel.includes(c.hid)} onChange={(e) => setSel(e.target.checked ? [...sel, c.hid] : sel.filter((h) => h !== c.hid))} />
                  <b>{c.slug}</b> <code>{c.hid}</code>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="chips">{sel.map((h) => <button key={h} className="chip-sel" onClick={() => setSel(sel.filter((x) => x !== h))} aria-label={`Remove filter ${h}`}>{p.corrals.find((c) => c.hid === h)?.slug ?? h} ×</button>)}</div>
        <label className="toggle spacer-l"><input className="check" type="checkbox" data-testid="board-show-closed" checked={closed} onChange={(e) => p.onFilter({ ...p.filter, closed: e.target.checked })} /> show closed</label>
      </div>
      <div className="board" ref={root}>
        {visible.length === 0 && <p className="empty-note" data-testid="board-empty">No corrals to show</p>}
        {visible.map((c) => {
          const n = counts(c);
          const fold = folded.has(c.hid);
          return (
            <section key={c.hid} className="lane" data-testid={`board-lane-${c.hid}`}>
              <header className="lane-head">
                <button className="caret" data-testid={`board-lane-toggle-${c.hid}`} aria-expanded={!fold} aria-label={`${fold ? 'Expand' : 'Collapse'} ${c.slug}`} onClick={() => toggleFold(c.hid)}><span className={fold ? '' : 'rot'}><Icon n="caret" /></span></button>
                <StatusIcon state={badge(c)} id={`lane-${c.hid}`} decorative />
                <b>{c.slug}</b> <code>{c.hid}</code>
                <span className={`pill pill-${badge(c)}`}><StateIcon state={badge(c)} />{badge(c)}</span>
                <span className="counts">{n.busy} busy · {n.idle} idle · {n.blocked} blocked</span>
                <span className="muted spacer-l">{c.tasks.length} task{c.tasks.length === 1 ? '' : 's'}</span>
              </header>
              {!fold && (
                <div className="cols">
                  {COLUMNS.map((col) => {
                    const ts = c.tasks.filter((t) => columnOf(t) === col.state);
                    return (
                      <div key={col.state} className="col-x" data-testid={`board-col-${c.hid}-${col.state}`}>
                        <h4><span className={`st st-${col.icon}`}><Icon n={col.icon} /></span> {col.name} <span className="muted">{ts.length}</span></h4>
                        {ts.length === 0 && <p className="empty-note small-note">No tasks</p>}
                        {ts.map((t) => <Card key={t.id} c={c} t={t} onOpen={p.onOpen} />)}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
