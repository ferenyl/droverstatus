import { useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { badge, counts, nodeState, type Node } from '../util';

const GLYPH: Record<string, { ch: string; cls: string }> = {
  busy: { ch: '◐', cls: 'text-primary' },
  idle: { ch: '○', cls: 'text-success' },
  blocked: { ch: '▲', cls: 'text-warning' },
  dead: { ch: '✕', cls: 'text-danger' },
  closed: { ch: '■', cls: 'text-secondary' },
  alive: { ch: '●', cls: 'text-success' },
  unknown: { ch: '?', cls: 'text-secondary' },
};

export function StatusIcon({ state, id, decorative }: { state: string; id: string; decorative?: boolean }) {
  const g = GLYPH[state] ?? GLYPH.unknown;
  return <span data-testid={`status-${id}`} data-state={state} className={`${g.cls} me-1`} {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': state, title: state })}>{g.ch}</span>;
}

export function CorralList(p: {
  corrals: Corral[];
  selected?: string;
  node?: Node;
  showClosed: boolean;
  onShowClosed: (v: boolean) => void;
  onSelect: (hid: string, node?: Node) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (hid: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (!n.delete(hid)) n.add(hid);
      return n;
    });
  const list = p.corrals.filter((c) => p.showClosed || !c.closed);
  const row = (active: boolean) => `btn btn-sm tree-row ${active ? 'active' : ''}`;
  return (
    <nav data-testid="corral-list" aria-label="Corrals">
      <button className="btn btn-solid theme-primary w-100 mb-2" data-testid="new-drover-btn" onClick={p.onNew}>New drover</button>
      <label className="d-flex align-items-center gap-2 mb-2">
        <input className="check" type="checkbox" data-testid="show-closed" checked={p.showClosed} onChange={(e) => p.onShowClosed(e.target.checked)} />
        show closed
      </label>
      <ul className="list-group tree">
        {list.map((c) => {
          const n = counts(c);
          const expanded = open.has(c.hid);
          const sel = c.hid === p.selected;
          return (
            <li key={c.hid} data-testid={`tree-corral-${c.hid}`} className="list-group-item p-0">
              <div className="d-flex">
                <button className="btn btn-sm" data-testid={`tree-toggle-${c.hid}`} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${c.slug}`} aria-expanded={expanded} aria-controls={`tree-children-${c.hid}`} onClick={() => toggle(c.hid)}>{expanded ? '▾' : '▸'}</button>
                <div className="flex-grow-1 min-w-0">
                  <button className={row(sel && !p.node)} data-testid={`corral-item-${c.hid}`} aria-current={sel && !p.node ? 'true' : undefined} onClick={() => { p.onSelect(c.hid); setOpen((o) => new Set(o).add(c.hid)); }}>
                    <StatusIcon state={badge(c)} id={`corral-${c.hid}`} decorative />
                    <b>{c.slug}</b> <code>{c.hid}</code>{' '}
                    <span data-testid={`badge-${c.hid}`} className={`badge ${badge(c) === 'alive' ? 'theme-success' : badge(c) === 'dead' ? 'theme-danger' : 'theme-secondary'}`}>{badge(c)}</span>{' '}
                    <span data-testid={`counts-${c.hid}`} className="small d-block">{n.busy} busy · {n.idle} idle · {n.blocked} blocked</span>
                  </button>
                </div>
              </div>
              {expanded && (
                <ul id={`tree-children-${c.hid}`} className="list-unstyled ms-4 mb-0">
                  <li>
                    <button className={row(sel && p.node?.kind === 'drover')} data-testid={`tree-drover-${c.hid}`} aria-current={sel && p.node?.kind === 'drover' ? 'true' : undefined} onClick={() => p.onSelect(c.hid, { kind: 'drover' })}>
                      <StatusIcon state={nodeState(c, c.drover.status.state)} id={`drover-${c.hid}`} />drover
                    </button>
                  </li>
                  {c.agents.map((a) => (
                    <li key={a.id}>
                      <button className={row(sel && p.node?.kind === 'agent' && p.node.id === a.id)} data-testid={`tree-agent-${c.hid}-${a.id}`} aria-current={sel && p.node?.kind === 'agent' && p.node.id === a.id ? 'true' : undefined} onClick={() => p.onSelect(c.hid, { kind: 'agent', id: a.id })}>
                        <StatusIcon state={nodeState(c, a.status.state)} id={`agent-${c.hid}-${a.id}`} />{a.id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
