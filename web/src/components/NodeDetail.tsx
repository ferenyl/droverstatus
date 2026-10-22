// SPDX-License-Identifier: GPL-3.0-only
import { Fragment } from 'react';
import type { Agent, Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg, isStuck, relTime, type Node } from '../util';
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

function ResumeCmd({ id }: { id: string }) {
  const cmd = `claude --resume ${id}`;
  return (
    <>
      <code data-testid="resume-cmd">{cmd}</code>{' '}
      <button className="btn btn-sm btn-outline theme-secondary" data-testid="copy-resume" onClick={() => navigator.clipboard?.writeText(cmd)}><Icon n="copy" /> Copy</button>
    </>
  );
}

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
        ...(a.status.since ? [['state since', <span data-testid="state-since" className="mono">{relTime(a.status.since)}</span>] as [string, React.ReactNode]] : []),
        ['cwd', <span className="mono">{a.cwd ?? ''}</span>],
        ...(a.worktree ? [['worktree', <span data-testid="agent-worktree" className="mono">{a.worktree}</span>] as [string, React.ReactNode]] : []),
        ...(a.story ? [['story', <span data-testid="agent-story" className="mono">{a.story}</span>] as [string, React.ReactNode]] : []),
        ...(a.created ? [['created', <span className="mono">{relTime(a.created)}</span>] as [string, React.ReactNode]] : []),
        ...(a.session_id ? [['session', <ResumeCmd id={a.session_id} />] as [string, React.ReactNode]] : []),
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
        extra={!c.closed && c.liveness !== 'dead' && isStuck(a?.status ?? d.status) && <span data-testid="agent-stuck" className="pill pill-blocked">stuck?</span>}
        actions={a && <>
          {!!a.queued && a.status.state !== 'blocked' && <button className="btn btn-sm btn-outline theme-primary" data-testid={`agent-flush-${a.id}`} onClick={() => api.flush(c.hid, a.id).catch((e) => onError(errMsg(e)))}><Icon n="send" /> Flush ({a.queued})</button>}
          <button className="btn btn-sm btn-outline theme-danger" data-testid={`agent-kill-${a.id}`} onClick={() => api.kill(c.hid, a.id).catch((e) => onError(errMsg(e)))}><Icon n="x" /> Kill</button>
        </>}
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
        {tab === 'messages' && <MessageFeed corral={c} messages={msgs} compose={id} onError={onError} />}
        {tab === 'reports' && <Reports hid={c.hid} ids={reports} meta={c.report_meta} auto />}
        {tab === 'screen' && (
          <>
            <AgentScreen hid={c.hid} id={id} />
            <Composer hid={c.hid} to={id} onError={onError} />
          </>
        )}
      </div>
    </div>
  );
}
