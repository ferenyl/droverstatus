import type { Task } from '@droverstatus/shared';

export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <table data-testid="task-list">
      <thead>
        <tr><th>id</th><th>titel</th><th>state</th><th>owner</th><th>försök</th><th>beror på</th></tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id} data-testid={`task-row-${t.id}`}>
            <td>{t.id}</td><td>{t.title}</td><td>{t.state}</td><td>{t.owner}</td><td>{t.attempts ?? 0}</td>
            <td>{t.depends_on.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
