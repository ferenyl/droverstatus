// SPDX-License-Identifier: GPL-3.0-only

/** failed logins per client IP and overall in a sliding window, plus a single scrypt verify slot */
export class LoginLimiter {
  private readonly fails = new Map<string, number[]>();
  private global: number[] = [];
  private busy = false;

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly globalMax = 100,
    private readonly now = Date.now,
  ) {}

  /** ms until `ip` may try again; 0 = allowed */
  retryIn(ip: string): number {
    const t = this.now();
    const live = (xs: number[]) => xs.filter((x) => t - x < this.windowMs);
    this.global = live(this.global);
    const mine = live(this.fails.get(ip) ?? []);
    if (mine.length) this.fails.set(ip, mine);
    else this.fails.delete(ip);
    if (mine.length >= this.max) return mine[mine.length - this.max] + this.windowMs - t;
    if (this.global.length >= this.globalMax) return this.global[this.global.length - this.globalMax] + this.windowMs - t;
    return 0;
  }

  fail(ip: string): void {
    const t = this.now();
    this.fails.set(ip, [...(this.fails.get(ip) ?? []), t]);
    this.global.push(t);
  }

  succeed(ip: string): void {
    this.fails.delete(ip);
  }

  /** false while another verify runs */
  acquire(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }

  release(): void {
    this.busy = false;
  }
}
