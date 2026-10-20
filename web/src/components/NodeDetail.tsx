import type { Agent, Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg, relTime, type Node } from '../util';
import { AgentScreen } from './AgentScreen';
import { Reports } from './Reports';

const Dl = ({ rows }: { rows: [string, React.ReactNode][] }) => (
  <dl className="row mb-3">
    {rows.map(([k, v]) => (
      <div className="d-flex" key={k}><dt className="col-4 col-lg-3">{k}</dt><dd className="col mb-1">{v}</dd></div>
    ))}
  </dl>
);

export function NodeDetail({ corral: c, node, onError }: { corral: Corral; node: Node; onError: (m: string) => void }) {
  if (node.kind === 'drover') {
    const d = c.drover;
    return (
      <div data-testid="drover-detail">
        <h2 className="h4">drover <code>{c.hid}</code></h2>
        <Dl rows={[
          ['state', <span data-testid="drover-state">{d.status.state}</span>],
          ['model', d.model ?? ''],
          ['mode', d.mode ?? ''],
          ['updated', relTime(d.status.at)],
          ['session', d.session_id ?? ''],
        ]} />
      </div>
    );
  }
  const a: Agent | undefined = c.agents.find((x) => x.id === node.id);
  if (!a) return <p data-testid="agent-gone" className="text-body-secondary">Agent {node.id} no longer exists</p>;
  return (
    <div data-testid="agent-detail">
      <h2 className="h4 d-flex justify-content-between">
        <span>{a.id} <span data-testid="agent-detail-state" className="badge text-bg-secondary">{a.status.state}</span></span>
        <button className="btn btn-sm btn-outline-danger" data-testid={`agent-kill-${a.id}`} onClick={() => api.kill(c.hid, a.id).catch((e) => onError(errMsg(e)))}>Kill</button>
      </h2>
      <Dl rows={[
        ['model', a.model ?? ''],
        ['purpose', a.purpose ?? ''],
        ['tab/pane', `${a.tab_name ?? ''}${a.pane_id ? `/${a.pane_id}` : ''}`],
        ['updated', relTime(a.status.at)],
        ['cwd', a.cwd ?? ''],
      ]} />
      <AgentScreen hid={c.hid} id={a.id} />
      <Reports hid={c.hid} ids={c.reports.filter((r) => r === a.id)} />
    </div>
  );
}
