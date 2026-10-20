import { useEffect, useState } from 'react';
import { api } from '../api';

export function Reports({ hid, ids }: { hid: string; ids: string[] }) {
  const [open, setOpen] = useState<string>();
  const [md, setMd] = useState('');
  useEffect(() => {
    if (!open) return;
    api.report(hid, open).then(setMd, () => setMd('(no report)'));
  }, [hid, open, ids]);
  return (
    <section data-testid="reports" className="card-x">
      {ids.length === 0 && <p className="empty-note">No reports yet</p>}
      <div className="chips">
        {ids.map((id) => (
          <button key={id} className={`btn btn-sm ${open === id ? 'btn-solid theme-primary' : 'btn-outline theme-secondary'}`} data-testid={`report-${id}`} onClick={() => setOpen(open === id ? undefined : id)}>{id}</button>
        ))}
      </div>
      {open && <pre data-testid="report-body" className="md">{md}</pre>}
    </section>
  );
}
