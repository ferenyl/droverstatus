// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Corral } from '@droverstatus/shared';
import { renderMarkdown } from './components/Markdown';
import { applyEvent } from './useCorrals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Doc } from './components/Doc';

describe('renderMarkdown sanitizer', () => {
  it.each([
    ['<img src=x onerror=alert(1)>', /onerror/i],
    ['<script>alert(1)</script>', /<script/i],
    ['[x](javascript:alert(1))', /javascript:/i],
    ['<svg onload=alert(1)></svg>', /onload/i],
    ['<a href="x" style="x">y</a><style>*{}</style>', /<style|style=/i],
    ['<iframe src="//evil"></iframe>', /<iframe/i],
    ['<input autofocus onfocus=alert(1)>', /<input|onfocus/i],
  ])('strips %s', (md, bad) => {
    expect(renderMarkdown(md)).not.toMatch(bad);
  });

  it('escapes mermaid source and links open safely', () => {
    expect(renderMarkdown('```mermaid\n<img src=x onerror=1>\n```')).toContain('&lt;img');
    expect(renderMarkdown('[a](https://x.y)')).toContain('rel="noreferrer noopener"');
  });
});

describe('applyEvent', () => {
  const c = (hid: string) => ({ hid }) as Corral;
  it('snapshot replaces, update sets, removed deletes without mutating prev', () => {
    const snap = applyEvent(new Map([['old', c('old')]]), { type: 'snapshot', corrals: [c('a')] });
    expect([...snap.keys()]).toEqual(['a']);
    const upd = applyEvent(snap, { type: 'corral-updated', hid: 'b', corral: c('b') });
    expect([...upd.keys()]).toEqual(['a', 'b']);
    expect(snap.size).toBe(1);
    const del = applyEvent(upd, { type: 'corral-removed', hid: 'a' });
    expect([...del.keys()]).toEqual(['b']);
    expect(upd.size).toBe(2);
  });
});

describe('Doc json', () => {
  const show = async (text: string) => {
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    await act(async () => root.render(<Doc title="t" testId="d" json markdown={false} load={async () => text} />));
    await act(async () => {
      const d = el.querySelector('details')!;
      d.open = true;
      d.dispatchEvent(new Event('toggle'));
    });
    return el;
  };
  it('highlights, escapes, and offers Prettify only when not pretty', async () => {
    const el = await show('{"a":"<img src=x onerror=1>","b":1}');
    expect(el.querySelector('.json-key')?.textContent).toBe('"a"');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid=d-prettify]')).not.toBeNull();
    await act(async () => (el.querySelector('[data-testid=d-prettify]') as HTMLElement).click());
    expect(el.querySelector('[data-testid=d-prettify]')).toBeNull();
    expect((await show('{\n  "a": 1\n}\n')).querySelector('[data-testid=d-prettify]')).toBeNull();
  });
});
