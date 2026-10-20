import type { Corral } from '@droverstatus/shared';
import { api } from '../api';
import { badge, errMsg } from '../util';
import { AgentTable } from './AgentTable';
import { TaskList } from './TaskList';
import { MessageFeed } from './MessageFeed';
import { Reports } from './Reports';

export function CorralView(p: {
  corral: Corral;
  onScreen: (id: string) => void;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const c = p.corral;
  const attach = `zellij attach ${c.session}`;
  const act = (f: () => Promise<unknown>) => f().catch((e) => p.onError(errMsg(e)));
  return (
    <div data-testid="corral-view">
      <header className="mb-3">
        <h2 className="h4">{c.slug} <code>{c.hid}</code> <span data-testid="corral-badge" className="badge text-bg-secondary">{badge(c)}</span></h2>
        <div>project: <span data-testid="corral-project">{c.project}</span></div>
        <div>
          <code data-testid="attach-cmd">{attach}</code>{' '}
          <button className="btn btn-sm btn-outline-secondary" data-testid="copy-attach" onClick={() => navigator.clipboard?.writeText(attach)}>Copy</button>
        </div>
        <div className="my-2">drover: {c.drover.model} <span data-testid="drover-state">{c.drover.status.state}</span></div>
        {!c.closed && <button className="btn btn-sm btn-danger me-2" data-testid="close-btn" onClick={p.onClose}>Close</button>}
        {!c.closed && c.liveness !== 'alive' && (
          <button className="btn btn-sm btn-warning" data-testid="revive-btn" onClick={() => act(() => api.revive(c.hid))}>Revive</button>
        )}
      </header>
      <AgentTable corral={c} onScreen={p.onScreen} onKill={(id) => act(() => api.kill(c.hid, id))} />
      <TaskList tasks={c.tasks} />
      <MessageFeed corral={c} onError={p.onError} />
      <Reports hid={c.hid} ids={c.reports} />
    </div>
  );
}
