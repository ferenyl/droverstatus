// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import { MODELS, PERM_MODES } from '@droverstatus/shared';
import type { Agent, Model } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

/** model, permission mode and purpose relaunch or retype into the agent; PR link pushes its branch */
export function AgentControls({ hid, agent: a, onError }: { hid: string; agent: Agent; onError: (m: string) => void }) {
  const [model, setModel] = useState(a.model ?? 'sonnet');
  const [perm, setPerm] = useState(a.perm ?? 'default');
  const [purpose, setPurpose] = useState(a.purpose ?? '');
  const [busy, setBusy] = useState(false);
  const [pr, setPr] = useState('');
  const run = (f: () => Promise<unknown>) => {
    setBusy(true);
    return f().catch((e) => onError(errMsg(e))).finally(() => setBusy(false));
  };
  return (
    <section className="card-x vstack gap-2" data-testid="agent-controls">
      <h3><Icon n="overview" /> Control</h3>
      <label>model
        <span className="hstack gap-2">
          <select className="form-control" data-testid="agent-model" value={model} onChange={(e) => setModel(e.target.value)}>
            {MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button className="btn btn-sm btn-outline theme-primary" data-testid="agent-model-apply" disabled={busy || model === a.model} onClick={() => run(() => api.model(hid, a.id, model as Model))}>Apply</button>
        </span>
      </label>
      <label>permission mode
        <span className="hstack gap-2">
          <select className="form-control" data-testid="agent-perm" value={perm} onChange={(e) => setPerm(e.target.value)}>
            {PERM_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button className="btn btn-sm btn-outline theme-primary" data-testid="agent-perm-apply" disabled={busy || perm === (a.perm ?? 'default')} onClick={() => confirm(`Relaunch ${a.id} in ${perm} mode?`) && run(() => api.perm(hid, a.id, perm))}>Apply</button>
        </span>
      </label>
      <label>purpose
        <textarea className="form-control" data-testid="agent-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <span className="hstack gap-2">
        <button className="btn btn-sm btn-outline theme-primary" data-testid="agent-purpose-apply" disabled={busy || !purpose.trim() || purpose === a.purpose} onClick={() => confirm(`Change ${a.id}'s purpose and relaunch it?`) && run(() => api.purpose(hid, a.id, purpose))}>Save purpose</button>
        <button className="btn btn-sm btn-outline theme-secondary" data-testid="agent-prlink" disabled={busy} onClick={() => confirm(`Push ${a.id}'s branch and get a create-PR link?`) && run(() => api.prlink(hid, a.id).then((r) => setPr(r.url)))}><Icon n="send" /> PR link</button>
        {pr && <a data-testid="agent-prlink-url" href={pr} target="_blank" rel="noopener noreferrer">{pr}</a>}
      </span>
    </section>
  );
}
