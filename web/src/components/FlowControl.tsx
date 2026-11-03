// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import { FLOWS, TRACKER_STEPS } from '@droverstatus/shared';
import type { Flow } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';

export const flowLine = (f?: Flow | null) => (f ? `${f.name} [${f.steps.join(' ')}]${f.tracker?.length ? ` tracker=${f.tracker.join(',')}` : ''}` : 'ask');

/** shows and sets the corral's flow (drover.sh flow) */
export function FlowControl({ hid, flow, onError }: { hid: string; flow?: Flow; onError: (m: string) => void }) {
  const [name, setName] = useState(flow?.name ?? 'ask');
  const [tracker, setTracker] = useState<string[]>(flow?.tracker ?? []);
  const [busy, setBusy] = useState(false);
  const names = flow && !(FLOWS as readonly string[]).includes(flow.name) ? [...FLOWS, flow.name] : FLOWS;
  const toggle = (t: string) => setTracker((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const apply = () => {
    setBusy(true);
    api.flow(hid, name === 'ask' ? { name } : { name, tracker }).catch((e) => onError(errMsg(e))).finally(() => setBusy(false));
  };
  return (
    <span className="hstack gap-2" data-testid="flow">
      <span className="mono" data-testid="flow-line">{flowLine(flow)}</span>
      <select className="form-control" data-testid="flow-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="flow">
        {names.map((n) => <option key={n}>{n}</option>)}
      </select>
      {name !== 'ask' && TRACKER_STEPS.map((t) => (
        <label key={t} className="nowrap"><input type="checkbox" data-testid={`flow-tracker-${t}`} checked={tracker.includes(t)} onChange={() => toggle(t)} /> {t}</label>
      ))}
      <button className="btn btn-sm btn-outline theme-primary" data-testid="flow-apply" disabled={busy} onClick={apply}>Set</button>
    </span>
  );
}
