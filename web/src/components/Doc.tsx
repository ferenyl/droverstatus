// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Markdown } from './Markdown';

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** tiny JSON highlighter; builds React nodes only, so the text is always escaped */
function highlight(src: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of src.matchAll(JSON_TOKEN)) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = m[1] ? (m[2] ? 'json-key' : 'json-str') : m[3] ? 'json-num' : 'json-lit';
    out.push(<span key={m.index} className={cls}>{m[1] ?? m[3] ?? m[4]}</span>, m[2] ?? '');
    last = m.index + m[0].length;
  }
  out.push(src.slice(last));
  return out;
}

/** pretty-printed form when the text is valid JSON that is not already formatted that way */
function prettier(text: string): string | undefined {
  try {
    const pretty = JSON.stringify(JSON.parse(text), null, 2);
    return pretty === text.trimEnd() ? undefined : pretty;
  } catch {
    return undefined;
  }
}

/** collapsed markdown/text/html document or image (`image`: its url), fetched when first opened */
export function Doc({ title, load, testId, markdown = true, onArtifact, version, json = false, html = false, image }: { title: string; load: () => Promise<string>; testId: string; markdown?: boolean; onArtifact?: () => void; version?: string; json?: boolean; html?: boolean; image?: string }) {
  const [text, setText] = useState<string>();
  const pretty = json && text !== undefined ? prettier(text) : undefined;
  const open = useRef(false);
  const fetch = () => (image ? Promise.resolve(setText('')) : load().then(setText, () => setText('(not available)')));
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
      {pretty !== undefined && (
        <div className="d-flex justify-content-end my-2">
          <button className="btn btn-sm btn-solid theme-primary" data-testid={`${testId}-prettify`} onClick={() => setText(pretty)}>Prettify</button>
        </div>
      )}
      {/* agent-written html: sandboxed without scripts or same-origin access */}
      {text !== undefined && image ? <img data-testid={`${testId}-body`} className="doc-image" alt={title} src={version ? `${image}&v=${encodeURIComponent(version)}` : image} /> : text !== undefined && html ? <iframe data-testid={`${testId}-body`} className="doc-html" sandbox="" title={title} srcDoc={text} /> : text !== undefined && json && !markdown ? <pre data-testid={`${testId}-body`} className="md">{highlight(text)}</pre> : text !== undefined && (markdown ? <Markdown md={text} testId={`${testId}-body`} /> : <pre data-testid={`${testId}-body`} className="md">{text}</pre>)}
    </details>
  );
}
