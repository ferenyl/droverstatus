// SPDX-License-Identifier: GPL-3.0-only
import type { Corral } from '@droverstatus/shared';
import { Lane } from './Board';
import { api } from '../api';
import { Doc } from './Doc';
import { StoryBoard } from './StoryBoard';

export function CorralBoard(p: { corral: Corral; story?: string; onStory: (id?: string) => void; onOpen: (owner?: string) => void }) {
  const c = p.corral;
  const story = c.stories.some((s) => s.id === p.story) ? p.story : undefined;
  const tasks = story ? c.tasks.filter((t) => t.story === story) : c.tasks;
  return (
    <div className="corral-board" data-testid="corral-board">
      {c.stories.length > 0 && (
        <>
          <StoryBoard c={c} story={story} onStory={p.onStory} />
          <div className="board-bar flush-bar">
            <select className="form-select form-select-sm story-select" data-testid="corral-story-filter" aria-label="Filter by story" value={story ?? ''} onChange={(e) => p.onStory(e.target.value || undefined)}>
              <option value="">All stories</option>
              {c.stories.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.title}</option>)}
            </select>
          </div>
          {story && <Doc key={story} title={`Story ${story}`} testId="story-doc" load={() => api.story(c.hid, story)} />}
        </>
      )}
      <Lane c={c} tasks={tasks} onOpen={(_, owner) => p.onOpen(owner)} />
    </div>
  );
}
