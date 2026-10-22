// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import type { Corral, Message } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

/** inbox lines are `[from -> to] text` without a timestamp */
const inboxLine = (l: string) => {
  const m = /^\[(.+?) -> (.+?)\] ?(.*)$/.exec(l);
  return m ? <><span className="route">[{m[1]} → {m[2]}]</span> {m[3]}</> : l;
};

export function Composer({ hid, to = 'drover', onError }: { hid: string; to?: string; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.send(hid, text, to);
      setText('');
    } catch (err) {
      onError(errMsg(err));
    }
  };
  return (
    <form onSubmit={send} className="composer">
      <input className="form-control" data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message to ${to}`} aria-label={`Message to ${to}`} />
      <button className="btn btn-solid theme-primary" data-testid="message-send" type="submit"><Icon n="send" /> Send</button>
    </form>
  );
}

export function MessageFeed({ corral, messages = corral.messages, compose, onError }: { corral: Corral; messages?: Message[]; compose?: string; onError: (m: string) => void }) {
  const own = messages === corral.messages;
  const [older, setOlder] = useState<{ messages: Message[]; offset: number } | undefined>();
  useEffect(() => setOlder(undefined), [corral.hid, corral.messages_offset]);
  const offset = older?.offset ?? corral.messages_offset;
  const loadOlder = () =>
    api.olderMessages(corral.hid, offset).then((r) => setOlder({ messages: [...r.messages, ...(older?.messages ?? [])], offset: r.offset }), (err) => onError(errMsg(err)));
  const [q, setQ] = useState('');
  const all = own && older ? [...older.messages, ...messages] : messages;
  const needle = q.trim().toLowerCase();
  const shown = needle ? all.filter((m) => `${m.from} ${m.to} ${m.text}`.toLowerCase().includes(needle)) : all;
  return (
    <section data-testid="message-feed" className="feed">
      {own && offset > 0 && <button className="btn btn-sm btn-outline" data-testid="messages-older" onClick={loadOlder}>Load older</button>}
      <div className="feed-tools">
        <input className="form-control form-control-sm" data-testid="messages-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by agent or text" aria-label="Filter messages" />
        <button className="btn btn-sm btn-outline" data-testid="messages-latest" onClick={() => document.querySelector('[data-testid=message-feed] .msgs li:last-child')?.scrollIntoView?.({ block: 'end' })}>Jump to latest</button>
      </div>
      {messages.length === 0 && <p className="empty-note">No messages</p>}
      <ul className="msgs">
        {shown.map((m, i) => (
          <li key={i} data-testid="message-item">
            <time className="mono muted">{m.at}</time> <span className="route">[{m.from} → {m.to}]</span> {m.text.replace(/\s*\(queued\)$/, '')}{/\(queued\)\s*$/.test(m.text) && <span data-testid="msg-queued" className="pill pill-blocked">queued</span>}
          </li>
        ))}
      </ul>
      {messages === corral.messages && corral.inbox.length > 0 && (
        <details className="card-x">
          <summary>inbox ({corral.inbox.length})</summary>
          <ul data-testid="inbox" className="inbox">{corral.inbox.map((l, i) => <li key={i} className="mono">{inboxLine(l)}</li>)}</ul>
        </details>
      )}
      {compose && <Composer hid={corral.hid} to={compose} onError={onError} />}
    </section>
  );
}
