import { useEffect, useState } from 'react';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

export function AgentScreen({ hid, id, onClose }: { hid: string; id: string; onClose?: () => void }) {
  const [screen, setScreen] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let t: ReturnType<typeof setInterval> | undefined;
    const tick = () =>
      api.screen(hid, id).then(
        (r) => live && (setError(''), setScreen(r.screen)),
        (e) => {
          if (!live) return;
          clearInterval(t);
          setError(errMsg(e));
        },
      );
    tick();
    t = setInterval(tick, 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [hid, id, attempt]);
  return (
    <section data-testid="agent-screen" className="term">
      <header>
        <Icon n="term" /> <code>{id}</code>
        {!error && <span className="live">live · 2s</span>}
        {onClose && <button className="btn btn-sm btn-outline theme-secondary" data-testid="agent-screen-close" onClick={onClose}>Close</button>}
      </header>
      {error ? (
        <div className="screen-off" data-testid="agent-screen-unavailable">
          <Icon n="screen" />
          <p>Screen not available for {id}</p>
          <small>{error}</small>
          <button className="btn btn-sm btn-outline theme-secondary" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      ) : (
        <pre data-testid="agent-screen-body" tabIndex={0} aria-label={`Screen of ${id}`}>{screen}</pre>
      )}
    </section>
  );
}
