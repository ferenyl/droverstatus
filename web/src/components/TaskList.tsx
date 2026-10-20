import type { Task } from '@droverstatus/shared';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="table-responsive">
      <table data-testid="task-list" className="table dense">
        <thead>
          <tr><th>id</th><th>title</th><th>state</th><th>owner</th><th>attempts</th><th>depends on</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} data-testid={`task-row-${t.id}`}>
              <td className="mono">{t.id}</td><td>{t.title}</td><td><span className={`pill pill-task-${t.state}`}>{t.state}</span></td><td>{t.owner}</td><td className="mono">{t.attempts ?? 0}</td>
              <td className="mono">{t.depends_on.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
