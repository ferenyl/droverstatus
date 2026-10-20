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
    <dialog open data-testid="close-dialog">
      {worktrees ? (
        <>
          <p>Worktrees finns:</p>
          <ul data-testid="worktree-list">
            {worktrees.map((w) => (
              <li key={w.path} data-testid="worktree-item">
                {w.path} ({w.branch}) {w.dirty && <b data-testid="worktree-dirty">dirty</b>}
              </li>
            ))}
          </ul>
          <button data-testid="close-remove" onClick={() => run('remove')}>Ta bort worktrees</button>
          <button data-testid="close-keep" onClick={() => run('keep')}>Behåll worktrees</button>
        </>
      ) : (
        <>
          <p>Stäng drover {hid}?</p>
          <button data-testid="close-confirm" onClick={() => run()}>Stäng</button>
        </>
      )}
      {error && <p role="alert" data-testid="close-error">{error}</p>}
      <button data-testid="close-cancel" onClick={onClose}>Avbryt</button>
    </dialog>
  );
}
