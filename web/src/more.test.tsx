// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Corral } from '@droverstatus/shared';
import { api, ApiFail } from './api';
import { relTime, errMsg, nodeState } from './util';
import { CloseDialog } from './components/CloseDialog';
import { NewDroverDialog } from './components/NewDroverDialog';
import { AgentScreen } from './components/AgentScreen';
import { CorralView } from './components/CorralView';
import { CorralList } from './components/CorralList';
import { NodeDetail } from './components/NodeDetail';
import { build, parse, tabOf, parseBoard, buildBoard } from './route';
import { Board } from './components/Board';

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const mockFetch = (...rs: Response[]) => {
  const f = vi.fn();
  rs.forEach((r) => f.mockResolvedValueOnce(r));
  vi.stubGlobal('fetch', f);
  return f;
};
const corral = (o: Partial<Corral> = {}): Corral => ({
  hid: 'aaaaaaaa', session: 's', project: '/p', slug: 'x', closed: false, liveness: 'alive',
  drover: { status: { state: 'idle' } }, agents: [], tasks: [], stories: [], messages: [], inbox: [], reports: [], ...o,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api/util', () => {
  it('throws ApiFail with body and parses text', async () => {
    mockFetch(res(409, { error: 'boom', worktrees: [] }));
    await expect(api.close('aaaaaaaa')).rejects.toMatchObject({ status: 409, body: { error: 'boom' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# md', { headers: { 'content-type': 'text/markdown' } })));
    expect(await api.report('aaaaaaaa', 'a')).toBe('# md');
  });
  it('relTime and errMsg', () => {
    const now = Date.parse('2026-01-01T00:10:00Z');
    expect(relTime('2026-01-01T00:09:30Z', now)).toBe('30s ago');
    expect(relTime('2026-01-01T00:00:00Z', now)).toBe('10m ago');
    expect(relTime(undefined)).toBe('');
    expect(errMsg(new ApiFail({ error: 'e', stderr: 's' }, 500))).toBe('e: s');
  });
});

describe('CloseDialog', () => {
  it('409 -> worktree list -> remove', async () => {
    const f = mockFetch(
      res(409, { error: 'worktrees exist', worktrees: [{ path: '/w', branch: 'b', dirty: true }] }),
      res(200, { ok: true }),
    );
    const onClose = vi.fn();
    render(<CloseDialog hid="aaaaaaaa" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('close-confirm'));
    await screen.findByTestId('worktree-dirty');
    fireEvent.click(screen.getByTestId('close-remove'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(f.mock.calls[1][0]).toBe('/api/corrals/aaaaaaaa?worktrees=remove');
  });
});

describe('NewDroverDialog', () => {
  it('validates slug, submits, shows error', async () => {
    mockFetch(res(400, { error: 'project dir not found' }));
    render(<NewDroverDialog onClose={() => {}} onCreated={() => {}} />);
    const btn = screen.getByTestId('new-submit') as HTMLButtonElement;
    fireEvent.change(screen.getByTestId('new-slug'), { target: { value: 'Bad Slug' } });
    fireEvent.change(screen.getByTestId('new-dir'), { target: { value: '/x' } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('new-slug'), { target: { value: 'good-slug' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect((await screen.findByTestId('new-error')).textContent).toContain('project dir not found');
  });
});

describe('AgentScreen', () => {
  it('polls and stops on unmount', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation(async () => res(200, { screen: 'hello' }));
    vi.stubGlobal('fetch', f);
    const { unmount } = render(<AgentScreen hid="aaaaaaaa" id="a1" onClose={() => {}} />);
    await act(async () => {});
    expect(screen.getByTestId('agent-screen-body').textContent).toBe('hello');
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(f).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(4000);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('CorralView', () => {
  const noop = () => {};
  it('shows close/revive by state', () => {
    const { rerender } = render(<CorralView corral={corral({ liveness: 'dead' })} tab="overview" onTab={noop} onOpenAgent={noop} onClose={noop} onError={noop} />);
    expect(screen.queryByTestId('revive-btn')).not.toBeNull();
    expect(screen.queryByTestId('close-btn')).not.toBeNull();
    rerender(<CorralView corral={corral({ liveness: 'alive' })} tab="overview" onTab={noop} onOpenAgent={noop} onClose={noop} onError={noop} />);
    expect(screen.queryByTestId('revive-btn')).toBeNull();
    rerender(<CorralView corral={corral({ closed: true, liveness: 'dead' })} tab="overview" onTab={noop} onOpenAgent={noop} onClose={noop} onError={noop} />);
    expect(screen.queryByTestId('revive-btn')).toBeNull();
    expect(screen.queryByTestId('close-btn')).toBeNull();
  });
});

describe('tree', () => {
  it('expands corral, selects agent', () => {
    const onSelect = vi.fn();
    const c = corral({ agents: [{ id: 'a1', status: { state: 'blocked' } }] });
    render(<CorralList corrals={[c]} showClosed={false} onShowClosed={() => {}} onSelect={onSelect} />);
    expect(screen.queryByTestId('tree-agent-aaaaaaaa-a1')).toBeNull();
    fireEvent.click(screen.getByTestId('tree-toggle-aaaaaaaa'));
    expect(screen.getByTestId('tree-drover-aaaaaaaa')).not.toBeNull();
    expect(screen.getByTestId('status-agent-aaaaaaaa-a1').dataset.state).toBe('blocked');
    fireEvent.click(screen.getByTestId('tree-agent-aaaaaaaa-a1'));
    expect(onSelect).toHaveBeenCalledWith('aaaaaaaa', { kind: 'agent', id: 'a1' });
    fireEvent.click(screen.getByTestId('corral-item-aaaaaaaa'));
    expect(onSelect).toHaveBeenLastCalledWith('aaaaaaaa');
  });
  it('agent detail shows kill', () => {
    const c = corral({ agents: [{ id: 'a1', model: 'opus', purpose: 'p', status: { state: 'idle' } }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { screen: 's' })));
    render(<NodeDetail corral={c} node={{ kind: 'agent', id: 'a1' }} tab="overview" onTab={() => {}} onError={() => {}} />);
    expect(screen.getByTestId('agent-kill-a1')).not.toBeNull();
    expect(screen.getByTestId('agent-detail').textContent).toContain('opus');
  });
});

describe('tree details', () => {
  it('filters closed corrals and sets aria', () => {
    const cs = [corral(), corral({ hid: 'bbbbbbbb', closed: true })];
    const props = { onShowClosed: () => {}, onSelect: () => {} };
    const { rerender } = render(<CorralList corrals={cs} showClosed={false} selected="aaaaaaaa" {...props} />);
    expect(screen.queryByTestId('tree-corral-bbbbbbbb')).toBeNull();
    expect(screen.getByTestId('corral-item-aaaaaaaa').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('tree-toggle-aaaaaaaa').getAttribute('aria-expanded')).toBe('true');
    rerender(<CorralList corrals={cs} showClosed {...props} />);
    expect(screen.getByTestId('tree-corral-bbbbbbbb')).not.toBeNull();
  });
  it('nodeState maps closed/dead over agent state', () => {
    expect(nodeState(corral({ closed: true }), 'busy')).toBe('closed');
    expect(nodeState(corral({ liveness: 'dead' }), 'busy')).toBe('dead');
    expect(nodeState(corral(), 'busy')).toBe('busy');
  });
  it('NodeDetail agent-gone and drover', () => {
    const { rerender } = render(<NodeDetail corral={corral()} node={{ kind: 'agent', id: 'zz' }} tab="screen" onTab={() => {}} onError={() => {}} />);
    expect(screen.getByTestId('agent-gone')).not.toBeNull();
    rerender(<NodeDetail corral={corral({ drover: { model: 'opus', status: { state: 'busy' } } })} node={{ kind: 'drover' }} tab="overview" onTab={() => {}} onError={() => {}} />);
    expect(screen.getByTestId('drover-state').textContent).toBe('busy');
  });
});

describe('route', () => {
  it('parses and builds', () => {
    expect(parse('/corrals/abc')).toEqual({ hid: 'abc', tab: undefined });
    expect(parse('/corrals/abc/agents/a1/screen')).toEqual({ hid: 'abc', node: { kind: 'agent', id: 'a1' }, tab: 'screen' });
    expect(parse('/corrals/abc/drover/tasks')).toEqual({ hid: 'abc', node: { kind: 'drover' }, tab: 'tasks' });
    expect(parse('/')).toBeUndefined();
    expect(build({ hid: 'abc' })).toBe('/corrals/abc');
    expect(build({ hid: 'abc', node: { kind: 'agent', id: 'a1' } })).toBe('/corrals/abc/agents/a1/screen');
    expect(build({ hid: 'abc', node: { kind: 'drover' } })).toBe('/corrals/abc/drover/overview');
    expect(tabOf({ hid: 'abc', tab: 'screen' })).toBe('overview');
  });
});

describe('node tabs', () => {
  const c = corral({
    agents: [{ id: 'a1', status: { state: 'idle' } }],
    tasks: [{ id: 't1', title: 'T', acceptance: [], depends_on: [], owner: 'a1', state: 'done' }, { id: 't2', title: 'U', acceptance: [], depends_on: [], owner: 'b', state: 'todo' }],
    messages: [{ at: 'x', from: 'drover', to: 'a1', text: 'hi' }, { at: 'y', from: 'b', to: 'drover', text: 'no' }],
    reports: ['a1', 'b'],
  });
  it('agent shows only its own tasks/messages', () => {
    const node = { kind: 'agent', id: 'a1' } as const;
    const { rerender } = render(<NodeDetail corral={c} node={node} tab="tasks" onTab={() => {}} onError={() => {}} />);
    expect(screen.queryByTestId('task-row-t1')).not.toBeNull();
    expect(screen.queryByTestId('task-row-t2')).toBeNull();
    rerender(<NodeDetail corral={c} node={node} tab="messages" onTab={() => {}} onError={() => {}} />);
    expect(screen.getAllByTestId('message-item')).toHaveLength(1);
    expect(screen.queryByTestId('message-input')).toBeNull();
  });
  it('drover messages tab has composer', () => {
    render(<NodeDetail corral={c} node={{ kind: 'drover' }} tab="messages" onTab={() => {}} onError={() => {}} />);
    expect(screen.getAllByTestId('message-item')).toHaveLength(2);
    expect(screen.queryByTestId('message-input')).not.toBeNull();
  });
});

describe('AgentScreen error', () => {
  it('shows empty state and stops polling', async () => {
    vi.useFakeTimers();
    const f = vi.fn().mockImplementation(async () => res(500, { error: 'unknown agent: drover' }));
    vi.stubGlobal('fetch', f);
    render(<AgentScreen hid="aaaaaaaa" id="drover" />);
    await act(async () => {});
    expect(screen.getByTestId('agent-screen-unavailable').textContent).toContain('unknown agent: drover');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('compat', () => {
  it('parses one-line report', async () => {
    const { parseReport } = await import('./components/Reports');
    expect(parseReport('task: x | status: done | summary: a: b')).toEqual([['task', 'x'], ['status', 'done'], ['summary', 'a: b']]);
    expect(parseReport('# plain\nmore')).toBeUndefined();
  });
  it('in_progress, attempts>=3, closing, queued', () => {
    const c = corral({ closing: true, messages: [{ at: 'x', from: 'drover', to: 'a', text: 'go (queued)' }],
      tasks: [{ id: 't', title: 'T', acceptance: [], depends_on: [], state: 'in_progress', attempts: 3 }] });
    render(<CorralView corral={c} tab="tasks" onTab={() => {}} onOpenAgent={() => {}} onClose={() => {}} onError={() => {}} />);
    expect(screen.getByTestId('task-attention-t')).not.toBeNull();
    expect(screen.getByTestId('task-row-t').textContent).toContain('in_progress');
    expect(screen.getByTestId('corral-closing')).not.toBeNull();
    cleanup();
    render(<NodeDetail corral={c} node={{ kind: 'drover' }} tab="messages" onTab={() => {}} onError={() => {}} />);
    expect(screen.getByTestId('msg-queued')).not.toBeNull();
  });
});

describe('board', () => {
  const t = (id: string, state: string, o: Partial<import('@droverstatus/shared').Task> = {}) => ({ id, title: id.toUpperCase(), acceptance: ['x'], depends_on: [], state, ...o });
  const c1 = corral({ hid: 'aaaaaaaa', slug: 'one', agents: [{ id: 'al', status: { state: 'busy' } }], tasks: [t('t1', 'todo'), t('t2', 'in_progress', { owner: 'al', attempts: 3, depends_on: ['t1'] })] });
  const c2 = corral({ hid: 'bbbbbbbb', slug: 'two', tasks: [t('t3', 'done')] });
  const c3 = corral({ hid: 'cccccccc', slug: 'three', closed: true });
  it('places cards in columns, opens owner, filters', () => {
    const onOpen = vi.fn(), onFilter = vi.fn();
    const f = { corrals: [], closed: false };
    const { rerender } = render(<Board corrals={[c1, c2, c3]} filter={f} onFilter={onFilter} onOpen={onOpen} />);
    expect(screen.getByTestId('board-col-aaaaaaaa-in_progress').contains(screen.getByTestId('task-card-aaaaaaaa-t2'))).toBe(true);
    expect(screen.getByTestId('board-col-aaaaaaaa-todo').contains(screen.getByTestId('task-card-aaaaaaaa-t1'))).toBe(true);
    expect(screen.getByTestId('board-col-bbbbbbbb-failed').textContent).toContain('No tasks');
    expect(screen.queryByTestId('board-lane-cccccccc')).toBeNull();
    expect(screen.getByTestId('card-attention-aaaaaaaa-t2')).not.toBeNull();
    fireEvent.click(screen.getByTestId('task-card-aaaaaaaa-t2'));
    expect(onOpen).toHaveBeenCalledWith('aaaaaaaa', 'al');
    fireEvent.click(screen.getByTestId('task-card-aaaaaaaa-t1'));
    expect(onOpen).toHaveBeenLastCalledWith('aaaaaaaa', undefined);
    fireEvent.click(screen.getByTestId('board-filter'));
    fireEvent.click(screen.getByTestId('board-filter-bbbbbbbb'));
    expect(onFilter).toHaveBeenCalledWith({ corrals: ['bbbbbbbb'], closed: false });
    rerender(<Board corrals={[c1, c2, c3]} filter={{ corrals: ['bbbbbbbb'], closed: true }} onFilter={onFilter} onOpen={onOpen} />);
    expect(screen.queryByTestId('board-lane-aaaaaaaa')).toBeNull();
    expect(screen.getByTestId('board-lane-bbbbbbbb')).not.toBeNull();
  });
  it('board url round trip', () => {
    expect(parseBoard('?corrals=a,b&closed=1')).toEqual({ corrals: ['a', 'b'], closed: true });
    expect(buildBoard({ corrals: ['a', 'b'], closed: true })).toBe('/board?corrals=a,b&closed=1');
    expect(buildBoard({ corrals: [], closed: false })).toBe('/board');
  });
});
