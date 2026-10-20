// SPDX-License-Identifier: GPL-3.0-only
import { Icon } from './Icon';

export function Tabs<T extends string>(p: { tabs: { id: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {p.tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === p.active} data-testid={`tab-${t.id}`} className={`tab ${t.id === p.active ? 'on' : ''}`} onClick={() => p.onChange(t.id)}>
          <span className={`ti ti-${t.id}`}><Icon n={t.id as never} /></span> {t.label}
        </button>
      ))}
    </div>
  );
}
