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
      <button data-testid="new-drover-btn" onClick={p.onNew}>Ny drover</button>
      <label>
        <input type="checkbox" data-testid="show-closed" checked={p.showClosed} onChange={(e) => p.onShowClosed(e.target.checked)} />
        visa stängda
      </label>
      <ul>
        {list.map((c) => {
          const n = counts(c);
          return (
            <li key={c.hid} data-testid={`corral-item-${c.hid}`} aria-current={c.hid === p.selected}>
              <button onClick={() => p.onSelect(c.hid)}>
                <b>{c.slug}</b> <code>{c.hid}</code>{' '}
                <span data-testid={`badge-${c.hid}`} className={`badge ${badge(c)}`}>{badge(c)}</span>{' '}
                <span data-testid={`counts-${c.hid}`}>{n.busy}b {n.idle}i {n.blocked}!</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
