// SPDX-License-Identifier: GPL-3.0-only
import { STORY_STATES } from '@droverstatus/shared';
import type { Corral, Story } from '@droverstatus/shared';
import { nodeState } from '../util';
import { Icon } from './Icon';
import { StatusIcon } from './CorralList';

const STORY_COLUMNS: Record<(typeof STORY_STATES)[number], { name: string; icon: string }> = {
  backlog: { name: 'Backlog', icon: 'idle' },
  planning: { name: 'Planning', icon: 'busy' },
  working: { name: 'Working', icon: 'busy' },
  'waiting-for-user': { name: 'Waiting for user', icon: 'blocked' },
  review: { name: 'Review', icon: 'unknown' },
  done: { name: 'Done', icon: 'alive' },
};

export const storyColumnOf = (s: Story) => ((STORY_STATES as readonly string[]).includes(s.status) ? s.status : 'backlog');

function StoryCard({ c, s, selected, onSelect }: { c: Corral; s: Story; selected: boolean; onSelect: () => void }) {
  const tasks = c.tasks.filter((t) => t.story === s.id);
  const done = tasks.filter((t) => t.state === 'done').length;
  const ids = new Set([...c.agents.filter((a) => a.story === s.id).map((a) => a.id), ...tasks.flatMap((t) => (t.owner ? [t.owner] : []))]);
  const agents = c.agents.filter((a) => ids.has(a.id));
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`tcard scard ${selected ? 'on' : ''} ${s.blocked ? 'hot' : ''}`}
      data-testid={`story-card-${c.hid}-${s.id}`}
      data-state={s.status}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
    >
      <span className="tc-meta">
        {s.tracker && <span className="muted">{s.tracker}</span>}
        {s.url ? <a href={s.url} target="_blank" rel="noreferrer" onClick={stop}><code>{s.key ?? s.id}</code></a> : <code>{s.key ?? s.id}</code>}
        {s.type && <span className="muted">{s.type}</span>}
        {s.blocked && <span data-testid={`story-blocked-${s.id}`} className="pill pill-dead" title={s.blocked}>blocked</span>}
        {s.clarified && <span className="pill" title="clarified by user">clarified</span>}
      </span>
      <span className="tc-title">{s.title}</span>
      {s.summary && <span className="sc-summary muted" title={s.summary}>{s.summary}</span>}
      <span className="tc-meta">
        {s.assignee && <span title="assignee">@{s.assignee}</span>}
        {s.branch && <code className="chip-dep" title="branch">{s.branch}</code>}
        {s.pr && (
          <a className={`pill pill-pr-${s.pr.state ?? 'open'}`} href={s.pr.url} target="_blank" rel="noreferrer" onClick={stop} data-testid={`story-pr-${s.id}`}>
            {[s.pr.number != null ? `#${s.pr.number}` : 'PR', s.pr.state].filter(Boolean).join(' ')}{s.pr.review ? ` · ${s.pr.review.replace('_', ' ')}` : ''}
          </a>
        )}
      </span>
      <span className="tc-meta">
        <span className="muted" data-testid={`story-progress-${s.id}`}><Icon n="tasks" /> {tasks.length} task{tasks.length === 1 ? '' : 's'} ({done} done)</span>
        {agents.map((a) => <span key={a.id} className="tc-owner"><StatusIcon state={nodeState(c, a.status.state)} id={`story-${c.hid}-${s.id}-${a.id}`} />{a.id}</span>)}
      </span>
    </div>
  );
}

export function StoryBoard({ c, story, onStory }: { c: Corral; story?: string; onStory: (id?: string) => void }) {
  return (
    <section className="lane story-board" data-testid={`story-board-${c.hid}`}>
      <header className="lane-head"><b>Stories</b> <span className="muted">{c.stories.length}</span></header>
      <div className="cols">
        {STORY_STATES.map((state) => {
          const col = STORY_COLUMNS[state];
          const ss = c.stories.filter((s) => storyColumnOf(s) === state);
          return (
            <div key={state} className="col-x" data-testid={`story-col-${c.hid}-${state}`}>
              <h4><span className={`st st-${col.icon}`}><Icon n={col.icon} /></span> {col.name} <span className="muted">{ss.length}</span></h4>
              {ss.length === 0 && <p className="empty-note small-note">No stories</p>}
              {ss.map((s) => <StoryCard key={s.id} c={c} s={s} selected={story === s.id} onSelect={() => onStory(story === s.id ? undefined : s.id)} />)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
