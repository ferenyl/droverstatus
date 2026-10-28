// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import { api, ApiFail } from '../api';

const failMsg = (err: unknown) =>
  err instanceof ApiFail && err.status === 429
    ? 'Too many failed attempts. Try again later.'
    : err instanceof ApiFail && err.status === 401
      ? 'Invalid credentials.'
      : 'Login failed.';

/** onDone receives the bootstrap token when one was used, so Settings can set the first password with it. */
export function Login({ passwordSet, onDone }: { passwordSet: boolean; onDone: (token?: string) => void }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (body: { password?: string; token?: string }) => {
    setBusy(true);
    setError('');
    try {
      await api.login(body);
      onDone(body.token);
    } catch (err) {
      setError(failMsg(err));
      setBusy(false);
    }
  };
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    if (!token) return;
    history.replaceState(null, '', location.pathname + location.search);
    setSecret(token);
    void submit({ token });
  }, []);
  return (
    <main className="auth-card" data-testid="login">
      <h1>Droverstatus</h1>
      <form
        className="vstack gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(passwordSet ? { password: secret } : { token: secret });
        }}
      >
        <label>
          {passwordSet ? 'password' : 'bootstrap token'}
          <input className="form-control" data-testid="login-secret" type="password" autoComplete={passwordSet ? 'current-password' : 'off'} autoFocus value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
        {error && <div role="alert" data-testid="login-error" className="error">{error}</div>}
        <button className="btn btn-solid theme-primary" data-testid="login-submit" disabled={busy || !secret}>Log in</button>
      </form>
    </main>
  );
}
