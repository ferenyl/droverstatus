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
  drover: { status: { state: 'idle' } }, agents: [], tasks: [], messages: [], inbox: [], reports: [], ...o,
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
    const { rerender } = render(<CorralView corral={corral({ liveness: 'dead' })} onClose={noop} onError={noop} />);
    expect(screen.queryByTestId('revive-btn')).not.toBeNull();
    expect(screen.queryByTestId('close-btn')).not.toBeNull();
    rerender(<CorralView corral={corral({ liveness: 'alive' })} onClose={noop} onError={noop} />);
    expect(screen.queryByTestId('revive-btn')).toBeNull();
    rerender(<CorralView corral={corral({ closed: true, liveness: 'dead' })} onClose={noop} onError={noop} />);
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
    render(<NodeDetail corral={c} node={{ kind: 'agent', id: 'a1' }} onError={() => {}} />);
    expect(screen.getByTestId('agent-kill-a1')).not.toBeNull();
    fireEvent.click(screen.getByTestId('tab-overview'));
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
    expect(screen.getByTestId('tree-toggle-aaaaaaaa').getAttribute('aria-expanded')).toBe('false');
    rerender(<CorralList corrals={cs} showClosed {...props} />);
    expect(screen.getByTestId('tree-corral-bbbbbbbb')).not.toBeNull();
  });
  it('nodeState maps closed/dead over agent state', () => {
    expect(nodeState(corral({ closed: true }), 'busy')).toBe('closed');
    expect(nodeState(corral({ liveness: 'dead' }), 'busy')).toBe('dead');
    expect(nodeState(corral(), 'busy')).toBe('busy');
  });
  it('NodeDetail agent-gone and drover', () => {
    const { rerender } = render(<NodeDetail corral={corral()} node={{ kind: 'agent', id: 'zz' }} onError={() => {}} />);
    expect(screen.getByTestId('agent-gone')).not.toBeNull();
    rerender(<NodeDetail corral={corral({ drover: { model: 'opus', status: { state: 'busy' } } })} node={{ kind: 'drover' }} onError={() => {}} />);
    expect(screen.getByTestId('drover-state').textContent).toBe('busy');
  });
});
