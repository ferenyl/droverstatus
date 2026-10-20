import { useState } from 'react';
import type { Worktree } from '@droverstatus/shared';
import { api, ApiFail } from '../api';
import { errMsg } from '../util';
import { Modal } from './Modal';

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
    <Modal testId="close-dialog" title={worktrees ? 'Close drover: worktrees' : 'Close drover'} onClose={onClose}>
      {worktrees ? (
        <>
          <p>Worktrees exist:</p>
          <ul data-testid="worktree-list" className="list-group mb-3">
            {worktrees.map((w) => (
              <li key={w.path} data-testid="worktree-item" className="list-group-item">
                {w.path} ({w.branch}) {w.dirty && <b data-testid="worktree-dirty" className="badge theme-warning">dirty</b>}
              </li>
            ))}
          </ul>
          <button className="btn btn-solid theme-danger me-2" data-testid="close-remove" onClick={() => run('remove')}>Remove worktrees</button>
          <button className="btn btn-solid theme-primary me-2" data-testid="close-keep" onClick={() => run('keep')}>Keep worktrees</button>
        </>
      ) : (
        <>
          <p>Close drover {hid}?</p>
          <button className="btn btn-solid theme-danger me-2" data-testid="close-confirm" onClick={() => run()}>Close</button>
        </>
      )}
      {error && <p role="alert" data-testid="close-error" className="alert theme-danger mt-2">{error}</p>}
      <button className="btn btn-outline theme-secondary" data-testid="close-cancel" onClick={onClose}>Cancel</button>
    </Modal>
  );
}
