// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Corral } from '@droverstatus/shared';
import { renderMarkdown } from './components/Markdown';
import { applyEvent } from './useCorrals';

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
