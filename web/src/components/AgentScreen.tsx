import { useEffect, useState } from 'react';
import { api } from '../api';
import { errMsg } from '../util';

export function AgentScreen({ hid, id, onClose }: { hid: string; id: string; onClose?: () => void }) {
  const [screen, setScreen] = useState('');
  useEffect(() => {
    let live = true;
    const tick = () =>
      api.screen(hid, id).then(
        (r) => live && setScreen(r.screen),
        (e) => live && setScreen(errMsg(e)),
      );
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [hid, id]);
  return (
    <section data-testid="agent-screen" className="card my-3">
      <header className="card-header d-flex justify-content-between align-items-center">
        <code>{id}</code> {onClose && <button className="btn btn-sm btn-outline theme-secondary" data-testid="agent-screen-close" onClick={onClose}>Close</button>}
      </header>
      <pre data-testid="agent-screen-body" className="card-body screen m-0 overflow-auto small">{screen}</pre>
    </section>
  );
}
