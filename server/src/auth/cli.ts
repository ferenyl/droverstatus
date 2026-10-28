// SPDX-License-Identifier: GPL-3.0-only
import { MIN_PASSWORD_LENGTH } from '@droverstatus/shared';
import { MAX_PASSWORD_LENGTH, validPassword } from './auth.js';
import { type Result, readAuthFile, removeFile, writeAuthFile } from './file.js';
import { hashPassword } from './hash.js';

/** removes auth.json: a running server drops all sessions and issues a new bootstrap token */
export async function resetPassword(file: string): Promise<Result<string>> {
  const r = await removeFile(file);
  if (!r.ok) return r;
  return { ok: true, value: r.value ? `removed ${file}: bootstrap mode, a running server issues a new login token` : `no password set (${file} does not exist)` };
}

/** writes the hash and bumps the session epoch, which logs out every session of a running server */
export async function setPassword(file: string, password: string): Promise<Result<string>> {
  if (!validPassword(password)) return { ok: false, error: `password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters` };
  const cur = await readAuthFile(file);
  if (!cur.ok) return cur;
  const w = await writeAuthFile(file, { version: 1, password: await hashPassword(password), sessionEpoch: cur.value.sessionEpoch + 1 });
  return w.ok ? { ok: true, value: `password set in ${file}` } : w;
}

/** one line from a TTY without echo, else all of stdin minus the trailing newline */
export async function readSecret(prompt: string, stdin: NodeJS.ReadStream = process.stdin, out: NodeJS.WriteStream = process.stderr): Promise<string | undefined> {
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const c of stdin) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  out.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    let s = '';
    const done = (v: string | undefined) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      out.write('\n');
      resolve(v);
    };
    const onData = (d: Buffer) => {
      for (const ch of d.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return done(s);
        if (ch === '\x03' || ch === '\x04') return done(undefined);
        if (ch === '\x7f' || ch === '\b') s = [...s].slice(0, -1).join('');
        else if (ch >= ' ') s += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/** `droverstatus reset-password | set-password`; returns the exit code */
export async function runAuthCommand(args: string[], file: string): Promise<number> {
  const report = (r: Result<string>) => {
    if (r.ok) console.log(`droverstatus: ${r.value}`);
    else console.error(`droverstatus: ${r.error}`);
    return r.ok ? 0 : 1;
  };
  const [cmd, ...rest] = args;
  if (rest.length || (cmd !== 'reset-password' && cmd !== 'set-password')) {
    console.error('usage: droverstatus [reset-password | set-password]  (set-password reads the password from stdin)');
    return 2;
  }
  if (cmd === 'reset-password') return report(await resetPassword(file));
  const pw = await readSecret('New password: ');
  if (pw === undefined) return 130;
  if (process.stdin.isTTY && (await readSecret('Repeat password: ')) !== pw) return report({ ok: false, error: 'passwords do not match' });
  return report(await setPassword(file, pw));
}
