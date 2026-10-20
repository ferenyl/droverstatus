import { useState } from 'react';
import type { Worktree } from '@droverstatus/shared';
import { api, ApiFail } from '../api';
import { errMsg } from '../util';

export function CloseDialog({ hid, onClose }: { hid: string; onClose: () => void }) {
  const [worktrees, setWorktrees] = useState<Worktree[]>();
  const [error, setError] = useState('');
  const run = async (w?: 'remove' | 'keep') => {
    setError('');
    try {
      await api.close(hid, w);
      onClose();
    } catch (err) {
      if (err instanceof ApiFail && err.status === 409 && err.body.worktrees) setWorktrees(err.body.worktrees);
      else setError(errMsg(err));
    }
  };
  return (
    <dialog open data-testid="close-dialog" className="card p-3 shadow">
      {worktrees ? (
        <>
          <p>Worktrees exist:</p>
          <ul data-testid="worktree-list" className="list-group mb-3">
            {worktrees.map((w) => (
              <li key={w.path} data-testid="worktree-item" className="list-group-item">
                {w.path} ({w.branch}) {w.dirty && <b data-testid="worktree-dirty" className="badge text-bg-warning">dirty</b>}
              </li>
            ))}
          </ul>
          <button className="btn btn-danger me-2" data-testid="close-remove" onClick={() => run('remove')}>Remove worktrees</button>
          <button className="btn btn-primary me-2" data-testid="close-keep" onClick={() => run('keep')}>Keep worktrees</button>
        </>
      ) : (
        <>
          <p>Close drover {hid}?</p>
          <button className="btn btn-danger me-2" data-testid="close-confirm" onClick={() => run()}>Close</button>
        </>
      )}
      {error && <p role="alert" data-testid="close-error" className="alert alert-danger mt-2">{error}</p>}
      <button className="btn btn-outline-secondary" data-testid="close-cancel" onClick={onClose}>Cancel</button>
    </dialog>
  );
}
