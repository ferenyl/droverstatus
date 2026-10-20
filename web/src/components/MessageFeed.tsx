import { useState } from 'react';
import type { Corral, Message } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

export function Composer({ hid, onError }: { hid: string; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.send(hid, text);
      setText('');
    } catch (err) {
      onError(errMsg(err));
    }
  };
  return (
    <form onSubmit={send} className="composer">
      <input className="form-control" data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message to drover" aria-label="Message to drover" />
      <button className="btn btn-solid theme-primary" data-testid="message-send" type="submit"><Icon n="send" /> Send</button>
    </form>
  );
}

export function MessageFeed({ corral, messages = corral.messages, compose, onError }: { corral: Corral; messages?: Message[]; compose?: boolean; onError: (m: string) => void }) {
  return (
    <section data-testid="message-feed" className="feed">
      {messages.length === 0 && <p className="empty-note">No messages</p>}
      <ul className="msgs">
        {messages.map((m, i) => (
          <li key={i} data-testid="message-item">
            <time className="mono muted">{m.at}</time> <span className="route">[{m.from} → {m.to}]</span> {m.text.replace(/\s*\(queued\)$/, '')}{/\(queued\)\s*$/.test(m.text) && <span data-testid="msg-queued" className="pill pill-blocked">queued</span>}
          </li>
        ))}
      </ul>
      {messages === corral.messages && corral.inbox.length > 0 && (
        <details className="card-x">
          <summary>inbox ({corral.inbox.length})</summary>
          <ul data-testid="inbox" className="inbox">{corral.inbox.map((l, i) => <li key={i} className="mono">{l}</li>)}</ul>
        </details>
      )}
      {compose && <Composer hid={corral.hid} onError={onError} />}
    </section>
  );
}
