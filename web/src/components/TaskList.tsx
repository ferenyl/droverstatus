// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import type { Task } from '@droverstatus/shared';
import { api } from '../api';
import { relTime } from '../util';
import { StateIcon } from './Icon';

/** todo with every dependency done */
export const isReady = (t: Task, all: Task[]) => t.state === 'todo' && t.depends_on.every((d) => all.find((x) => x.id === d)?.state === 'done');

export interface TaskActions {
  dispatch: (t: Task, fresh: boolean) => void;
  approve: (t: Task) => void;
}

/** dispatch (--fresh clears the agent's context first) and approve (a write scope for the task's owner) */
export const taskActions = (hid: string, run: (f: () => Promise<unknown>) => unknown): TaskActions => ({
  dispatch: (t, fresh) => (!fresh || confirm(`Clear ${t.owner}'s context and dispatch ${t.id}?`)) && run(() => api.dispatch(hid, t.id, fresh)),
  approve: (t) => {
    const scope = prompt(`Approve for task ${t.id} (${t.owner}). Scope:`)?.trim();
    if (scope) run(() => api.approve(hid, t.id, scope));
  },
});

export function TaskList({ tasks, all = tasks, actions }: { tasks: Task[]; all?: Task[]; actions?: TaskActions }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? tasks : tasks.slice(0, 100);
  const stories = tasks.some((t) => t.story);
  return (
    <div className="table-responsive">
      <table data-testid="task-list" className="table dense">
        <thead>
          <tr><th>id</th>{stories && <th>story</th>}<th>title</th><th>state</th><th>owner</th><th>attempts</th><th>depends on</th><th>time</th>{actions && <th />}</tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={t.id} data-testid={`task-row-${t.id}`} className={(t.attempts ?? 0) >= 3 ? 'attempts-high' : undefined}>
              <td className="mono">{t.id}</td>{stories && <td className="mono">{t.story}</td>}<td>
                {t.kind && t.kind !== 'impl' && <span data-testid={`task-kind-${t.id}`} className="pill">{t.kind}</span>} {t.title}
                {isReady(t, all) && <span data-testid={`task-ready-${t.id}`} className="pill pill-idle">ready</span>}
                {t.approved?.map((s, i) => <span key={i} data-testid={`task-approved-${t.id}`} className="pill pill-idle" title="approved scope">✓ {s}</span>)}
                {t.acceptance.length > 0 && <details data-testid={`task-accept-${t.id}`}><summary>acceptance ({t.acceptance.length})</summary><ul>{t.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
              </td><td><span className={`pill pill-task-${t.state}`}><StateIcon state={t.state === 'done' ? 'alive' : t.state === 'in_progress' ? 'busy' : t.state === 'failed' ? 'dead' : 'idle'} />{t.state}</span></td><td>{t.owner}</td><td className="mono" title={(t.attempts ?? 0) >= 3 ? 'Needs user attention' : undefined}>{t.attempts ?? 0}{(t.attempts ?? 0) >= 3 && <span data-testid={`task-attention-${t.id}`} className="pill pill-blocked">ask user</span>}</td>
              <td className="mono">{t.depends_on.join(', ')}</td>
              <td className="mono" data-testid={`task-time-${t.id}`}>{t.finished_at ? `${t.state} ${relTime(t.finished_at)}` : t.started_at ? `started ${relTime(t.started_at)}` : t.created_at ? `created ${relTime(t.created_at)}` : ''}</td>
              {actions && (
                <td className="nowrap">
                  {t.state === 'todo' && t.owner && <>
                    <button className="btn btn-sm btn-outline theme-primary" data-testid={`task-dispatch-${t.id}`} onClick={() => actions.dispatch(t, false)}>Dispatch</button>{' '}
                    <button className="btn btn-sm btn-outline theme-secondary" data-testid={`task-dispatch-fresh-${t.id}`} title="/clear the agent's context first" onClick={() => actions.dispatch(t, true)}>Fresh</button>{' '}
                  </>}
                  {t.owner && t.state !== 'done' && <button className="btn btn-sm btn-outline theme-warning" data-testid={`task-approve-${t.id}`} onClick={() => actions.approve(t)}>Approve…</button>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length < tasks.length && <button className="btn btn-sm btn-outline" data-testid="tasks-more" onClick={() => setShowAll(true)}>Show all {tasks.length}</button>}
    </div>
  );
}
