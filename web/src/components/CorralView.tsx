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
    <main data-testid="corral-view">
      <header>
        <h2>{c.slug} <code>{c.hid}</code> <span data-testid="corral-badge">{badge(c)}</span></h2>
        <div>projekt: <span data-testid="corral-project">{c.project}</span></div>
        <div>
          <code data-testid="attach-cmd">{attach}</code>{' '}
          <button data-testid="copy-attach" onClick={() => navigator.clipboard?.writeText(attach)}>Kopiera</button>
        </div>
        <div>drover: {c.drover.model} <span data-testid="drover-state">{c.drover.status.state}</span></div>
        {!c.closed && <button data-testid="close-btn" onClick={p.onClose}>Stäng</button>}
        {!c.closed && c.liveness !== 'alive' && (
          <button data-testid="revive-btn" onClick={() => act(() => api.revive(c.hid))}>Revive</button>
        )}
      </header>
      <AgentTable corral={c} onScreen={p.onScreen} onKill={(id) => act(() => api.kill(c.hid, id))} />
      <TaskList tasks={c.tasks} />
      <MessageFeed corral={c} onError={p.onError} />
      <Reports hid={c.hid} ids={c.reports} />
    </main>
  );
}
