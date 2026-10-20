import { useEffect, useState } from 'react';
import { useCorrals } from './useCorrals';
import { CorralList } from './components/CorralList';
import { CorralView } from './components/CorralView';
import { AgentScreen } from './components/AgentScreen';
import { NewDroverDialog } from './components/NewDroverDialog';
import { CloseDialog } from './components/CloseDialog';
import { NodeDetail } from './components/NodeDetail';
import type { Node } from './util';

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
  const [node, setNode] = useState<Node>();
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
    <div className="container-fluid py-3">
      <div className="row g-3">
      <div className="md:col-4 xl:col-3">
      <span data-testid="conn-status" className={`badge mb-2 ${connected ? 'theme-success' : 'theme-danger'}`}>{connected ? 'online' : 'offline'}</span>
      <CorralList
        corrals={list}
        selected={selected}
        node={node}
        showClosed={showClosed}
        onShowClosed={setShowClosed}
        onSelect={(h, n) => { setSelected(h); setNode(n); setScreen(undefined); }}
        onNew={() => setNewOpen(true)}
      />
      </div>
      <main className="md:col-8 xl:col-9">
      {current ? (
        <>
          {node ? (
            <NodeDetail corral={current} node={node} onError={setToast} />
          ) : (
            <CorralView corral={current} onScreen={setScreen} onClose={() => setClosing(true)} onError={setToast} />
          )}
          {!node && screen && <AgentScreen hid={current.hid} id={screen} onClose={() => setScreen(undefined)} />}
          {closing && <CloseDialog hid={current.hid} onClose={() => setClosing(false)} />}
        </>
      ) : (
        <p data-testid="empty" className="fg-3">Select a corral</p>
      )}
      </main>
      </div>
      {newOpen && <NewDroverDialog onClose={() => setNewOpen(false)} onCreated={(h) => { setSelected(h); setNode(undefined); }} />}
      {toast && <div role="alert" data-testid="toast" className="alert theme-danger position-fixed bottom-0 end-0 m-3 shadow">{toast}</div>}
    </div>
  );
}
