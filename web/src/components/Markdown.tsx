// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  renderer: {
    code({ text, lang }) {
      const l = (lang ?? '').split(/\s/)[0];
      return l === 'mermaid' ? `<pre class="mermaid">${esc(text)}</pre>` : `<pre><code${l ? ` class="language-${esc(l)}"` : ''}>${esc(text)}</code></pre>`;
    },
  },
});

DOMPurify.addHook('afterSanitizeAttributes', (n) => {
  if (n.tagName === 'A') {
    n.setAttribute('target', '_blank');
    n.setAttribute('rel', 'noreferrer noopener');
  }
});

export const renderMarkdown = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }), { FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'], FORBID_ATTR: ['style'] });

let seq = 0;

/** sanitized markdown; ```mermaid blocks become SVG, mermaid is loaded on first use */
export function Markdown({ md, testId }: { md: string; testId?: string }) {
  const html = useMemo(() => renderMarkdown(md), [md]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('pre.mermaid') ?? [])];
    if (!nodes.length) return;
    let live = true;
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
      for (const n of nodes) {
        try {
          const { svg } = await mermaid.render(`mmd-${++seq}`, n.textContent ?? '');
          if (live) n.innerHTML = svg;
        } catch {
          /* keep the source text visible */
        }
      }
    }, () => {});
    return () => {
      live = false;
    };
  }, [html]);
  return <div ref={ref} data-testid={testId} className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
