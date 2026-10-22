// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import { Markdown } from './Markdown';

/** collapsed markdown/text document, fetched when first opened */
export function Doc({ title, load, testId, markdown = true, onArtifact }: { title: string; load: () => Promise<string>; testId: string; markdown?: boolean; onArtifact?: () => void }) {
  const [text, setText] = useState<string>();
  return (
    <details className="card-x" data-testid={testId} onToggle={(e) => e.currentTarget.open && text === undefined && load().then(setText, () => setText('(not available)'))}>
      <summary>{title}</summary>
      {onArtifact && <button className="btn btn-sm" data-testid={`${testId}-artifact`} onClick={onArtifact}>Create Claude artifact</button>}
      {text !== undefined && (markdown ? <Markdown md={text} testId={`${testId}-body`} /> : <pre data-testid={`${testId}-body`} className="md">{text}</pre>)}
    </details>
  );
}
