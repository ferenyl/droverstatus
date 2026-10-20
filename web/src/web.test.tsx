// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Corral } from '@droverstatus/shared';
import { AgentTable } from './components/AgentTable';
import { applyEvent } from './useCorrals';

const corral = (hid: string): Corral => ({
  hid, session: 's', project: '/p', slug: 'x', closed: false, liveness: 'alive',
  drover: { status: { state: 'idle' } },
  agents: [{ id: 'a1', status: { state: 'blocked' } }],
  tasks: [], messages: [], inbox: [], reports: [],
});

describe('web', () => {
  it('applies events', () => {
    let m = applyEvent(new Map(), { type: 'snapshot', corrals: [corral('aaaaaaaa')] });
    m = applyEvent(m, { type: 'corral-updated', hid: 'bbbbbbbb', corral: corral('bbbbbbbb') });
    m = applyEvent(m, { type: 'corral-removed', hid: 'aaaaaaaa' });
    expect([...m.keys()]).toEqual(['bbbbbbbb']);
  });
  it('shows agent state', () => {
    render(<AgentTable corral={corral('aaaaaaaa')} onScreen={() => {}} onKill={() => {}} />);
    expect(screen.getByTestId('agent-state-a1').textContent).toBe('blocked');
  });
});
