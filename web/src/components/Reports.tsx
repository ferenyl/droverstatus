import { useEffect, useState } from 'react';
import { api } from '../api';

export function Reports({ hid, ids }: { hid: string; ids: string[] }) {
  const [open, setOpen] = useState<string>();
  const [md, setMd] = useState('');
  useEffect(() => {
    if (!open) return;
    api.report(hid, open).then(setMd, () => setMd('(ingen rapport)'));
  }, [hid, open, ids]);
  return (
    <section data-testid="reports">
      {ids.map((id) => (
        <button key={id} data-testid={`report-${id}`} onClick={() => setOpen(open === id ? undefined : id)}>{id}</button>
      ))}
      {open && <pre data-testid="report-body">{md}</pre>}
    </section>
  );
}
