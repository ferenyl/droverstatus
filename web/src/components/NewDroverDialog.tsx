import { useState } from 'react';
import { MODELS, KEBAB_RE } from '@droverstatus/shared';
import type { Model } from '@droverstatus/shared';
import { api } from '../api';
import { errMsg } from '../util';

export function NewDroverDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (hid: string) => void }) {
  const [slug, setSlug] = useState('');
  const [dir, setDir] = useState('');
  const [model, setModel] = useState<Model>('sonnet');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = KEBAB_RE.test(slug) && dir.trim() !== '';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated((await api.newDrover({ slug, dir, model, brief })).hid);
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog open data-testid="new-drover-dialog">
      <form onSubmit={submit}>
        <label>slug <input data-testid="new-slug" value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
        <label>projektkatalog <input data-testid="new-dir" value={dir} onChange={(e) => setDir(e.target.value)} /></label>
        <label>
          modell
          <select data-testid="new-model" value={model} onChange={(e) => setModel(e.target.value as Model)}>
            {MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>brief <textarea data-testid="new-brief" value={brief} onChange={(e) => setBrief(e.target.value)} /></label>
        {error && <p role="alert" data-testid="new-error">{error}</p>}
        <button data-testid="new-submit" type="submit" disabled={!valid || busy}>Skapa</button>
        <button data-testid="new-cancel" type="button" onClick={onClose}>Avbryt</button>
      </form>
    </dialog>
  );
}
