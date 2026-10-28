// SPDX-License-Identifier: GPL-3.0-only
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt cost as log2(N), block size and parallelism */
export interface ScryptParams {
  ln: number;
  r: number;
  p: number;
}

/** OWASP: N=2^17, r=8, p=1 */
export const SCRYPT_PARAMS: ScryptParams = { ln: 17, r: 8, p: 1 };
const KEYLEN = 64;
const PHC = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');

const derive = (password: string, salt: Buffer, { ln, r, p }: ScryptParams, keylen: number) =>
  new Promise<Buffer>((resolve, reject) =>
    // twice the 128*N*r scrypt needs; Node's 32 MiB default is too low for N=2^17
    scrypt(password.normalize('NFKC'), salt, keylen, { N: 2 ** ln, r, p, maxmem: 256 * 2 ** ln * r }, (e, key) => (e ? reject(e) : resolve(key))),
  );

export const isPhc = (s: unknown): s is string => typeof s === 'string' && PHC.test(s);

/** PHC string `$scrypt$ln=17,r=8,p=1$<salt>$<hash>` */
export async function hashPassword(password: string, params = SCRYPT_PARAMS): Promise<string> {
  const salt = randomBytes(16);
  const { ln, r, p } = params;
  return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(await derive(password, salt, params, KEYLEN))}`;
}

/** `rehash`: the password matched but the stored parameters differ from `params` */
export async function verifyPassword(password: string, phc: string, params = SCRYPT_PARAMS): Promise<{ ok: boolean; rehash: boolean }> {
  const m = PHC.exec(phc);
  if (!m) return { ok: false, rehash: false };
  const [ln, r, p] = [m[1], m[2], m[3]].map(Number);
  // the file is 0600, but never let it ask for absurd memory
  if (ln > 22 || r > 32 || p > 16) return { ok: false, rehash: false };
  const hash = Buffer.from(m[5], 'base64');
  try {
    const ok = timingSafeEqual(await derive(password, Buffer.from(m[4], 'base64'), { ln, r, p }, hash.length), hash);
    return { ok, rehash: ok && (ln !== params.ln || r !== params.r || p !== params.p) };
  } catch {
    return { ok: false, rehash: false };
  }
}
