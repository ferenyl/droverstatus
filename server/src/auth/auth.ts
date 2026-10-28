// SPDX-License-Identifier: GPL-3.0-only
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { type FSWatcher, watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { MIN_PASSWORD_LENGTH } from '@droverstatus/shared';
import { type AuthData, type Result, readAuthFile, removeFile, writeAuthFile, writeSecretFile } from './file.js';
import { type ScryptParams, hashPassword, SCRYPT_PARAMS, verifyPassword } from './hash.js';
import { LoginLimiter } from './limiter.js';
import { Sessions } from './sessions.js';

export const MAX_PASSWORD_LENGTH = 1024;

export interface AuthOpts {
  /** auth.json */
  file: string;
  /** where bootstrap-token is written (0700 dir); unset = token only in memory */
  runtimeDir?: string;
  params?: ScryptParams;
  limiter?: LoginLimiter;
  sessions?: Sessions;
  log?: (msg: string) => void;
}

export type AuthFailure = { ok: false; status: number; error: string; retryAfter?: number };
/** `session`: the new session id for the cookie */
export type AuthOutcome = { ok: true; session: string } | AuthFailure;

const fail = (status: number, error: string, retryAfter?: number): AuthFailure => ({ ok: false, status, error, retryAfter });
const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
export const validPassword = (p: unknown): p is string => typeof p === 'string' && [...p].length >= MIN_PASSWORD_LENGTH && p.length <= MAX_PASSWORD_LENGTH;

/**
 * Password hash in auth.json, the bootstrap token while no password is set, and in-memory sessions.
 * Watches auth.json so a CLI reset-password/set-password reaches a running server.
 * Emits 'bootstrap' (token, tokenFile?) whenever a new bootstrap token is generated.
 */
export class Auth extends EventEmitter {
  private token?: string;
  /** set while auth.json is unusable: every login fails closed */
  private broken?: string;
  private watcher?: FSWatcher;
  private reloadTimer?: NodeJS.Timeout;
  private reloading = Promise.resolve();
  private readonly params: ScryptParams;
  private readonly limiter: LoginLimiter;
  private readonly sessions: Sessions;
  private readonly log: (msg: string) => void;

  private constructor(
    private readonly opts: AuthOpts,
    private data: AuthData,
  ) {
    super();
    this.params = opts.params ?? SCRYPT_PARAMS;
    this.limiter = opts.limiter ?? new LoginLimiter();
    this.sessions = opts.sessions ?? new Sessions();
    this.log = opts.log ?? ((m) => console.warn(`droverstatus: ${m}`));
  }

  /** fails on an unreadable, foreign or group/world-readable auth.json */
  static async open(opts: AuthOpts): Promise<Result<Auth>> {
    const r = await readAuthFile(opts.file);
    if (!r.ok) return r;
    try {
      await mkdir(dirname(opts.file), { recursive: true, mode: 0o700 });
    } catch (e) {
      return { ok: false, error: `cannot create ${dirname(opts.file)}: ${(e as Error).message}` };
    }
    const auth = new Auth(opts, r.value);
    if (!r.value.password) await auth.enterBootstrap();
    auth.watch();
    return { ok: true, value: auth };
  }

  get passwordSet(): boolean {
    return !!this.data.password;
  }

  get tokenFile(): string | undefined {
    return this.opts.runtimeDir && join(this.opts.runtimeDir, 'bootstrap-token');
  }

  /** only while no password is set */
  get bootstrapToken(): string | undefined {
    return this.data.password ? undefined : this.token;
  }

  valid(session: string | undefined): boolean {
    return this.sessions.check(session, this.data.sessionEpoch);
  }

  track(session: string | undefined, end: () => void): () => void {
    return this.sessions.track(session, end);
  }

  logout(session: string | undefined): void {
    if (session !== undefined) this.sessions.delete(session);
  }

  /** the password once set, otherwise the bootstrap token */
  async login(ip: string, password: unknown, token: unknown): Promise<AuthOutcome> {
    const f = await this.authenticate(ip, password, token);
    return f ?? { ok: true, session: this.sessions.create(this.data.sessionEpoch) };
  }

  /** needs the current password (or the bootstrap token before one is set); ends every other session */
  async changePassword(ip: string, current: unknown, token: unknown, password: unknown): Promise<AuthOutcome> {
    if (!validPassword(password)) return fail(400, `password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters`);
    const f = await this.authenticate(ip, current, token);
    if (f) return f;
    const w = await this.store(await hashPassword(password, this.params), this.data.sessionEpoch + 1);
    if (!w.ok) return fail(500, w.error);
    return { ok: true, session: this.sessions.create(this.data.sessionEpoch) };
  }

  async close(): Promise<void> {
    clearTimeout(this.reloadTimer);
    this.watcher?.close();
    this.sessions.clear();
    await this.reloading;
    if (this.tokenFile && this.token) await removeFile(this.tokenFile);
  }

  /** undefined = authenticated */
  private async authenticate(ip: string, password: unknown, token: unknown): Promise<AuthFailure | undefined> {
    if (this.broken) return fail(503, 'authentication unavailable, see the server log');
    const wait = this.limiter.retryIn(ip);
    if (wait) return fail(429, 'too many attempts', Math.ceil(wait / 1000));
    const phc = this.data.password;
    if (!phc) {
      if (typeof token !== 'string' || !this.token || !sameSecret(token, this.token)) return this.reject(ip);
      this.limiter.succeed(ip);
      return undefined;
    }
    if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD_LENGTH) return this.reject(ip);
    // scrypt is CPU and memory heavy: one verify at a time
    if (!this.limiter.acquire()) return fail(429, 'login busy, try again', 1);
    let v;
    try {
      v = await verifyPassword(password, phc, this.params);
    } finally {
      this.limiter.release();
    }
    if (!v.ok) return this.reject(ip);
    this.limiter.succeed(ip);
    if (v.rehash && this.data.password === phc) {
      const w = await this.store(await hashPassword(password, this.params), this.data.sessionEpoch);
      if (!w.ok) this.log(`rehash failed: ${w.error}`);
    }
    return undefined;
  }

  private reject(ip: string): AuthFailure {
    this.limiter.fail(ip);
    return fail(401, 'invalid credentials');
  }

  /** memory first, so the watcher sees its own write as unchanged */
  private async store(password: string, sessionEpoch: number): Promise<Result<void>> {
    const prev = this.data;
    this.data = { version: 1, password, sessionEpoch };
    const w = await writeAuthFile(this.opts.file, this.data);
    if (!w.ok) {
      this.data = prev;
      return w;
    }
    if (sessionEpoch !== prev.sessionEpoch) this.sessions.clear();
    await this.leaveBootstrap();
    return w;
  }

  private async enterBootstrap() {
    this.token = randomBytes(32).toString('base64url');
    const file = this.tokenFile;
    if (file) {
      const w = await writeSecretFile(file, this.token + '\n');
      if (!w.ok) this.log(w.error);
    }
    this.emit('bootstrap', this.token, file);
  }

  private async leaveBootstrap() {
    if (!this.token) return;
    this.token = undefined;
    if (this.tokenFile) {
      const r = await removeFile(this.tokenFile);
      if (!r.ok) this.log(r.error);
    }
  }

  private watch() {
    const name = basename(this.opts.file);
    try {
      this.watcher = watch(dirname(this.opts.file), (_e, f) => {
        if (f !== name) return;
        clearTimeout(this.reloadTimer);
        this.reloadTimer = setTimeout(() => (this.reloading = this.reloading.then(() => this.reload())), 100);
      });
      this.watcher.on('error', (e) => this.log(`cannot watch ${this.opts.file}: ${e.message}`));
    } catch (e) {
      this.log(`cannot watch ${this.opts.file}: ${(e as Error).message}`);
    }
  }

  /** picks up reset-password (file removed) and set-password (epoch bumped) from the CLI */
  private async reload() {
    const r = await readAuthFile(this.opts.file);
    if (!r.ok) {
      if (this.broken !== r.error) this.log(`${r.error}; logins are disabled until it is fixed`);
      this.broken = r.error;
      this.sessions.clear();
      return;
    }
    if (this.broken) this.log(`${this.opts.file} is usable again`);
    this.broken = undefined;
    const prev = this.data;
    this.data = r.value;
    if (!r.value.password) {
      if (prev.password || !this.token) {
        this.sessions.clear();
        await this.enterBootstrap();
      }
      return;
    }
    if (r.value.sessionEpoch !== prev.sessionEpoch) this.sessions.clear();
    await this.leaveBootstrap();
  }
}
