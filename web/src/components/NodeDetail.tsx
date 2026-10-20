// SPDX-License-Identifier: GPL-3.0-only
import { Fragment } from 'react';
import type { Agent, Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg, relTime, type Node } from '../util';
import type { Tab } from '../route';
import { AgentScreen } from './AgentScreen';
import { Reports } from './Reports';
import { TaskList } from './TaskList';
import { Composer, MessageFeed } from './MessageFeed';
import { PaneHeader } from './PaneHeader';
import { Tabs } from './Tabs';
import { Icon, StateIcon } from './Icon';

const Kv = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className="kv">
    {rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
  </dl>
);

export function NodeDetail(p: { corral: Corral; node: Node; tab: Tab; onTab: (t: Tab) => void; onError: (m: string) => void }) {
  const { corral: c, node, tab, onError } = p;
  const isDrover = node.kind === 'drover';
  const id = node.kind === 'agent' ? node.id : 'drover';
  const a: Agent | undefined = node.kind === 'agent' ? c.agents.find((x) => x.id === node.id) : undefined;
  if (node.kind === 'agent' && !a) return <p data-testid="agent-gone" className="empty-note">Agent {node.id} no longer exists</p>;
  const d = c.drover;
  const state = a ? a.status.state : d.status.state;
  const tasks = c.tasks.filter((t) => t.owner === id);
  const msgs = c.messages.filter((m) => m.from === id || m.to === id);
  const reports = c.reports.filter((r) => r === id);
  const rows: [string, React.ReactNode][] = a
    ? [
        ['model', a.model ?? ''],
        ['purpose', a.purpose ?? ''],
        ['tab/pane', <span className="mono">{`${a.tab_name ?? ''}${a.pane_id ? `/${a.pane_id}` : ''}`}</span>],
        ['updated', <span className="mono">{relTime(a.status.at)}</span>],
        ['cwd', <span className="mono">{a.cwd ?? ''}</span>],
      ]
    : [
        ['model', d.model ?? ''],
        ['mode', d.mode ?? ''],
        ['updated', <span className="mono">{relTime(d.status.at)}</span>],
        ['session', <span className="mono">{d.session_id ?? ''}</span>],
      ];
  return (
    <div data-testid={isDrover ? 'drover-detail' : 'agent-detail'} className="pane-in">
      <PaneHeader
        crumbs={[<b key="s">{c.slug}</b>, isDrover ? 'drover' : id]}
        badge={<span data-testid={isDrover ? 'drover-state' : 'agent-detail-state'} className={`pill pill-${state}`}><StateIcon state={state} />{state}</span>}
        actions={a && <button className="btn btn-sm btn-outline theme-danger" data-testid={`agent-kill-${a.id}`} onClick={() => api.kill(c.hid, a.id).catch((e) => onError(errMsg(e)))}><Icon n="x" /> Kill</button>}
      />
      <Tabs
        active={tab}
        onChange={p.onTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: `Tasks (${tasks.length})` },
          { id: 'messages', label: `Messages (${msgs.length})` },
          { id: 'reports', label: `Report${reports.length === 1 ? '' : 's'} (${reports.length})` },
          { id: 'screen', label: 'Screen' },
        ]}
      />
      <div className={`tab-body ${tab === 'screen' ? 'fill' : ''}`} data-testid={`tabpanel-${tab}`}>
        {tab === 'overview' && <section className="card-x"><h3><Icon n="overview" /> {isDrover ? 'Drover' : 'Agent'}</h3><Kv rows={rows} /></section>}
        {tab === 'tasks' && <section className="card-x flush">{tasks.length === 0 ? <p className="empty-note p">No tasks owned by {id}</p> : <TaskList tasks={tasks} />}</section>}
        {tab === 'messages' && <MessageFeed corral={c} messages={msgs} compose={isDrover} onError={onError} />}
        {tab === 'reports' && <Reports hid={c.hid} ids={reports} auto />}
        {tab === 'screen' && (
          <>
            <AgentScreen hid={c.hid} id={id} />
            {isDrover && <Composer hid={c.hid} onError={onError} />}
          </>
        )}
      </div>
    </div>
  );
}
