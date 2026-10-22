// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Corral, Task } from '@droverstatus/shared';
import { App } from './App';
import { Board } from './components/Board';
import { CorralList } from './components/CorralList';
import { CorralView } from './components/CorralView';
import { NodeDetail } from './components/NodeDetail';
import { Modal } from './components/Modal';
import { Reports } from './components/Reports';
import { TaskList } from './components/TaskList';
import { build, buildBoard, isBoard, parse, parseBoard, tabOf, tabsFor } from './route';

const noop = () => {};
const jres = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const corral = (o: Partial<Corral> = {}): Corral => ({
  hid: 'aaaaaaaa', session: 's', project: '/p', slug: 'one', closed: false, liveness: 'alive',
  drover: { status: { state: 'idle' } }, agents: [], tasks: [], stories: [], messages: [], messages_total: o.messages?.length ?? 0, messages_offset: 0, inbox: [], reports: [], report_meta: {}, docs: [], ...o,
});
const task = (id: string, state: string, o: Partial<Task> = {}): Task => ({ id, title: id.toUpperCase(), acceptance: [], depends_on: [], state, ...o });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('route', () => {
  it('parse edge cases', () => {
    expect(parse('/board')).toBeUndefined();
    expect(parse('/corrals')).toBeUndefined();
    expect(parse('/corrals/zzzzzzzz')).toEqual({ hid: 'zzzzzzzz', tab: undefined });
    expect(parse('/corrals/abc/bogus')).toEqual({ hid: 'abc', tab: undefined });
    expect(parse('/corrals/abc/messages')).toEqual({ hid: 'abc', tab: 'messages' });
    expect(parse('/corrals/abc/agents/a%201/tasks')).toEqual({ hid: 'abc', node: { kind: 'agent', id: 'a 1' }, tab: 'tasks' });
    expect(parse('/corrals/abc/drover/nope')).toEqual({ hid: 'abc', node: { kind: 'drover' }, tab: undefined });
  });
  it('build and tabOf', () => {
    expect(build()).toBe('/');
    expect(build({ hid: 'abc', tab: 'reports' })).toBe('/corrals/abc/reports');
    expect(build({ hid: 'abc', node: { kind: 'agent', id: 'a 1' }, tab: 'tasks' })).toBe('/corrals/abc/agents/a%201/tasks');
    expect(build({ hid: 'abc', tab: 'screen' })).toBe('/corrals/abc');
    expect(tabsFor()).not.toContain('screen');
    expect(tabsFor({ kind: 'drover' })).toContain('screen');
    expect(tabOf({ hid: 'a', node: { kind: 'drover' }, tab: 'screen' })).toBe('screen');
  });
  it('board helpers', () => {
    expect(isBoard('/board')).toBe(true);
    expect(isBoard('/board/x')).toBe(true);
    expect(isBoard('/boardx')).toBe(false);
    expect(parseBoard('')).toEqual({ corrals: [], closed: false });
    expect(buildBoard({ corrals: [], closed: true })).toBe('/board?closed=1');
  });
});

describe('Board', () => {
  const c1 = corral({
    agents: [{ id: 'al', status: { state: 'busy' } }],
    tasks: [task('t1', 'todo'), task('t2', 'weird'), task('t3', 'failed', { owner: 'drover', depends_on: ['t1', 't2'], attempts: 2 }), task('t4', 'done', { attempts: 3 })],
  });
  const c2 = corral({ hid: 'bbbbbbbb', slug: 'two' });
  const c3 = corral({ hid: 'cccccccc', slug: 'three', closed: true });
  const base = { filter: { corrals: [], closed: false }, onFilter: noop, onOpen: noop };

  it('columns, names and lane per corral', () => {
    render(<Board corrals={[c1, c2]} {...base} />);
    const cols = within('board-col-aaaaaaaa-todo');
    expect(cols).toContain('Backlog');
    expect(within('board-col-aaaaaaaa-in_progress')).toContain('In progress');
    expect(within('board-col-aaaaaaaa-done')).toContain('Done');
    expect(within('board-col-aaaaaaaa-failed')).toContain('Failed');
    expect(screen.getByTestId('board-lane-aaaaaaaa').textContent).toContain('one');
    expect(screen.getByTestId('board-lane-bbbbbbbb').textContent).toContain('two');
  });
  it('unknown state lands in Backlog', () => {
    render(<Board corrals={[c1]} {...base} />);
    expect(screen.getByTestId('board-col-aaaaaaaa-todo').contains(screen.getByTestId('task-card-aaaaaaaa-t2'))).toBe(true);
  });
  it('card content: depends-on, attempts, attention only >=3', () => {
    render(<Board corrals={[c1]} {...base} />);
    const failed = screen.getByTestId('task-card-aaaaaaaa-t3').textContent!;
    expect(failed).toContain('depends on');
    expect(failed).toContain('t1');
    expect(failed).toContain('t2');
    expect(failed).toContain('drover');
    expect(failed).toContain('2×');
    expect(screen.queryByTestId('card-attention-aaaaaaaa-t3')).toBeNull();
    expect(screen.getByTestId('card-attention-aaaaaaaa-t4')).not.toBeNull();
    expect(screen.getByTestId('task-card-aaaaaaaa-t1').textContent).not.toContain('depends on');
  });
  it('owner drover card opens without agent', () => {
    const onOpen = vi.fn();
    render(<Board corrals={[c1]} {...base} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId('task-card-aaaaaaaa-t3'));
    expect(onOpen).toHaveBeenCalledWith('aaaaaaaa', undefined);
  });
  it('empty states', () => {
    render(<Board corrals={[c2, c3]} {...base} filter={{ corrals: [], closed: false }} />);
    expect(screen.getAllByText('No tasks')).toHaveLength(4);
    expect(screen.queryByTestId('board-lane-cccccccc')).toBeNull();
    cleanup();
    render(<Board corrals={[c3]} {...base} />);
    expect(screen.getByTestId('board-empty')).not.toBeNull();
  });
  it('show-closed toggle reports filter and reveals closed lanes', () => {
    const onFilter = vi.fn();
    const { rerender } = render(<Board corrals={[c2, c3]} {...base} onFilter={onFilter} />);
    fireEvent.click(screen.getByTestId('board-show-closed'));
    expect(onFilter).toHaveBeenCalledWith({ corrals: [], closed: true });
    rerender(<Board corrals={[c2, c3]} {...base} filter={{ corrals: [], closed: true }} />);
    expect(screen.getByTestId('board-lane-cccccccc')).not.toBeNull();
  });
  it('selected closed corral stays visible; filter all clears; chip removes', () => {
    const onFilter = vi.fn();
    render(<Board corrals={[c1, c3]} {...base} onFilter={onFilter} filter={{ corrals: ['cccccccc'], closed: false }} />);
    expect(screen.getByTestId('board-lane-cccccccc')).not.toBeNull();
    expect(screen.queryByTestId('board-lane-aaaaaaaa')).toBeNull();
    fireEvent.click(screen.getByLabelText('Remove filter cccccccc'));
    expect(onFilter).toHaveBeenCalledWith({ corrals: [], closed: false });
    fireEvent.click(screen.getByTestId('board-filter'));
    fireEvent.click(screen.getByTestId('board-filter-all'));
    expect(onFilter).toHaveBeenLastCalledWith({ corrals: [], closed: false });
  });
  it('lane collapses', () => {
    render(<Board corrals={[c1]} {...base} />);
    fireEvent.click(screen.getByTestId('board-lane-toggle-aaaaaaaa'));
    expect(screen.queryByTestId('board-col-aaaaaaaa-todo')).toBeNull();
  });
});

function within(id: string) {
  return screen.getByTestId(id).textContent!;
}

describe('CorralList extras', () => {
  it('closing pill and tree filter', () => {
    const cs = [corral({ closing: true, agents: [{ id: 'worker', status: { state: 'idle' } }] }), corral({ hid: 'bbbbbbbb', slug: 'two' })];
    render(<CorralList corrals={cs} showClosed={false} onShowClosed={noop} onSelect={noop} />);
    expect(screen.getByTestId('closing-aaaaaaaa')).not.toBeNull();
    expect(screen.queryByTestId('closing-bbbbbbbb')).toBeNull();
    fireEvent.change(screen.getByTestId('tree-filter'), { target: { value: 'worker' } });
    expect(screen.queryByTestId('tree-corral-bbbbbbbb')).toBeNull();
    fireEvent.change(screen.getByTestId('tree-filter'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('tree-empty').textContent).toContain('match');
  });
  it('no closing pill once closed', () => {
    render(<CorralList corrals={[corral({ closing: true, closed: true })]} showClosed onShowClosed={noop} onSelect={noop} />);
    expect(screen.queryByTestId('closing-aaaaaaaa')).toBeNull();
  });
});

describe('CorralView', () => {
  const props = { tab: 'overview' as const, onTab: noop, onOpenAgent: noop, onClose: noop, onError: noop };
  it('has no composer; Screen button opens agent', () => {
    const onOpenAgent = vi.fn();
    const c = corral({ agents: [{ id: 'a1', status: { state: 'idle' } }] });
    const { rerender } = render(<CorralView corral={c} {...props} onOpenAgent={onOpenAgent} />);
    fireEvent.click(screen.getByTestId('agent-screen-a1'));
    expect(onOpenAgent).toHaveBeenCalledWith('a1');
    expect(screen.queryByTestId('message-input')).toBeNull();
    rerender(<CorralView corral={c} {...props} tab="messages" onOpenAgent={onOpenAgent} />);
    expect(screen.queryByTestId('message-input')).toBeNull();
  });
  it('closing pill hidden when closed', () => {
    const { rerender } = render(<CorralView corral={corral({ closing: true })} {...props} />);
    expect(screen.getByTestId('corral-closing')).not.toBeNull();
    rerender(<CorralView corral={corral({ closing: true, closed: true })} {...props} />);
    expect(screen.queryByTestId('corral-closing')).toBeNull();
  });
  it('tab clicks call onTab', () => {
    const onTab = vi.fn();
    render(<CorralView corral={corral()} {...props} onTab={onTab} />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    expect(onTab).toHaveBeenCalledWith('tasks');
  });
});

describe('NodeDetail', () => {
  const c = corral({
    agents: [{ id: 'a1', status: { state: 'idle' } }],
    tasks: [task('t1', 'done', { owner: 'drover' }), task('t2', 'todo', { owner: 'a1' })],
    messages: [{ at: 'x', from: 'drover', to: 'a1', text: 'hi' }, { at: 'y', from: 'a1', to: 'drover', text: 'yo' }, { at: 'z', from: 'a1', to: 'b', text: 'zz' }],
    reports: ['drover', 'a1'],
  });
  const stubOk = (text = 'rep') =>
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (u: string) => (u.includes('/reports/') ? new Response(text) : jres(200, { screen: 'scr' }))));
  const props = { onTab: noop, onError: noop };

  it('drover: own tasks, messages, report', async () => {
    stubOk('task: x | status: done');
    const d = { kind: 'drover' } as const;
    const { rerender } = render(<NodeDetail corral={c} node={d} tab="tasks" {...props} />);
    expect(screen.queryByTestId('task-row-t1')).not.toBeNull();
    expect(screen.queryByTestId('task-row-t2')).toBeNull();
    rerender(<NodeDetail corral={c} node={d} tab="messages" {...props} />);
    expect(screen.getAllByTestId('message-item')).toHaveLength(2);
    rerender(<NodeDetail corral={c} node={d} tab="reports" {...props} />);
    expect(await screen.findByTestId('report-field-status')).not.toBeNull();
    expect(screen.queryByTestId('report-a1')).toBeNull();
  });
  it('agent: own tasks/messages/report', async () => {
    stubOk('plain');
    const a = { kind: 'agent', id: 'a1' } as const;
    const { rerender } = render(<NodeDetail corral={c} node={a} tab="tasks" {...props} />);
    expect(screen.queryByTestId('task-row-t2')).not.toBeNull();
    expect(screen.queryByTestId('task-row-t1')).toBeNull();
    rerender(<NodeDetail corral={c} node={a} tab="messages" {...props} />);
    expect(screen.getAllByTestId('message-item')).toHaveLength(3);
    rerender(<NodeDetail corral={c} node={a} tab="reports" {...props} />);
    await waitFor(() => expect(screen.getByTestId('report-body').textContent).toBe('plain'));
  });
  it('empty tasks state and tab labels', () => {
    render(<NodeDetail corral={corral()} node={{ kind: 'drover' }} tab="tasks" {...props} />);
    expect(screen.getByText(/No tasks owned by drover/)).not.toBeNull();
    expect(screen.getByTestId('tab-tasks').textContent).toContain('(0)');
  });
  it('composer on drover and agent screens', async () => {
    stubOk();
    const { rerender } = render(<NodeDetail corral={c} node={{ kind: 'drover' }} tab="screen" {...props} />);
    expect(screen.queryByTestId('message-input')).not.toBeNull();
    rerender(<NodeDetail corral={c} node={{ kind: 'agent', id: 'a1' }} tab="screen" {...props} />);
    expect(screen.getByLabelText('Message to a1')).toBeTruthy();
    await act(async () => {});
  });
  it('screen unavailable then retry recovers', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jres(500, { error: 'no pane' }))
      .mockResolvedValue(jres(200, { screen: 'back' }));
    vi.stubGlobal('fetch', f);
    render(<NodeDetail corral={c} node={{ kind: 'agent', id: 'a1' }} tab="screen" {...props} />);
    expect((await screen.findByTestId('agent-screen-unavailable')).textContent).toContain('no pane');
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByTestId('agent-screen-body').textContent).toBe('back'));
  });
  it('composer sends to drover', async () => {
    const f = vi.fn().mockResolvedValue(jres(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    render(<NodeDetail corral={c} node={{ kind: 'drover' }} tab="messages" {...props} />);
    fireEvent.change(screen.getByTestId('message-input'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('message-send'));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(f.mock.calls[0][0]).toBe('/api/corrals/aaaaaaaa/messages');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ message: 'hello', to: 'drover' });
  });
});

describe('TaskList', () => {
  it('states and attention', () => {
    render(<TaskList tasks={[task('t1', 'in_progress'), task('t2', 'failed', { attempts: 3 }), task('t3', 'done', { attempts: 2 })]} />);
    expect(screen.getByTestId('task-row-t1').textContent).toContain('in_progress');
    expect(screen.getByTestId('task-row-t2').textContent).toContain('failed');
    expect(screen.queryByTestId('task-attention-t2')).not.toBeNull();
    expect(screen.queryByTestId('task-attention-t3')).toBeNull();
  });
});

describe('Reports', () => {
  it('one-line report renders fields; status class', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('task: a | status: failed | summary: x: y')));
    render(<Reports hid="aaaaaaaa" ids={['a1']} auto />);
    expect((await screen.findByTestId('report-field-summary')).textContent).toBe('x: y');
    expect(screen.getByTestId('report-field-status').className).toContain('rs-failed');
    expect(screen.queryByTestId('report-a1')).toBeNull();
  });
  it('multi-report picker; no reports; fetch error', async () => {
    const f = vi.fn().mockImplementation(async (u: string) => (u.endsWith('/b') ? jres(404, { error: 'x' }) : new Response('# md\nbody')));
    vi.stubGlobal('fetch', f);
    const { rerender } = render(<Reports hid="aaaaaaaa" ids={['a', 'b']} />);
    expect(screen.queryByTestId('report-body')).toBeNull();
    fireEvent.click(screen.getByTestId('report-a'));
    expect((await screen.findByTestId('report-body')).textContent).toBe('# md\nbody');
    fireEvent.click(screen.getByTestId('report-b'));
    await waitFor(() => expect(screen.getByTestId('report-body').textContent).toBe('(no report)'));
    rerender(<Reports hid="aaaaaaaa" ids={[]} />);
    expect(screen.getByText('No reports yet')).not.toBeNull();
  });
});

describe('Modal', () => {
  it('calls showModal and closes on cancel (Esc)', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    (HTMLDialogElement.prototype as any).showModal = showModal;
    const onClose = vi.fn();
    render(<Modal testId="m" title="T" onClose={onClose}>body</Modal>);
    expect(showModal).toHaveBeenCalledTimes(1);
    const d = screen.getByTestId('m');
    expect(d.getAttribute('aria-labelledby')).toBeTruthy();
    const ev = new Event('cancel', { cancelable: true });
    d.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
    delete (HTMLDialogElement.prototype as any).showModal;
  });
  it('falls back to open attribute without showModal', () => {
    render(<Modal testId="m" title="T" onClose={noop}>body</Modal>);
    expect(screen.getByTestId('m').hasAttribute('open')).toBe(true);
  });
});

describe('App navigation', () => {
  let emit: (type: string, data: unknown) => void;
  class FakeES {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ls = new Map<string, (m: { data: string }) => void>();
    constructor() {
      emit = (type, data) => this.ls.get(type)?.({ data: JSON.stringify(data) });
      setTimeout(() => this.onopen?.());
    }
    addEventListener(t: string, f: (m: { data: string }) => void) { this.ls.set(t, f); }
    close() {}
  }
  const c1 = corral({
    agents: [{ id: 'a1', status: { state: 'idle' } }],
    tasks: [task('t1', 'in_progress', { owner: 'a1' }), task('t2', 'todo')],
  });
  const c2 = corral({ hid: 'bbbbbbbb', slug: 'two', closed: true });
  const start = async (url: string) => {
    history.replaceState(null, '', url);
    vi.stubGlobal('EventSource', FakeES);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jres(200, { screen: 's' })));
    render(<App />);
    await act(async () => { emit('snapshot', { type: 'snapshot', corrals: [c1, c2] }); });
  };
  beforeEach(() => history.replaceState(null, '', '/'));

  it('console/board nav toggles views and URL', async () => {
    await start('/corrals/aaaaaaaa');
    expect(screen.getByTestId('nav-console').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('corral-view')).not.toBeNull();
    fireEvent.click(screen.getByTestId('nav-board'));
    expect(screen.getByTestId('board')).not.toBeNull();
    expect(location.pathname).toBe('/board');
    expect(screen.getByTestId('nav-board').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByTestId('nav-console'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa');
    expect(screen.getByTestId('corral-view')).not.toBeNull();
  });
  it('deep links', async () => {
    await start('/corrals/aaaaaaaa/agents/a1/tasks');
    expect(screen.getByTestId('agent-detail')).not.toBeNull();
    expect(screen.getByTestId('tabpanel-tasks')).not.toBeNull();
    expect(screen.getByTestId('tab-tasks').getAttribute('aria-selected')).toBe('true');
  });
  it('deep link to board with filter', async () => {
    await start('/board?corrals=bbbbbbbb');
    expect(screen.getByTestId('board-lane-bbbbbbbb')).not.toBeNull();
    expect(screen.queryByTestId('board-lane-aaaaaaaa')).toBeNull();
    fireEvent.click(screen.getByTestId('board-show-closed'));
    expect(location.search).toContain('closed=1');
    expect(location.search).toContain('corrals=bbbbbbbb');
  });
  it('unknown hid shows not-found', async () => {
    await start('/corrals/deadbeef');
    expect(screen.getByTestId('empty').textContent).toContain('deadbeef not found');
  });
  it('tree selection syncs URL and expands', async () => {
    await start('/');
    expect(screen.getByTestId('empty').textContent).toContain('Select a corral');
    fireEvent.click(screen.getByTestId('corral-item-aaaaaaaa'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa');
    expect(screen.getByTestId('tree-drover-aaaaaaaa')).not.toBeNull();
    fireEvent.click(screen.getByTestId('tree-agent-aaaaaaaa-a1'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa/agents/a1/screen');
    expect(screen.getByTestId('tree-agent-aaaaaaaa-a1').getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByTestId('tree-drover-aaaaaaaa'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa/drover/overview');
    expect(screen.getByTestId('tree-agent-aaaaaaaa-a1').getAttribute('aria-current')).toBeNull();
  });
  it('popstate updates selection', async () => {
    await start('/corrals/aaaaaaaa');
    history.pushState(null, '', '/corrals/aaaaaaaa/drover/tasks');
    await act(async () => { dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByTestId('drover-detail')).not.toBeNull();
    history.pushState(null, '', '/board');
    await act(async () => { dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByTestId('board')).not.toBeNull();
  });
  it('board card click navigates to owner screen / corral', async () => {
    await start('/board');
    fireEvent.click(screen.getByTestId('task-card-aaaaaaaa-t1'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa/agents/a1/screen');
    expect(screen.getByTestId('agent-detail')).not.toBeNull();
    fireEvent.click(screen.getByTestId('nav-board'));
    fireEvent.click(screen.getByTestId('task-card-aaaaaaaa-t2'));
    expect(location.pathname).toBe('/corrals/aaaaaaaa');
    expect(screen.getByTestId('corral-view')).not.toBeNull();
  });
  it('connection status and closing update live', async () => {
    await start('/corrals/aaaaaaaa');
    await waitFor(() => expect(screen.getByTestId('conn-status').textContent).toContain('online'));
    await act(async () => { emit('corral-updated', { type: 'corral-updated', hid: 'aaaaaaaa', corral: { ...c1, closing: true } }); });
    expect(screen.getByTestId('corral-closing')).not.toBeNull();
  });
});
