// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import type { AuthSession } from '@droverstatus/shared';
import { api, setUnauthorizedHandler } from './api';
import { useCorrals } from './useCorrals';
import { CorralList } from './components/CorralList';
import { CorralView } from './components/CorralView';
import { NewDroverDialog } from './components/NewDroverDialog';
import { CloseDialog } from './components/CloseDialog';
import { NodeDetail } from './components/NodeDetail';
import { build, buildBoard, isBoard, isSettings, parse, parseBoard, tabOf, type BoardFilter, type Sel, type Tab } from './route';
import { Board } from './components/Board';
import { Icon } from './components/Icon';
import { Login } from './components/Login';
import { Settings } from './components/Settings';
import { attention, loadPref, savePref } from './util';

const notify = (msg: string) => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(msg);
};

function Console({ onLogout }: { onLogout: () => void }) {
  const { corrals, connected, lost } = useCorrals((prev, e) => {
    if (e.type !== 'corral-updated') return;
    const old = prev.get(e.hid);
    for (const a of e.corral.agents)
      if (a.status.state === 'blocked' && old?.agents.find((o) => o.id === a.id)?.status.state !== 'blocked')
        notify(`${e.corral.slug}: ${a.id} blocked`);
  });
  const [view, setView] = useState<'console' | 'board' | 'settings'>(() => (isSettings(location.pathname) ? 'settings' : isBoard(location.pathname) ? 'board' : 'console'));
  const [bf, setBf] = useState<BoardFilter>(() => parseBoard(location.search));
  const [sel, setSel] = useState<Sel | undefined>(() => parse(location.pathname, location.search));
  const selected = sel?.hid;
  const node = sel?.node;
  const push = (url: string) => {
    if (url !== location.pathname + location.search) history.pushState(null, '', url);
  };
  const go = (next?: Sel) => {
    push(build(next));
    setView('console');
    setSel(next);
  };
  const goSettings = () => {
    push('/settings');
    setView('settings');
  };
  const goBoard = (f: BoardFilter) => {
    push(buildBoard(f));
    setView('board');
    setBf(f);
  };
  useEffect(() => {
    const pop = () => {
      if (isSettings(location.pathname)) {
        setView('settings');
      } else if (isBoard(location.pathname)) {
        setView('board');
        setBf(parseBoard(location.search));
      } else {
        setView('console');
        setSel(parse(location.pathname, location.search));
      }
    };
    addEventListener('popstate', pop);
    return () => removeEventListener('popstate', pop);
  }, []);
  const [showClosed, setShowClosed] = useState(() => loadPref('showClosed') === '1');
  const changeShowClosed = (v: boolean) => {
    savePref('showClosed', v ? '1' : '');
    setShowClosed(v);
  };
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
  const needs = list.reduce((n, c) => n + attention(c).count, 0);
  useEffect(() => {
    document.title = needs ? `(${needs}) Droverstatus` : 'Droverstatus';
    const dot = needs ? "<circle cx='24' cy='8' r='8' fill='%23e5484d'/>" : '';
    let link = document.querySelector<HTMLLinkElement>('link[rel=icon]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.append(link);
    }
    link.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='4' y='8' width='20' height='18' rx='3' fill='%23888'/>${dot}</svg>`;
  }, [needs]);
  const current = selected ? corrals.get(selected) : undefined;
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand"><Icon n="box" /> Droverstatus</span>
        <span data-testid="conn-status" role="status" aria-live="polite" className={`conn ${connected ? 'up' : 'down'}`}><span className="dot" aria-hidden="true" />{connected ? 'online' : 'offline'}</span>
        <nav className="views" aria-label="Views">
          <a href={build(sel)} data-testid="nav-console" aria-current={view === 'console' ? 'page' : undefined} className={view === 'console' ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(sel); }}>Console</a>
          <a href={buildBoard(bf)} data-testid="nav-board" aria-current={view === 'board' ? 'page' : undefined} className={view === 'board' ? 'on' : ''} onClick={(e) => { e.preventDefault(); goBoard(bf); }}>Board</a>
        </nav>
        <span className="spacer" />
        <a href="/settings" data-testid="nav-settings" aria-current={view === 'settings' ? 'page' : undefined} className={`views-link ${view === 'settings' ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); goSettings(); }}>Settings</a>
        <button className="btn btn-sm btn-solid theme-primary" data-testid="new-drover-btn" onClick={() => setNewOpen(true)}><Icon n="plus" /> New drover</button>
      </header>
      {!connected && lost && <div role="alert" data-testid="offline-banner" className="alert theme-warning m-0">Connection lost — reconnecting; data may be stale.</div>}
      {view === 'settings' ? (
        <main className="pane"><Settings passwordSet onLogout={onLogout} /></main>
      ) : view === 'board' ? (
        <main className="pane board-pane">
          <Board corrals={list} filter={bf} onFilter={goBoard} onOpen={(hid, owner) => go(owner ? { hid, node: { kind: 'agent', id: owner }, tab: 'screen' } : { hid })} />
        </main>
      ) : (
      <div className="body">
        <aside className="sidebar">
          <CorralList
            corrals={list}
            selected={selected}
            node={node}
            showClosed={showClosed}
            onShowClosed={changeShowClosed}
            onSelect={(h, n) => go({ hid: h, node: n })}
          />
        </aside>
        <main className="pane">
          {current ? (
            <>
              {node ? (
                <NodeDetail key={`${current.hid}/${node.kind}/${node.kind === 'agent' ? node.id : ''}`} corral={current} node={node} tab={tabOf(sel!)} onTab={(t: Tab) => go({ ...sel!, tab: t })} onError={setToast} />
              ) : (
                <CorralView key={current.hid} corral={current} tab={tabOf(sel!)} onTab={(t: Tab) => go({ hid: sel!.hid, tab: t, story: t === 'board' ? sel!.story : undefined })} story={sel!.story} onStory={(story) => go({ hid: current.hid, tab: 'board', story })} onOpenAgent={(id) => go({ hid: current.hid, node: { kind: 'agent', id }, tab: 'screen' })} onClose={() => setClosing(true)} onError={setToast} />
              )}
              {closing && <CloseDialog hid={current.hid} onClose={() => setClosing(false)} />}
            </>
          ) : (
            <div data-testid="empty" className="empty-state"><Icon n="box" /><p>{selected ? `Corral ${selected} not found` : 'Select a corral'}</p><small>Pick one from the tree, or start a new drover.</small></div>
          )}
        </main>
      </div>
      )}
      {newOpen && <NewDroverDialog onClose={() => setNewOpen(false)} onCreated={(h) => go({ hid: h })} />}
      {toast && <div role="alert" aria-live="assertive" data-testid="toast" className="toast-x">{toast}</div>}
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthSession>();
  const [token, setToken] = useState<string>();
  const refresh = () => api.session().then(setAuth, () => setAuth({ authenticated: false, passwordSet: true }));
  useEffect(() => {
    void refresh();
    return setUnauthorizedHandler(() => setAuth((a) => ({ authenticated: false, passwordSet: a?.passwordSet ?? true })));
  }, []);
  useEffect(() => {
    if (auth?.authenticated && !auth.passwordSet && !isSettings(location.pathname)) history.replaceState(null, '', '/settings');
  }, [auth]);
  if (!auth) return null;
  if (!auth.authenticated)
    return <Login passwordSet={auth.passwordSet} onDone={(t) => { setToken(t); void refresh(); }} />;
  if (!auth.passwordSet)
    return <Settings passwordSet={false} token={token} onChanged={() => { setToken(undefined); void refresh(); }} onLogout={() => void refresh()} />;
  return <Console onLogout={() => { history.replaceState(null, '', '/'); void refresh(); }} />;
}
