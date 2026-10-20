import type { Node } from './util';

export type Tab = 'overview' | 'tasks' | 'messages' | 'reports' | 'screen';
export interface Sel { hid: string; node?: Node; tab?: Tab }

const TABS: Tab[] = ['overview', 'tasks', 'messages', 'reports', 'screen'];
const isTab = (s?: string): s is Tab => !!s && (TABS as string[]).includes(s);

export const tabsFor = (node?: Node): Tab[] => (node ? TABS : TABS.filter((t) => t !== 'screen'));
export const defaultTab = (node?: Node): Tab => (node?.kind === 'agent' ? 'screen' : 'overview');
export const tabOf = (s: Sel): Tab => (s.tab && tabsFor(s.node).includes(s.tab) ? s.tab : defaultTab(s.node));

export const parse = (path: string): Sel | undefined => {
  const p = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (p[0] !== 'corrals' || !p[1]) return undefined;
  const hid = p[1];
  if (p[2] === 'drover') return { hid, node: { kind: 'drover' }, tab: isTab(p[3]) ? p[3] : undefined };
  if (p[2] === 'agents' && p[3]) return { hid, node: { kind: 'agent', id: p[3] }, tab: isTab(p[4]) ? p[4] : undefined };
  return { hid, tab: isTab(p[2]) ? p[2] : undefined };
};

export const build = (s?: Sel): string => {
  if (!s) return '/';
  const tab = tabOf(s);
  const base = `/corrals/${encodeURIComponent(s.hid)}`;
  if (!s.node) return tab === 'overview' ? base : `${base}/${tab}`;
  return s.node.kind === 'drover' ? `${base}/drover/${tab}` : `${base}/agents/${encodeURIComponent(s.node.id)}/${tab}`;
};

export interface BoardFilter { corrals: string[]; closed: boolean }
export const isBoard = (path: string) => path === '/board' || path.startsWith('/board/');
export const parseBoard = (search: string): BoardFilter => {
  const q = new URLSearchParams(search);
  return { corrals: (q.get('corrals') ?? '').split(',').filter(Boolean), closed: q.get('closed') === '1' };
};
export const buildBoard = (f: BoardFilter): string => {
  const q = new URLSearchParams();
  if (f.corrals.length) q.set('corrals', f.corrals.join(','));
  if (f.closed) q.set('closed', '1');
  const s = q.toString().replace(/%2C/g, ',');
  return s ? `/board?${s}` : '/board';
};
