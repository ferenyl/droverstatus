import { useEffect, useState } from 'react';
import { api } from '../api';
import { errMsg } from '../util';

export function AgentScreen({ hid, id, onClose }: { hid: string; id: string; onClose: () => void }) {
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
    <section data-testid="agent-screen">
      <header>
        {id} <button data-testid="agent-screen-close" onClick={onClose}>Stäng</button>
      </header>
      <pre data-testid="agent-screen-body">{screen}</pre>
    </section>
  );
}
