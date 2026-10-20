import type { Corral } from '@droverstatus/shared';
import { badge, counts } from '../util';

export function CorralList(p: {
  corrals: Corral[];
  selected?: string;
  showClosed: boolean;
  onShowClosed: (v: boolean) => void;
  onSelect: (hid: string) => void;
  onNew: () => void;
}) {
  const list = p.corrals.filter((c) => p.showClosed || !c.closed);
  return (
    <nav data-testid="corral-list">
      <button className="btn btn-primary w-100 mb-2" data-testid="new-drover-btn" onClick={p.onNew}>New drover</button>
      <label className="form-check mb-2">
        <input className="form-check-input" type="checkbox" data-testid="show-closed" checked={p.showClosed} onChange={(e) => p.onShowClosed(e.target.checked)} />
        <span className="form-check-label">show closed</span>
      </label>
      <ul className="list-group">
        {list.map((c) => {
          const n = counts(c);
          return (
            <li key={c.hid} data-testid={`corral-item-${c.hid}`} aria-current={c.hid === p.selected} className="list-group-item p-0">
              <button className={`btn w-100 text-start rounded-0 ${c.hid === p.selected ? 'active' : ''}`} onClick={() => p.onSelect(c.hid)}>
                <b>{c.slug}</b> <code>{c.hid}</code>{' '}
                <span data-testid={`badge-${c.hid}`} className={`badge ${badge(c) === 'alive' ? 'text-bg-success' : badge(c) === 'dead' ? 'text-bg-danger' : 'text-bg-secondary'}`}>{badge(c)}</span>{' '}
                <span data-testid={`counts-${c.hid}`}>{n.busy} busy · {n.idle} idle · {n.blocked} blocked</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
