// SPDX-License-Identifier: GPL-3.0-only
import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { isPhc } from './hash.js';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** auth.json, versioned for future multi-user support */
export interface AuthData {
  version: 1;
  /** scrypt PHC string; absent = bootstrap mode */
  password?: string;
  /** bumped on every password change; sessions from an older epoch are invalid */
  sessionEpoch: number;
}

const errno = (e: unknown) => (e as NodeJS.ErrnoException).code;

/** $XDG_STATE_HOME/droverstatus/auth.json and $XDG_RUNTIME_DIR/droverstatus (relative XDG paths are ignored, per the spec) */
export function authPaths(env: NodeJS.ProcessEnv = process.env, home = homedir()) {
  const state = env.XDG_STATE_HOME && isAbsolute(env.XDG_STATE_HOME) ? env.XDG_STATE_HOME : join(home, '.local', 'state');
  const runtime = env.XDG_RUNTIME_DIR && isAbsolute(env.XDG_RUNTIME_DIR) ? env.XDG_RUNTIME_DIR : undefined;
  return { file: join(state, 'droverstatus', 'auth.json'), runtimeDir: runtime && join(runtime, 'droverstatus') };
}

/** missing file = bootstrap mode; refuses files other users can read or that another user owns */
export async function readAuthFile(file: string): Promise<Result<AuthData>> {
  let fh;
  try {
    fh = await open(file, 'r');
  } catch (e) {
    if (errno(e) === 'ENOENT') return { ok: true, value: { version: 1, sessionEpoch: 0 } };
    return { ok: false, error: `cannot read ${file}: ${(e as Error).message}` };
  }
  try {
    const st = await fh.stat();
    if (st.uid !== process.getuid?.()) return { ok: false, error: `${file} is owned by another user` };
    if (st.mode & 0o077) return { ok: false, error: `${file} is readable by group/others (mode ${(st.mode & 0o777).toString(8)}): chmod 600 it` };
    const d = JSON.parse(await fh.readFile('utf8'));
    if (d?.version !== 1) return { ok: false, error: `${file}: unsupported version ${d?.version}` };
    if (d.password !== undefined && !isPhc(d.password)) return { ok: false, error: `${file}: password is not a scrypt hash` };
    if (!Number.isInteger(d.sessionEpoch) || d.sessionEpoch < 0) return { ok: false, error: `${file}: bad sessionEpoch` };
    return { ok: true, value: { version: 1, password: d.password, sessionEpoch: d.sessionEpoch } };
  } catch (e) {
    return { ok: false, error: `cannot read ${file}: ${(e as Error).message}` };
  } finally {
    await fh.close();
  }
}

/** temp file created 0600, fsync, rename; the dir is created 0700 */
export async function writeSecretFile(file: string, content: string): Promise<Result<void>> {
  const dir = dirname(file);
  const tmp = join(dir, `.${basename(file)}.${randomBytes(6).toString('hex')}`);
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const fh = await open(tmp, 'wx', 0o600);
    try {
      await fh.writeFile(content);
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(tmp, file);
    const dh = await open(dir, 'r');
    await dh.sync().finally(() => dh.close());
    return { ok: true, value: undefined };
  } catch (e) {
    await unlink(tmp).catch(() => {});
    return { ok: false, error: `cannot write ${file}: ${(e as Error).message}` };
  }
}

export const writeAuthFile = (file: string, data: AuthData) => writeSecretFile(file, JSON.stringify(data, null, 2) + '\n');

export async function removeFile(file: string): Promise<Result<boolean>> {
  try {
    await unlink(file);
    return { ok: true, value: true };
  } catch (e) {
    return errno(e) === 'ENOENT' ? { ok: true, value: false } : { ok: false, error: `cannot remove ${file}: ${(e as Error).message}` };
  }
}
