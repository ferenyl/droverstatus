# Security policy

## Reporting a vulnerability
Please report privately via GitHub Security Advisories ("Report a vulnerability" under the repository's Security tab). Do not open a public issue.

## Supported versions
Only the latest release (and `main`) receives security fixes.

## Threat model
droverstatus can launch, close and kill Claude agents (via `drover.sh`) and send them messages. Treat access to it as shell-level access to your user account, and treat the password as the key to that account.

In priority order, the threats are:
1. **Other hosts on the network** (LAN, or the internet through a proxy) reaching the port.
2. **Cross-site browser attacks** (CSRF, login CSRF, DNS rebinding).
3. **Other local users.** They can only read files, which the 0600/0700 permissions block.
4. **Processes running as your user are out of scope.** They can already run `drover.sh`, read `~/.claude` and read any 0600 file. No storage option stops them, including an unlocked keyring.

### Controls
- **Network.** The server binds to `127.0.0.1` by default. `--bind <ip>` / `BIND_ADDR` listens elsewhere, with a warning at startup for non-loopback. Plain HTTP sends the password and session cookie unencrypted, so a non-loopback bind is for trusted networks, or behind an HTTPS reverse proxy with `--trust-proxy`.
- **DNS rebinding.** Requests whose `Host` header is not loopback (`127.0.0.1`, `localhost`, `[::1]`), the bound IP, or the host[:port] of an `--allowed-origins` / `ALLOWED_ORIGINS` entry are rejected. With a wildcard bind (`0.0.0.0`, `::`) any IP literal is accepted.
- **Authentication.** Everything under `/api/` needs a session cookie, except `GET /api/auth/session`, `POST /api/auth/login` and `POST /api/auth/logout`. Anything else without a valid session gets `401`. Static assets and the app shell are public so the login page can load. The gate runs before the route handler, so unauthenticated requests cannot open event streams.
- **Password storage.** Only a scrypt hash (`N=2^17, r=8, p=1`, random salt, PHC format) is stored, in `$XDG_STATE_HOME/droverstatus/auth.json` (default `~/.local/state/…`), directory 0700, file 0600, written atomically. The server refuses to start if the file is group- or world-readable or owned by another user. Verification uses a constant-time comparison.
- **Bootstrap token.** While no password is set, a random 256-bit token is generated per start. It is valid only until a password is set, and it is never printed to the journal: on a terminal the login URL carries it in the `#fragment` (which browsers never send to the server or proxy logs), otherwise only the path to `$XDG_RUNTIME_DIR/droverstatus/bootstrap-token` (0600, tmpfs) is printed. The file is deleted when the password is set.
- **Sessions.** Opaque 256-bit random ids held in memory, in `HttpOnly; SameSite=Strict; Path=/` cookies. Sessions expire after 30 days, or after 7 days without use. A password change bumps the session epoch: every other session is invalid and its event streams are closed. A restart logs everyone out.
- **Secure cookies.** Over HTTPS the cookie is named `__Host-droverstatus_session` and carries `Secure`. The scheme is HTTPS only when `--trust-proxy` is set and the proxy sends `X-Forwarded-Proto: https`.
- **Forwarded headers.** `X-Forwarded-For` and `X-Forwarded-Proto` are ignored unless `--trust-proxy` / `TRUST_PROXY` names the proxy. Otherwise a client could spoof its IP (defeating the login limiter) or its scheme. Set it to specific proxy IPs or CIDRs, not `1`, unless nothing else can reach the port.
- **CSRF.** Session cookies are `SameSite=Strict`, and every non-GET request must carry an `Origin` that matches the request `Host` or is in `ALLOWED_ORIGINS`. Login CSRF is covered by the same Origin check on `POST /api/auth/login`. Requests without an `Origin` are not browser requests, so they need a valid session cookie, which only a same-site browser sends.
- **Login limits.** Five failed logins per client IP in 15 minutes, or 100 failures overall in 15 minutes, return `429` with `Retry-After`. Only one scrypt verification runs at a time, which limits CPU and memory exhaustion. A correct password does not clear the global counter.
- **Reset.** `droverstatus reset-password` removes `auth.json` and returns the server to bootstrap mode. `droverstatus set-password` (stdin, no echo on a terminal) writes a new hash and logs out every session. Both need shell access as the same user, which already counts as ownership.
- **Mutations.** The app only reads drover state files. All mutations go through `drover.sh` using `execFile` (no shell), with validated ids.
- **Headers.** Responses carry a strict CSP (`default-src 'self'`), `X-Frame-Options: DENY` and `nosniff`. `/api/auth/*` responses are `Cache-Control: no-store`.
- **Service.** If you run it as a service, use the unit in `docs/droverstatus.service` (extra hardening there is opt-in).

### Known limits
- Anyone who can read your `auth.json` or the bootstrap token file, or who runs code as your user, has full access. This is out of scope (threat 4).
- Plain HTTP on a LAN address exposes the password and cookie to anyone on the network path. Use HTTPS (a reverse proxy) for anything beyond a trusted network.
- The bootstrap token is full access until a password is set. Set one right after the first start.
- Sessions are in memory only. Restarting logs everyone out, which is intentional.
- With no `Origin` header, a request is not checked against the Origin list. Such requests still need a valid session cookie.
