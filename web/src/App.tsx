import { useEffect, useState } from 'react';
import { useCorrals } from './useCorrals';
import { CorralList } from './components/CorralList';
import { CorralView } from './components/CorralView';
import { AgentScreen } from './components/AgentScreen';
import { NewDroverDialog } from './components/NewDroverDialog';
import { CloseDialog } from './components/CloseDialog';

const notify = (msg: string) => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(msg);
};

export function App() {
  const { corrals, connected } = useCorrals((prev, e) => {
    if (e.type !== 'corral-updated') return;
    const old = prev.get(e.hid);
    for (const a of e.corral.agents)
      if (a.status.state === 'blocked' && old?.agents.find((o) => o.id === a.id)?.status.state !== 'blocked')
        notify(`${e.corral.slug}: ${a.id} blocked`);
  });
  const [selected, setSelected] = useState<string>();
  const [showClosed, setShowClosed] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [screen, setScreen] = useState<string>();
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const list = [...corrals.values()];
  const current = selected ? corrals.get(selected) : undefined;
  return (
    <div className="app">
      <span data-testid="conn-status">{connected ? 'online' : 'offline'}</span>
      <CorralList
        corrals={list}
        selected={selected}
        showClosed={showClosed}
        onShowClosed={setShowClosed}
        onSelect={(h) => { setSelected(h); setScreen(undefined); }}
        onNew={() => setNewOpen(true)}
      />
      {current ? (
        <>
          <CorralView corral={current} onScreen={setScreen} onClose={() => setClosing(true)} onError={setToast} />
          {screen && <AgentScreen hid={current.hid} id={screen} onClose={() => setScreen(undefined)} />}
          {closing && <CloseDialog hid={current.hid} onClose={() => setClosing(false)} />}
        </>
      ) : (
        <p data-testid="empty">Välj en corral</p>
      )}
      {newOpen && <NewDroverDialog onClose={() => setNewOpen(false)} onCreated={setSelected} />}
      {toast && <div role="alert" data-testid="toast">{toast}</div>}
    </div>
  );
}
