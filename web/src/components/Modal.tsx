import { useEffect, useId, useRef } from 'react';

export function Modal(p: { testId: string; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    if (d.showModal) d.showModal();
    else d.setAttribute('open', '');
  }, []);
  return (
    <dialog ref={ref} data-testid={p.testId} aria-labelledby={id} className="card p-3 shadow" onCancel={(e) => { e.preventDefault(); p.onClose(); }}>
      <h2 id={id} className="h5">{p.title}</h2>
      {p.children}
    </dialog>
  );
}
