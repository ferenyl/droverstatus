// SPDX-License-Identifier: GPL-3.0-only
import type { Task } from '@droverstatus/shared';
import { StateIcon } from './Icon';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="table-responsive">
      <table data-testid="task-list" className="table dense">
        <thead>
          <tr><th>id</th><th>title</th><th>state</th><th>owner</th><th>attempts</th><th>depends on</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} data-testid={`task-row-${t.id}`} className={(t.attempts ?? 0) >= 3 ? 'attempts-high' : undefined}>
              <td className="mono">{t.id}</td><td>{t.title}</td><td><span className={`pill pill-task-${t.state}`}><StateIcon state={t.state === 'done' ? 'alive' : t.state === 'in_progress' ? 'busy' : t.state === 'failed' ? 'dead' : 'idle'} />{t.state}</span></td><td>{t.owner}</td><td className="mono" title={(t.attempts ?? 0) >= 3 ? 'Needs user attention' : undefined}>{t.attempts ?? 0}{(t.attempts ?? 0) >= 3 && <span data-testid={`task-attention-${t.id}`} className="pill pill-blocked">ask user</span>}</td>
              <td className="mono">{t.depends_on.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
