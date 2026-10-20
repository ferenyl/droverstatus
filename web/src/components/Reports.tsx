import { useEffect, useState } from 'react';
import { api } from '../api';

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
      {open && <pre data-testid="report-body" className="md">{md}</pre>}
    </section>
  );
}
