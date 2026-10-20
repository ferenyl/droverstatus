import type { Corral } from '@droverstatus/shared';
import { api } from '../api';
import { badge, counts, errMsg } from '../util';
import type { Tab } from '../route';
import { AgentTable } from './AgentTable';
import { TaskList } from './TaskList';
import { MessageFeed } from './MessageFeed';
import { Reports } from './Reports';
import { PaneHeader } from './PaneHeader';
import { Tabs } from './Tabs';
import { Icon, StateIcon } from './Icon';

export function CorralView(p: { corral: Corral; tab: Tab; onTab: (t: Tab) => void; onOpenAgent: (id: string) => void; onClose: () => void; onError: (m: string) => void }) {
  const c = p.corral;
  const tab = p.tab;
  const attach = `zellij attach ${c.session}`;
  const act = (f: () => Promise<unknown>) => f().catch((e) => p.onError(errMsg(e)));
  const n = counts(c);
  return (
    <div data-testid="corral-view" className="pane-in">
      <PaneHeader
        crumbs={[<b key="s">{c.slug}</b>, <code key="h">{c.hid}</code>]}
        badge={<span data-testid="corral-badge" className={`pill pill-${badge(c)}`}><StateIcon state={badge(c)} />{badge(c)}</span>}
        actions={
          <>
            {!c.closed && c.liveness !== 'alive' && (
              <button className="btn btn-sm btn-solid theme-warning" data-testid="revive-btn" onClick={() => act(() => api.revive(c.hid))}><Icon n="play" /> Revive</button>
            )}
            {!c.closed && <button className="btn btn-sm btn-outline theme-danger" data-testid="close-btn" onClick={p.onClose}><Icon n="stop" /> Close</button>}
          </>
        }
      />
      <Tabs
        active={tab}
        onChange={p.onTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: `Tasks (${c.tasks.length})` },
          { id: 'messages', label: `Messages (${c.messages.length})` },
          { id: 'reports', label: `Reports (${c.reports.length})` },
        ]}
      />
      <div className="tab-body" data-testid={`tabpanel-${tab}`}>
        {tab === 'overview' && (
          <>
            <section className="card-x">
              <h3><Icon n="overview" /> Session</h3>
              <dl className="kv">
                <dt>project</dt><dd><span data-testid="corral-project" className="mono">{c.project}</span></dd>
                <dt>attach</dt>
                <dd>
                  <code data-testid="attach-cmd">{attach}</code>{' '}
                  <button className="btn btn-sm btn-outline theme-secondary" data-testid="copy-attach" onClick={() => navigator.clipboard?.writeText(attach)}><Icon n="copy" /> Copy</button>
                </dd>
                <dt>drover</dt><dd>{c.drover.model} <span data-testid="drover-state" className={`pill pill-${c.drover.status.state}`}><StateIcon state={c.drover.status.state} />{c.drover.status.state}</span></dd>
                <dt>agents</dt><dd className="mono">{n.busy} busy · {n.idle} idle · {n.blocked} blocked</dd>
              </dl>
            </section>
            <section className="card-x">
              <h3><Icon n="screen" /> Agents</h3>
              {c.agents.length === 0 ? <p className="empty-note">No agents yet</p> : (
                <AgentTable corral={c} onScreen={p.onOpenAgent} onKill={(id) => act(() => api.kill(c.hid, id))} />
              )}
            </section>
          </>
        )}
        {tab === 'tasks' && <section className="card-x flush">{c.tasks.length === 0 ? <p className="empty-note p">No tasks</p> : <TaskList tasks={c.tasks} />}</section>}
        {tab === 'messages' && <MessageFeed corral={c} onError={p.onError} />}
        {tab === 'reports' && <Reports hid={c.hid} ids={c.reports} />}
      </div>
    </div>
  );
}
