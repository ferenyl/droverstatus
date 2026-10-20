import { useEffect, useState } from 'react';
import { useCorrals } from './useCorrals';
import { CorralList } from './components/CorralList';
import { CorralView } from './components/CorralView';
import { NewDroverDialog } from './components/NewDroverDialog';
import { CloseDialog } from './components/CloseDialog';
import { NodeDetail } from './components/NodeDetail';
import { build, parse, tabOf, type Sel, type Tab } from './route';
import { Icon } from './components/Icon';

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
  const [sel, setSel] = useState<Sel | undefined>(() => parse(location.pathname));
  const selected = sel?.hid;
  const node = sel?.node;
  const go = (next?: Sel) => {
    const url = build(next);
    if (url !== location.pathname) history.pushState(null, '', url);
    setSel(next);
  };
  useEffect(() => {
    const pop = () => setSel(parse(location.pathname));
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  const [showClosed, setShowClosed] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [closing, setClosing] = useState(false);
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
    <div className="shell">
      <header className="topbar">
        <span className="brand"><Icon n="box" /> Droverstatus</span>
        <span data-testid="conn-status" className={`conn ${connected ? 'up' : 'down'}`}><span className="dot" aria-hidden="true" />{connected ? 'online' : 'offline'}</span>
        <span className="spacer" />
        <button className="btn btn-sm btn-solid theme-primary" data-testid="new-drover-btn" onClick={() => setNewOpen(true)}><Icon n="plus" /> New drover</button>
      </header>
      <div className="body">
        <aside className="sidebar">
          <CorralList
            corrals={list}
            selected={selected}
            node={node}
            showClosed={showClosed}
            onShowClosed={setShowClosed}
            onSelect={(h, n) => go({ hid: h, node: n })}
          />
        </aside>
        <main className="pane">
          {current ? (
            <>
              {node ? (
                <NodeDetail key={`${current.hid}/${node.kind}/${node.kind === 'agent' ? node.id : ''}`} corral={current} node={node} tab={tabOf(sel!)} onTab={(t: Tab) => go({ ...sel!, tab: t })} onError={setToast} />
              ) : (
                <CorralView key={current.hid} corral={current} tab={tabOf(sel!)} onTab={(t: Tab) => go({ ...sel!, tab: t })} onOpenAgent={(id) => go({ hid: current.hid, node: { kind: 'agent', id }, tab: 'screen' })} onClose={() => setClosing(true)} onError={setToast} />
              )}
              {closing && <CloseDialog hid={current.hid} onClose={() => setClosing(false)} />}
            </>
          ) : (
            <div data-testid="empty" className="empty-state"><Icon n="box" /><p>{selected ? `Corral ${selected} not found` : 'Select a corral'}</p><small>Pick one from the tree, or start a new drover.</small></div>
          )}
        </main>
      </div>
      {newOpen && <NewDroverDialog onClose={() => setNewOpen(false)} onCreated={(h) => go({ hid: h })} />}
      {toast && <div role="alert" data-testid="toast" className="toast-x">{toast}</div>}
    </div>
  );
}
