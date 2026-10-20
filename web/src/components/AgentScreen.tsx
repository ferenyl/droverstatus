import { useEffect, useState } from 'react';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

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
    <section data-testid="agent-screen" className="term">
      <header>
        <Icon n="term" /> <code>{id}</code>
        <span className="live">live · 2s</span>
        {onClose && <button className="btn btn-sm btn-outline theme-secondary" data-testid="agent-screen-close" onClick={onClose}>Close</button>}
      </header>
      <pre data-testid="agent-screen-body" tabIndex={0} aria-label={`Screen of ${id}`}>{screen}</pre>
    </section>
  );
}
