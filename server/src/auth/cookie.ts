// SPDX-License-Identifier: GPL-3.0-only
import { SESSION_MAX_AGE_S } from './sessions.js';

const NAME = 'droverstatus_session';

/** the session id from a Cookie header (`__Host-` name over HTTPS, plain name otherwise) */
export function sessionFromCookie(header: string | undefined): string | undefined {
  let plain: string | undefined;
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    const [k, v] = [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    if (i < 0 || !v) continue;
    if (k === `__Host-${NAME}`) return v;
    if (k === NAME) plain ??= v;
  }
  return plain;
}

/** `Secure` and `__Host-` only over HTTPS: browsers drop Secure cookies on plain-HTTP LAN addresses */
export function sessionCookie(id: string, https: boolean, maxAge = SESSION_MAX_AGE_S): string {
  return `${https ? '__Host-' : ''}${NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

export const clearedCookie = (https: boolean) => sessionCookie('', https, 0);
