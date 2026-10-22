// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { attention, badge, counts, nodeState, type Node } from '../util';
import { Icon } from './Icon';

export function StatusIcon({ state, id, decorative }: { state: string; id: string; decorative?: boolean }) {
  return (
    <span
      data-testid={`status-${id}`}
      data-state={state}
      className={`dot dot-${state}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': state, title: state })}
    />
  );
}

export function CorralList(p: {
  corrals: Corral[];
  selected?: string;
  node?: Node;
  showClosed: boolean;
  onShowClosed: (v: boolean) => void;
  onSelect: (hid: string, node?: Node) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  useEffect(() => {
    if (p.selected) setOpen((o) => (o.has(p.selected!) ? o : new Set(o).add(p.selected!)));
  }, [p.selected]);
  const toggle = (hid: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (!n.delete(hid)) n.add(hid);
      return n;
    });
  const needle = q.trim().toLowerCase();
  const list = p.corrals.filter(
    (c) =>
      (p.showClosed || !c.closed) &&
      (!needle || [c.slug, c.hid, ...c.agents.map((a) => a.id)].some((s) => s.toLowerCase().includes(needle))),
  );
  return (
    <nav data-testid="corral-list" aria-label="Corrals" className="sidebar-nav">
      <div className="side-tools">
        <label className="search">
          <Icon n="search" />
          <input type="search" data-testid="tree-filter" aria-label="Filter corrals" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="toggle">
          <input className="check" type="checkbox" data-testid="show-closed" checked={p.showClosed} onChange={(e) => p.onShowClosed(e.target.checked)} />
          show closed
        </label>
      </div>
      {list.length === 0 && <p className="empty-note" data-testid="tree-empty">No corrals{needle ? ' match' : ''}</p>}
      <ul className="tree">
        {list.map((c) => {
          const n = counts(c);
          const expanded = open.has(c.hid);
          const on = c.hid === p.selected && !p.node;
          return (
            <li key={c.hid} data-testid={`tree-corral-${c.hid}`}>
              <div className="trow corral">
                <button className="caret" data-testid={`tree-toggle-${c.hid}`} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${c.slug}`} aria-expanded={expanded} aria-controls={`tree-children-${c.hid}`} onClick={() => toggle(c.hid)}>
                  <span className={expanded ? 'rot' : ''}><Icon n="caret" /></span>
                </button>
                <button className={`label ${on ? 'on' : ''}`} data-testid={`corral-item-${c.hid}`} aria-current={on ? 'true' : undefined} onClick={() => { p.onSelect(c.hid); setOpen((o) => new Set(o).add(c.hid)); }}>
                  <StatusIcon state={badge(c)} id={`corral-${c.hid}`} decorative />
                  <b className="name">{c.slug}</b>
                  <code className="hid">{c.hid}</code>
                  <span data-testid={`badge-${c.hid}`} className={`pill pill-${badge(c)}`}>{badge(c)}</span>
                  {attention(c).count > 0 && <span data-testid={`attention-${c.hid}`} className="pill pill-blocked" title={attention(c).reasons.join(', ')}>{attention(c).count}</span>}
                  {c.closing && !c.closed && <span data-testid={`closing-${c.hid}`} className="pill pill-blocked">closing…</span>}
                  <span data-testid={`counts-${c.hid}`} className="counts">
                    <i className="c-busy">{n.busy} busy</i> · <i className="c-idle">{n.idle} idle</i> · <i className="c-blocked">{n.blocked} blocked</i>
                  </span>
                </button>
              </div>
              {expanded && (
                <ul id={`tree-children-${c.hid}`} className="tree kids">
                  <li>
                    <button className={`trow label kid ${c.hid === p.selected && p.node?.kind === 'drover' ? 'on' : ''}`} data-testid={`tree-drover-${c.hid}`} aria-current={c.hid === p.selected && p.node?.kind === 'drover' ? 'true' : undefined} onClick={() => p.onSelect(c.hid, { kind: 'drover' })}>
                      <StatusIcon state={nodeState(c, c.drover.status.state)} id={`drover-${c.hid}`} />drover
                    </button>
                  </li>
                  {c.agents.map((a) => {
                    const sel = c.hid === p.selected && p.node?.kind === 'agent' && p.node.id === a.id;
                    return (
                      <li key={a.id}>
                        <button className={`trow label kid ${sel ? 'on' : ''}`} data-testid={`tree-agent-${c.hid}-${a.id}`} aria-current={sel ? 'true' : undefined} onClick={() => p.onSelect(c.hid, { kind: 'agent', id: a.id })}>
                          <StatusIcon state={nodeState(c, a.status.state)} id={`agent-${c.hid}-${a.id}`} />{a.id}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
