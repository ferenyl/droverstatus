// SPDX-License-Identifier: GPL-3.0-only
import { Fragment, useEffect, useState } from 'react';
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

export function Reports({ hid, ids, auto }: { hid: string; ids: string[]; auto?: boolean }) {
  const [picked, setPicked] = useState<string>();
  const [md, setMd] = useState('');
  const open = picked ?? (auto ? ids[0] : undefined);
  useEffect(() => {
    if (!open) return;
    api.report(hid, open).then(setMd, () => setMd('(no report)'));
  }, [hid, open, ids]);
  return (
    <section data-testid="reports" className="card-x">
      {ids.length === 0 && <p className="empty-note">No reports yet</p>}
      {!(auto && ids.length === 1) && (
        <div className="chips">
          {ids.map((id) => (
            <button key={id} className={`btn btn-sm ${open === id ? 'btn-solid theme-primary' : 'btn-outline theme-secondary'}`} data-testid={`report-${id}`} onClick={() => setPicked(open === id && !auto ? undefined : id)}>{id}</button>
          ))}
        </div>
      )}
      {open && <ReportBody md={md} />}
    </section>
  );
}
