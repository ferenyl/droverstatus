import type { Task } from '@droverstatus/shared';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <div className="table-responsive"><table data-testid="task-list" className="table table-sm">
      <thead>
        <tr><th>id</th><th>title</th><th>state</th><th>owner</th><th>attempts</th><th>depends on</th></tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id} data-testid={`task-row-${t.id}`}>
            <td>{t.id}</td><td>{t.title}</td><td>{t.state}</td><td>{t.owner}</td><td>{t.attempts ?? 0}</td>
            <td>{t.depends_on.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
