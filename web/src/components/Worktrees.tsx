// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import type { Worktree } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

/** loaded on demand (the CLI runs git status per worktree), not on every refresh */
export function Worktrees({ hid }: { hid: string }) {
  const [list, setList] = useState<Worktree[]>();
  const [error, setError] = useState('');
  const load = () => api.worktrees(hid).then((w) => (setError(''), setList(w)), (e) => setError(errMsg(e)));
  useEffect(() => {
    setList(undefined);
    void load();
  }, [hid]);
  return (
    <section className="card-x" data-testid="worktrees">
      <h3><Icon n="overview" /> Worktrees <button className="btn btn-sm btn-outline theme-secondary" data-testid="worktrees-refresh" onClick={load}>Refresh</button></h3>
      {error && <p className="empty-note">{error}</p>}
      {list && list.length === 0 && <p className="empty-note">No worktrees</p>}
      {list && list.length > 0 && (
        <ul className="inbox">
          {list.map((w) => (
            <li key={w.path} data-testid="worktree-row" className="mono">{w.path} ({w.branch || 'detached'}) {w.dirty && <b className="badge theme-warning">dirty</b>}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
