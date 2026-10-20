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
  box: 'M2 5l6-3 6 3v6l-6 3-6-3z',
};

export const Icon = ({ n }: { n: keyof typeof P }) => (
  <svg className="icon" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={P[n]} />
  </svg>
);
