// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { api } from '../api';
import { badge, counts, errMsg, loadPref, savePref } from '../util';
import type { Tab } from '../route';
import { AgentTable } from './AgentTable';
import { TaskList } from './TaskList';
import { CorralBoard } from './CorralBoard';
import { MessageFeed } from './MessageFeed';
import { Doc } from './Doc';
import { Worktrees } from './Worktrees';
import { Reports } from './Reports';
import { PaneHeader } from './PaneHeader';
import { Tabs } from './Tabs';
import { Icon, StateIcon } from './Icon';

export function CorralView(p: { corral: Corral; tab: Tab; onTab: (t: Tab) => void; story?: string; onStory?: (id?: string) => void; onOpenAgent: (id: string) => void; onClose: () => void; onError: (m: string) => void }) {
  const c = p.corral;
  const tab = p.tab;
  const attach = `zellij attach ${c.session}`;
  const act = (f: () => Promise<unknown>) => f().catch((e) => p.onError(errMsg(e)));
  const n = counts(c);
  const [taskStory, setTaskStory] = useState(() => (c.stories.some((s) => s.id === loadPref('taskStory')) ? loadPref('taskStory') : ''));
  const [reviving, setReviving] = useState(false);
  const shownTasks = taskStory ? c.tasks.filter((t) => t.story === taskStory) : c.tasks;
  return (
    <div data-testid="corral-view" className="pane-in">
      <PaneHeader
        crumbs={[<b key="s">{c.slug}</b>, <code key="h">{c.hid}</code>]}
        badge={<span data-testid="corral-badge" className={`pill pill-${badge(c)}`}><StateIcon state={badge(c)} />{badge(c)}</span>}
        extra={c.closing && !c.closed && <span data-testid="corral-closing" className="pill pill-blocked">closing…</span>}
        actions={
          <>
            {!c.closed && c.liveness !== 'alive' && (
              <button className="btn btn-sm btn-solid theme-warning" data-testid="revive-btn" disabled={reviving} onClick={() => { setReviving(true); void act(() => api.revive(c.hid)).finally(() => setReviving(false)); }}><Icon n="play" /> Revive</button>
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
          { id: 'board', label: 'Board' },
          { id: 'tasks', label: `Tasks (${c.tasks.length})` },
          { id: 'messages', label: `Messages (${c.messages_total})` },
          { id: 'reports', label: `Reports (${c.reports.length})` },
          { id: 'docs', label: `Docs (${c.docs.length})` },
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
                {c.drover_version && <><dt>plugin</dt><dd data-testid="drover-version" className="mono">{c.drover_version}{c.schema != null && ` · schema ${c.schema}`}</dd></>}
                <dt>drover</dt><dd>{c.drover.model} <span data-testid="drover-state" className={`pill pill-${c.drover.status.state}`}><StateIcon state={c.drover.status.state} />{c.drover.status.state}</span></dd>
                <dt>agents</dt><dd className="mono">{n.busy} busy · {n.idle} idle · {n.blocked} blocked</dd>
                {c.story_mode && (
                  <>
                    <dt>story mode</dt>
                    <dd data-testid="story-mode" className="mono">
                      {c.stories.length} stor{c.stories.length === 1 ? 'y' : 'ies'} · {c.story_mode.parallel ? 'parallel' : 'sequential'} · planner {c.story_mode.planner ? 'yes' : 'no'} · PR {c.story_mode.pr ? 'yes' : 'no'} · PR review {c.story_mode.pr_review ? 'yes' : 'no'}
                    </dd>
                  </>
                )}
              </dl>
            </section>
            <Doc title="Brief" testId="brief" load={() => api.brief(c.hid)} />
            <Worktrees hid={c.hid} />
            <section className="card-x">
              <h3><Icon n="screen" /> Agents</h3>
              {c.agents.length === 0 ? <p className="empty-note">No agents yet</p> : (
                <AgentTable corral={c} onScreen={p.onOpenAgent} onKill={(id) => confirm(`Kill agent ${id}?`) && act(() => api.kill(c.hid, id))} />
              )}
            </section>
          </>
        )}
        {tab === 'board' && <CorralBoard corral={c} story={p.story} onStory={p.onStory ?? (() => {})} onOpen={(owner) => owner && p.onOpenAgent(owner)} />}
        {tab === 'tasks' && (
          <section className="card-x flush">
            {c.stories.length > 0 && (
              <select className="form-select form-select-sm story-select" data-testid="tasks-story-filter" aria-label="Filter by story" value={taskStory} onChange={(e) => { savePref('taskStory', e.target.value); setTaskStory(e.target.value); }}>
                <option value="">All stories</option>
                {c.stories.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.title}</option>)}
              </select>
            )}
            {c.tasks.length === 0 ? <p className="empty-note p">No tasks</p> : <TaskList tasks={shownTasks} all={c.tasks} />}
          </section>
        )}
        {tab === 'messages' && <MessageFeed corral={c} onError={p.onError} />}
        {tab === 'docs' && (
          <section data-testid="docs" className="card-x">
            {c.docs.length === 0 && <p className="empty-note">No docs yet</p>}
            {c.docs.map((d) => (
              <Doc key={d.path} testId={`doc-${d.note || d.path}`} title={`${d.note || d.path}${d.agent ? ` · ${d.agent}` : ''} — ${d.path}`} load={() => api.doc(c.hid, d.path)} version={d.stamp} markdown={/\.(md|markdown)$/i.test(d.path)} json={/\.json$/i.test(d.path)} onArtifact={() => act(() => api.send(c.hid, `create a Claude artifact of ${d.path}`))} />
            ))}
          </section>
        )}
        {tab === 'reports' && <Reports hid={c.hid} ids={c.reports} meta={c.report_meta} />}
      </div>
    </div>
  );
}
