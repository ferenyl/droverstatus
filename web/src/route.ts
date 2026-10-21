// SPDX-License-Identifier: GPL-3.0-only
import type { Node } from './util';

export type Tab = 'overview' | 'board' | 'tasks' | 'messages' | 'reports' | 'screen';
/** story: `?story=<id>` filter of the corral board tab */
export interface Sel { hid: string; node?: Node; tab?: Tab; story?: string }

const TABS: Tab[] = ['overview', 'board', 'tasks', 'messages', 'reports', 'screen'];
const isTab = (s?: string): s is Tab => !!s && (TABS as string[]).includes(s);

export const tabsFor = (node?: Node): Tab[] => TABS.filter((t) => t !== (node ? 'board' : 'screen'));
export const defaultTab = (node?: Node): Tab => (node?.kind === 'agent' ? 'screen' : 'overview');
export const tabOf = (s: Sel): Tab => (s.tab && tabsFor(s.node).includes(s.tab) ? s.tab : defaultTab(s.node));

export const parse = (path: string, search = ''): Sel | undefined => {
  const p = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (p[0] !== 'corrals' || !p[1]) return undefined;
  const hid = p[1];
  if (p[2] === 'drover') return { hid, node: { kind: 'drover' }, tab: isTab(p[3]) ? p[3] : undefined };
  if (p[2] === 'agents' && p[3]) return { hid, node: { kind: 'agent', id: p[3] }, tab: isTab(p[4]) ? p[4] : undefined };
  const tab = isTab(p[2]) ? p[2] : undefined;
  const story = tab === 'board' ? new URLSearchParams(search).get('story') || undefined : undefined;
  return story ? { hid, tab, story } : { hid, tab };
};

export const build = (s?: Sel): string => {
  if (!s) return '/';
  const tab = tabOf(s);
  const base = `/corrals/${encodeURIComponent(s.hid)}`;
  if (!s.node) return tab === 'overview' ? base : tab === 'board' && s.story ? `${base}/board?story=${encodeURIComponent(s.story)}` : `${base}/${tab}`;
  return s.node.kind === 'drover' ? `${base}/drover/${tab}` : `${base}/agents/${encodeURIComponent(s.node.id)}/${tab}`;
};

/** story: `<hid>:<story id>` */
export interface BoardFilter { corrals: string[]; closed: boolean; story?: string }
export const isBoard = (path: string) => path === '/board' || path.startsWith('/board/');
export const parseBoard = (search: string): BoardFilter => {
  const q = new URLSearchParams(search);
  const f: BoardFilter = { corrals: (q.get('corrals') ?? '').split(',').filter(Boolean), closed: q.get('closed') === '1' };
  const story = q.get('story');
  return story ? { ...f, story } : f;
};
export const buildBoard = (f: BoardFilter): string => {
  const q = new URLSearchParams();
  if (f.corrals.length) q.set('corrals', f.corrals.join(','));
  if (f.closed) q.set('closed', '1');
  if (f.story) q.set('story', f.story);
  const s = q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
  return s ? `/board?${s}` : '/board';
};
