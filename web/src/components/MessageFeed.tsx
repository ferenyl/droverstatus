import { useState } from 'react';
import type { Corral } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';

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
    <section data-testid="message-feed" className="my-3">
      <ul className="list-unstyled small">
        {corral.messages.map((m, i) => (
          <li key={i} data-testid="message-item">
            <time className="fg-3">{m.at}</time> [{m.from} → {m.to}] {m.text}
          </li>
        ))}
      </ul>
      {corral.inbox.length > 0 && (
        <details>
          <summary>inbox ({corral.inbox.length})</summary>
          <ul data-testid="inbox">{corral.inbox.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      <form onSubmit={send} className="input-group">
        <input className="form-control" data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message to drover" />
        <button className="btn btn-solid theme-primary" data-testid="message-send" type="submit">Send</button>
      </form>
    </section>
  );
}
