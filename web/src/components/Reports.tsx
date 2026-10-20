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
    <section data-testid="reports" className="my-3">
      {ids.map((id) => (
        <button key={id} className="btn btn-sm btn-outline-secondary me-1" data-testid={`report-${id}`} onClick={() => setOpen(open === id ? undefined : id)}>{id}</button>
      ))}
      {open && <pre data-testid="report-body" className="border rounded p-2 mt-2 small">{md}</pre>}
    </section>
  );
}
