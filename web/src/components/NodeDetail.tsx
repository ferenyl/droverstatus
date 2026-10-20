import { useState } from 'react';
import type { Agent, Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg, relTime, type Node } from '../util';
import { AgentScreen } from './AgentScreen';
import { Reports } from './Reports';
import { PaneHeader } from './PaneHeader';
import { Tabs } from './Tabs';
import { Icon } from './Icon';

const Kv = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className="kv">
    {rows.map(([k, v]) => <><dt key={`k${k}`}>{k}</dt><dd key={`v${k}`}>{v}</dd></>)}
  </dl>
);

type Tab = 'screen' | 'overview' | 'reports';

export function NodeDetail({ corral: c, node, onError }: { corral: Corral; node: Node; onError: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>('screen');
  if (node.kind === 'drover') {
    const d = c.drover;
    return (
      <div data-testid="drover-detail" className="pane-in">
        <PaneHeader crumbs={[<b key="s">{c.slug}</b>, 'drover']} badge={<span className={`pill pill-${d.status.state}`}>{d.status.state}</span>} />
        <div className="tab-body">
          <section className="card-x">
            <h3>Drover</h3>
            <Kv rows={[
              ['state', <span data-testid="drover-state">{d.status.state}</span>],
              ['model', d.model ?? ''],
              ['mode', d.mode ?? ''],
              ['updated', <span className="mono">{relTime(d.status.at)}</span>],
              ['session', <span className="mono">{d.session_id ?? ''}</span>],
            ]} />
          </section>
        </div>
      </div>
    );
  }
  const a: Agent | undefined = c.agents.find((x) => x.id === node.id);
  if (!a) return <p data-testid="agent-gone" className="empty-note">Agent {node.id} no longer exists</p>;
  return (
    <div data-testid="agent-detail" className="pane-in">
      <PaneHeader
        crumbs={[<b key="s">{c.slug}</b>, a.id]}
        badge={<span data-testid="agent-detail-state" className={`pill pill-${a.status.state}`}>{a.status.state}</span>}
        actions={<button className="btn btn-sm btn-outline theme-danger" data-testid={`agent-kill-${a.id}`} onClick={() => api.kill(c.hid, a.id).catch((e) => onError(errMsg(e)))}><Icon n="x" /> Kill</button>}
      />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'screen', label: 'Screen' }, { id: 'overview', label: 'Overview' }, { id: 'reports', label: 'Report' }]} />
      <div className="tab-body" data-testid={`tabpanel-${tab}`}>
        {tab === 'screen' && <AgentScreen hid={c.hid} id={a.id} />}
        {tab === 'overview' && (
          <section className="card-x">
            <h3>Agent</h3>
            <Kv rows={[
              ['model', a.model ?? ''],
              ['purpose', a.purpose ?? ''],
              ['tab/pane', <span className="mono">{`${a.tab_name ?? ''}${a.pane_id ? `/${a.pane_id}` : ''}`}</span>],
              ['updated', <span className="mono">{relTime(a.status.at)}</span>],
              ['cwd', <span className="mono">{a.cwd ?? ''}</span>],
            ]} />
          </section>
        )}
        {tab === 'reports' && <Reports hid={c.hid} ids={c.reports.filter((r) => r === a.id)} />}
      </div>
    </div>
  );
}
