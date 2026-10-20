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
    <section data-testid="message-feed">
      <ul>
        {corral.messages.map((m, i) => (
          <li key={i} data-testid="message-item">
            <time>{m.at}</time> [{m.from} → {m.to}] {m.text}
          </li>
        ))}
      </ul>
      {corral.inbox.length > 0 && (
        <details>
          <summary>inbox ({corral.inbox.length})</summary>
          <ul data-testid="inbox">{corral.inbox.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </details>
      )}
      <form onSubmit={send}>
        <input data-testid="message-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Meddelande till drover" />
        <button data-testid="message-send" type="submit">Skicka</button>
      </form>
    </section>
  );
}
