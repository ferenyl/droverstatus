// SPDX-License-Identifier: GPL-3.0-only
import type { Task } from '@droverstatus/shared';
import { relTime } from '../util';
import { StateIcon } from './Icon';

/** todo with every dependency done */
export const isReady = (t: Task, all: Task[]) => t.state === 'todo' && t.depends_on.every((d) => all.find((x) => x.id === d)?.state === 'done');

export function TaskList({ tasks, all = tasks }: { tasks: Task[]; all?: Task[] }) {
  const stories = tasks.some((t) => t.story);
  return (
    <div className="table-responsive">
      <table data-testid="task-list" className="table dense">
        <thead>
          <tr><th>id</th>{stories && <th>story</th>}<th>title</th><th>state</th><th>owner</th><th>attempts</th><th>depends on</th><th>time</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} data-testid={`task-row-${t.id}`} className={(t.attempts ?? 0) >= 3 ? 'attempts-high' : undefined}>
              <td className="mono">{t.id}</td>{stories && <td className="mono">{t.story}</td>}<td>
                {t.kind && t.kind !== 'impl' && <span data-testid={`task-kind-${t.id}`} className="pill">{t.kind}</span>} {t.title}
                {isReady(t, all) && <span data-testid={`task-ready-${t.id}`} className="pill pill-idle">ready</span>}
                {t.acceptance.length > 0 && <details data-testid={`task-accept-${t.id}`}><summary>acceptance ({t.acceptance.length})</summary><ul>{t.acceptance.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
              </td><td><span className={`pill pill-task-${t.state}`}><StateIcon state={t.state === 'done' ? 'alive' : t.state === 'in_progress' ? 'busy' : t.state === 'failed' ? 'dead' : 'idle'} />{t.state}</span></td><td>{t.owner}</td><td className="mono" title={(t.attempts ?? 0) >= 3 ? 'Needs user attention' : undefined}>{t.attempts ?? 0}{(t.attempts ?? 0) >= 3 && <span data-testid={`task-attention-${t.id}`} className="pill pill-blocked">ask user</span>}</td>
              <td className="mono">{t.depends_on.join(', ')}</td>
              <td className="mono" data-testid={`task-time-${t.id}`}>{t.finished_at ? `${t.state} ${relTime(t.finished_at)}` : t.started_at ? `started ${relTime(t.started_at)}` : t.created_at ? `created ${relTime(t.created_at)}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
