// SPDX-License-Identifier: GPL-3.0-only
import { useState } from 'react';
import { api, ApiFail } from '../api';

const MIN_LEN = 12;

interface Props {
  passwordSet: boolean;
  /** bootstrap token from login; asked for when missing */
  token?: string;
  onChanged?: () => void;
  onLogout: () => void;
}

export function Settings({ passwordSet, token, onChanged, onLogout }: Props) {
  const [current, setCurrent] = useState('');
  const [tok, setTok] = useState(token ?? '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = password.length >= MIN_LEN && password === repeat && (passwordSet ? current !== '' : tok !== '');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone(false);
    try {
      await api.changePassword(passwordSet ? { current, password } : { token: tok, password });
      setCurrent('');
      setPassword('');
      setRepeat('');
      setDone(true);
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiFail && err.status === 401
          ? passwordSet ? 'Current password is wrong.' : 'Bootstrap token is invalid.'
          : err instanceof ApiFail && err.status === 400
            ? `Password must be at least ${MIN_LEN} characters.`
            : 'Could not change password.',
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      onLogout();
    }
  };
  return (
    <section className="auth-card" data-testid="settings">
      <h1>{passwordSet ? 'Settings' : 'Set a password'}</h1>
      {!passwordSet && <p>Choose a password to finish setup. The bootstrap token stops working afterwards.</p>}
      <form className="vstack gap-2" onSubmit={submit}>
        {passwordSet ? (
          <label>current password <input className="form-control" data-testid="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        ) : (
          !token && <label>bootstrap token <input className="form-control" data-testid="pw-token" type="password" autoComplete="off" value={tok} onChange={(e) => setTok(e.target.value)} /></label>
        )}
        <label>new password (min {MIN_LEN}) <input className="form-control" data-testid="pw-new" type="password" autoComplete="new-password" minLength={MIN_LEN} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>repeat new password <input className="form-control" data-testid="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
        {error && <div role="alert" data-testid="pw-error" className="error">{error}</div>}
        {done && <div role="status" data-testid="pw-done">Password changed.</div>}
        <button className="btn btn-solid theme-primary" data-testid="pw-submit" disabled={busy || !valid}>{passwordSet ? 'Change password' : 'Set password'}</button>
      </form>
      <button className="btn btn-sm" data-testid="logout" onClick={logout}>Log out</button>
    </section>
  );
}
