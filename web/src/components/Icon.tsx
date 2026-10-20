// SPDX-License-Identifier: GPL-3.0-only
const P: Record<string, string> = {
  plus: 'M8 3v10M3 8h10',
  caret: 'm6 4 4 4-4 4',
  copy: 'M5 5h8v8H5zM3 11V3h8',
  x: 'm4 4 8 8M12 4l-8 8',
  stop: 'M4 4h8v8H4z',
  play: 'M5 3.5v9l7-4.5z',
  term: 'm3 4 4 4-4 4M8 12h5',
  send: 'M2 8 14 2l-4 12-2-5z',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm4-1 3 3',
  overview: 'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
  tasks: 'm3 4 1.5 1.5L7 3M9 4.5h5M3 10l1.5 1.5L7 9M9 10.5h5',
  messages: 'M2 3h12v8H7l-3 3v-3H2z',
  reports: 'M4 2h6l3 3v9H4zM10 2v3h3M6 8h5M6 11h5',
  screen: 'M2 3h12v8H2zM6 14h4M8 11v3',
  busy: 'M8 2a6 6 0 1 0 6 6',
  idle: 'M6 4v8M10 4v8',
  blocked: 'M8 2 14 13H2zM8 6.5v3M8 11.5v.01',
  dead: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM6 6l4 4M10 6l-4 4',
  closed: 'M4 4h8v8H4z',
  alive: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM5.5 8l2 2 3-3.5',
  unknown: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM6.5 6.5a1.5 1.5 0 1 1 2 1.4c-.4.2-.5.5-.5 1M8 11.5v.01',
  box: 'M2 5l6-3 6 3v6l-6 3-6-3z',
};

export const Icon = ({ n }: { n: keyof typeof P }) => (
  <svg className="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n]} />
  </svg>
);

export const StateIcon = ({ state }: { state: string }) => (
  <span className={`st st-${state}`}><Icon n={(state in P ? state : 'unknown') as keyof typeof P} /></span>
);
