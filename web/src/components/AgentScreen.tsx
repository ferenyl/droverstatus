// SPDX-License-Identifier: GPL-3.0-only
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
    let t: ReturnType<typeof setTimeout> | undefined;
    let last: string | undefined;
    let delay = 2000;
    // no polling while the tab is hidden; back off while the screen is unchanged
    const tick = () => {
      if (document.hidden) return;
      api.screen(hid, id).then(
        (r) => {
          if (!live) return;
          setError('');
          setScreen(r.screen);
          delay = r.screen === last ? Math.min(delay * 1.5, 10_000) : 2000;
          last = r.screen;
          t = setTimeout(tick, delay);
        },
        (e) => live && setError(errMsg(e)),
      );
    };
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(t);
      delay = 2000;
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return () => {
      live = false;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hid, id, attempt]);
  return (
    <section data-testid="agent-screen" className="term">
      <header>
        <Icon n="term" /> <code>{id}</code>
        {!error && <span className="live">live</span>}
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
