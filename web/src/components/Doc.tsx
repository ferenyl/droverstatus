// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';

/** collapsed markdown/text document, fetched when first opened */
export function Doc({ title, load, testId, markdown = true, onArtifact, version }: { title: string; load: () => Promise<string>; testId: string; markdown?: boolean; onArtifact?: () => void; version?: string }) {
  const [text, setText] = useState<string>();
  const open = useRef(false);
  const fetch = () => load().then(setText, () => setText('(not available)'));
  // re-fetch an already opened doc when the file changed on disk
  useEffect(() => {
    if (open.current) void fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  return (
    <details className="card-x" data-testid={testId} onToggle={(e) => {
        open.current = e.currentTarget.open;
        if (open.current && text === undefined) void fetch();
      }}>
      <summary>{title}</summary>
      {onArtifact && (
        <div className="d-flex justify-content-end my-2">
          <button className="btn btn-sm btn-solid theme-primary" data-testid={`${testId}-artifact`} onClick={onArtifact}>Create Claude artifact</button>
        </div>
      )}
      {text !== undefined && (markdown ? <Markdown md={text} testId={`${testId}-body`} /> : <pre data-testid={`${testId}-body`} className="md">{text}</pre>)}
    </details>
  );
}
