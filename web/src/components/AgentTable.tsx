import type { Corral } from '@droverstatus/shared';
import { relTime } from '../util';

export function AgentTable(p: { corral: Corral; onScreen: (id: string) => void; onKill: (id: string) => void }) {
  const { agents } = p.corral;
  return (
    <table data-testid="agent-table">
      <thead>
        <tr><th>id</th><th>modell</th><th>tab/pane</th><th>state</th><th>senast</th><th>purpose</th><th /></tr>
      </thead>
      <tbody>
        {agents.map((a) => (
          <tr key={a.id} data-testid={`agent-row-${a.id}`} className={`state-${a.status.state}`}>
            <td>{a.id}</td>
            <td>{a.model}</td>
            <td>{a.tab_name}{a.pane_id ? `/${a.pane_id}` : ''}</td>
            <td data-testid={`agent-state-${a.id}`}>{a.status.state}</td>
            <td>{relTime(a.status.at)}</td>
            <td>{a.purpose}</td>
            <td>
              <button data-testid={`agent-screen-${a.id}`} onClick={() => p.onScreen(a.id)}>Skärm</button>
              <button data-testid={`agent-kill-${a.id}`} onClick={() => p.onKill(a.id)}>Döda</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
