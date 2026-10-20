import { useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';
import { Icon } from './Icon';

export function MessageFeed({ corral, onError }: { corral: Corral; onError: (m: string) => void }) {
  const [text, setText] = useState('');
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api.send(corral.hid, text);
      setText('');
    } catch (err) {
      onError(errMsg(err));
    }
  };
  return (
    <section data-testid="message-feed" className="feed">
      {corral.messages.length === 0 && <p className="empty-note">No messages</p>}
      <ul className="msgs">
        {corral.messages.map((m, i) => (
          <li key={i} data-testid="message-item">
            <time className="mono muted">{m.at}</time> <span className="route">[{m.from} → {m.to}]</span> {m.text}
          </li>
        ))}
      </ul>
      {corral.inbox.length > 0 && (
        <details className="card-x">
          <summary>inbox ({corral.inbox.length})</summary>
          <ul data-testid="inbox">{corral.inbox.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      <form onSubmit={send} className="composer">
        <input className="form-control" data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message to drover" aria-label="Message to drover" />
        <button className="btn btn-solid theme-primary" data-testid="message-send" type="submit"><Icon n="send" /> Send</button>
      </form>
    </section>
  );
}
