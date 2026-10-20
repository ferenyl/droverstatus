import { useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { badge, counts, type Node } from '../util';

const GLYPH: Record<string, { ch: string; cls: string }> = {
  busy: { ch: '◐', cls: 'text-primary' },
  idle: { ch: '○', cls: 'text-success' },
  blocked: { ch: '▲', cls: 'text-warning' },
  dead: { ch: '✕', cls: 'text-danger' },
  closed: { ch: '■', cls: 'text-secondary' },
  alive: { ch: '●', cls: 'text-success' },
  unknown: { ch: '?', cls: 'text-secondary' },
};

export function StatusIcon({ state, id }: { state: string; id: string }) {
  const g = GLYPH[state] ?? GLYPH.unknown;
  return <span data-testid={`status-${id}`} data-state={state} className={`${g.cls} me-1`} role="img" aria-label={state} title={state}>{g.ch}</span>;
}

const nodeState = (c: Corral, state: string) => (c.closed ? 'closed' : c.liveness === 'dead' ? 'dead' : state);

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
  const row = (active: boolean) => `btn btn-sm w-100 text-start rounded-0 ${active ? 'active' : ''}`;
  return (
    <nav data-testid="corral-list">
      <button className="btn btn-primary w-100 mb-2" data-testid="new-drover-btn" onClick={p.onNew}>New drover</button>
      <label className="form-check mb-2">
        <input className="form-check-input" type="checkbox" data-testid="show-closed" checked={p.showClosed} onChange={(e) => p.onShowClosed(e.target.checked)} />
        <span className="form-check-label">show closed</span>
      </label>
      <ul className="list-group" role="tree">
        {list.map((c) => {
          const n = counts(c);
          const expanded = open.has(c.hid);
          const sel = c.hid === p.selected;
          return (
            <li key={c.hid} data-testid={`tree-corral-${c.hid}`} className="list-group-item p-0" role="treeitem" aria-expanded={expanded}>
              <div className="d-flex">
                <button className="btn btn-sm" data-testid={`tree-toggle-${c.hid}`} aria-label={expanded ? 'Collapse' : 'Expand'} onClick={() => toggle(c.hid)}>{expanded ? '▾' : '▸'}</button>
                <div className="flex-grow-1" data-testid={`corral-item-${c.hid}`} aria-current={sel && !p.node}>
                  <button className={row(sel && !p.node)} onClick={() => { p.onSelect(c.hid); setOpen((o) => new Set(o).add(c.hid)); }}>
                    <StatusIcon state={badge(c)} id={`corral-${c.hid}`} />
                    <b>{c.slug}</b> <code>{c.hid}</code>{' '}
                    <span data-testid={`badge-${c.hid}`} className={`badge ${badge(c) === 'alive' ? 'text-bg-success' : badge(c) === 'dead' ? 'text-bg-danger' : 'text-bg-secondary'}`}>{badge(c)}</span>{' '}
                    <span data-testid={`counts-${c.hid}`} className="small">{n.busy} busy · {n.idle} idle · {n.blocked} blocked</span>
                  </button>
                </div>
              </div>
              {expanded && (
                <ul className="list-unstyled ms-4 mb-0" role="group">
                  <li>
                    <button className={row(sel && p.node?.kind === 'drover')} data-testid={`tree-drover-${c.hid}`} onClick={() => p.onSelect(c.hid, { kind: 'drover' })}>
                      <StatusIcon state={nodeState(c, c.drover.status.state)} id={`drover-${c.hid}`} />drover
                    </button>
                  </li>
                  {c.agents.map((a) => (
                    <li key={a.id}>
                      <button className={row(sel && p.node?.kind === 'agent' && p.node.id === a.id)} data-testid={`tree-agent-${c.hid}-${a.id}`} onClick={() => p.onSelect(c.hid, { kind: 'agent', id: a.id })}>
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
