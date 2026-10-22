// SPDX-License-Identifier: GPL-3.0-only
import { Fragment, useEffect, useState } from 'react';
import type { ReportMeta } from '@droverstatus/shared';
import { api } from '../api';

export const parseReport = (md: string): [string, string][] | undefined => {
  const t = md.trim();
  if (!t || t.includes('\n') || !t.includes(' | ')) return undefined;
  const f = t.split(' | ').map((p) => {
    const i = p.indexOf(':');
    return i > 0 ? ([p.slice(0, i).trim(), p.slice(i + 1).trim()] as [string, string]) : undefined;
  });
  return f.every(Boolean) ? (f as [string, string][]) : undefined;
};

function ReportBody({ md }: { md: string }) {
  const f = parseReport(md);
  if (!f) return <pre data-testid="report-body" className="md">{md}</pre>;
  return (
    <div data-testid="report-body" className="card-x report">
      <dl className="kv">
        {f.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd data-testid={`report-field-${k}`} className={k === 'status' ? `rs rs-${v}` : undefined}>{v}</dd></Fragment>)}
      </dl>
    </div>
  );
}

const seenKey = (hid: string, id: string) => `report-seen:${hid}/${id}`;
const lastSeen = (hid: string, id: string) => {
  try {
    return localStorage.getItem(seenKey(hid, id)) ?? '';
  } catch {
    return '';
  }
};

export function Reports({ hid, ids, auto, meta = {} }: { hid: string; ids: string[]; auto?: boolean; meta?: Record<string, ReportMeta> }) {
  const [, rerender] = useState(0);
  const [picked, setPicked] = useState<string>();
  const [md, setMd] = useState('');
  const open = picked ?? (auto ? ids[0] : undefined);
  useEffect(() => {
    if (!open) return;
    api.report(hid, open).then(setMd, () => setMd('(no report)'));
    const at = meta[open]?.at;
    if (at)
      try {
        localStorage.setItem(seenKey(hid, open), at);
        rerender((n) => n + 1);
      } catch {}
  }, [hid, open, ids]);
  return (
    <section data-testid="reports" className="card-x">
      {ids.length === 0 && <p className="empty-note">No reports yet</p>}
      {!(auto && ids.length === 1) && (
        <div className="chips">
          {ids.map((id) => (
            <button key={id} className={`btn btn-sm ${open === id ? 'btn-solid theme-primary' : 'btn-outline theme-secondary'}`} data-testid={`report-${id}`} onClick={() => setPicked(open === id && !auto ? undefined : id)}>
              {id}
              {meta[id]?.status && <span data-testid={`report-status-${id}`} className={`rs rs-${meta[id].status}`}>{meta[id].status}</span>}
              {meta[id]?.at && open !== id && meta[id].at! > lastSeen(hid, id) && <span data-testid={`report-new-${id}`} className="pill pill-blocked">new</span>}
            </button>
          ))}
        </div>
      )}
      {open && <ReportBody md={md} />}
    </section>
  );
}
