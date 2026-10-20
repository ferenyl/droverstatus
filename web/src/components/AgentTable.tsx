// SPDX-License-Identifier: GPL-3.0-only
import type { Corral } from '@droverstatus/shared';
import { relTime } from '../util';
import { Icon, StateIcon } from './Icon';

export function AgentTable(p: { corral: Corral; onScreen: (id: string) => void; onKill: (id: string) => void }) {
  const { agents } = p.corral;
  return (
    <div className="table-responsive">
      <table data-testid="agent-table" className="table dense">
        <thead>
          <tr><th>id</th><th>model</th><th>tab/pane</th><th>state</th><th>updated</th><th>purpose</th><th /></tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} data-testid={`agent-row-${a.id}`} className={`state-${a.status.state}`}>
              <td className="mono">{a.id}</td>
              <td>{a.model}</td>
              <td className="mono">{a.tab_name}{a.pane_id ? `/${a.pane_id}` : ''}</td>
              <td data-testid={`agent-state-${a.id}`}><StateIcon state={a.status.state} />{a.status.state}</td>
              <td className="mono">{relTime(a.status.at)}</td>
              <td>{a.purpose}</td>
              <td className="nowrap">
                <button className="btn btn-sm btn-outline theme-primary" data-testid={`agent-screen-${a.id}`} onClick={() => p.onScreen(a.id)}><Icon n="term" /> Screen</button>{' '}
                <button className="btn btn-sm btn-outline theme-danger" data-testid={`agent-kill-${a.id}`} onClick={() => p.onKill(a.id)}><Icon n="x" /> Kill</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
