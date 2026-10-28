# droverstatus

Local web UI for drover (the `ferenyl-claude` plugin) corrals: live view of drovers, agents (busy/idle/blocked), tasks, messages and reports, plus create/close/revive corrals, kill agents, send messages and view agent screens. State is read from `~/.claude/drover/<HID>/`; all mutations go through `drover.sh`.

## Requirements
- Linux (tested); macOS untested
- Node >= 22 and npm
- [Zellij](https://zellij.dev)
- The drover plugin `ferenyl-claude` >= 0.9.0 (provides `drover.sh`)

## What this is not
Not multi-user, and not meant to be exposed to the internet without an HTTPS reverse proxy. It has one password, listens on loopback by default and is intended for a trusted LAN at most; see [Authentication](#authentication) and [SECURITY.md](SECURITY.md).

## Screenshots
![Overview](docs/screenshots/1440-dark-overview.png)
![Board](docs/screenshots/1440-dark-board.png)

## Install / run
```
npm install
npm run dev     # server (tsx watch) + vite dev server; ports: npm run dev -- -p 4187 -w 5187
npm start       # build web, then serve everything from the server
npm run build:dist   # single executable: dist/droverstatus (needs Node >= 22)
```
### Single file (dist)
`npm run build:dist` bundles server and UI into one executable, `dist/droverstatus` (needs Node >= 22 on the target machine).
```
./dist/droverstatus              # run directly, UI + API on http://127.0.0.1:4177
./dist/droverstatus -p 5000      # other port (--port 5000)
./dist/droverstatus --bind 192.168.1.5   # non-loopback: use an HTTPS reverse proxy, see Authentication
cp dist/droverstatus ~/.local/bin/ && droverstatus   # install on PATH
droverstatus </dev/null &>/dev/null &!               # in the background, stop with: killall droverstatus
```
Open the URL it prints. Stop with Ctrl+C or Esc.

To run it as a systemd user service that restarts on failure, see the example unit [docs/droverstatus.service](docs/droverstatus.service).

## Configuration
| Env var | Flag | Default | Purpose |
|---|---|---|---|
| `DROVER_ROOT` | | `~/.claude/drover` | Corral state directory. Set it if your Claude config lives elsewhere (`CLAUDE_CONFIG_DIR` is respected when no `DROVER_ROOT` is given) |
| `DROVER_SH` | | `drover.sh` from `PATH`, else the newest `<claude config>/plugins/cache/*/*/*/skills/drover/scripts/drover.sh` | Path to `drover.sh`; the server refuses to start if none is found |
| `ZELLIJ_BIN` | | `zellij` | Zellij binary |
| `PORT` | `-p`, `--port` | `4177` (`4187` with `npm run dev`) | API/UI port |
| `BIND_ADDR` | `--bind` | `127.0.0.1` | Listen address. Non-loopback serves plain HTTP on the LAN, see the warning in [Authentication](#authentication) |
| `TRUST_PROXY` | `--trust-proxy` | unset (off) | Believe `X-Forwarded-For`/`X-Forwarded-Proto` from these proxies: `1` = any, or comma-separated IPs/CIDRs (`172.18.0.0/16`). Needed behind Nginx Proxy Manager, see [Behind a reverse proxy](#behind-a-reverse-proxy-nginx-proxy-manager) |
| `ALLOWED_ORIGINS` | `--allowed-origins` | unset | Comma-separated extra origins (`https://drover.lan,http://box:8080`), e.g. behind a reverse proxy; each is accepted as `Origin` and its host[:port] as `Host` |
| `DROVER_PROJECT_ROOTS` | | unset | Path-list (`:` on Linux) of directories; when set, `POST /api/corrals` only accepts a project `dir` inside one of them (symlinks resolved), otherwise 403 |
| `CLAUDE_CONFIG_DIR` | | `~/.claude` | Claude config dir; the default for `DROVER_ROOT` and the `drover.sh` plugin-cache lookup |
| `XDG_STATE_HOME` | | `~/.local/state` | Holds `droverstatus/auth.json` (the password hash) |
| `XDG_RUNTIME_DIR` | | set by systemd/login | Holds `droverstatus/bootstrap-token` while no password is set |
| `WEB_PORT` | `-w`, `--web-port` | `5187` | Dev only: Vite UI port |
| `DROVER_DEV` | | unset | `1` = API only, UI served by the Vite dev server (set by `npm run dev`) |

Flags win over env vars.

Responses carry a strict `Content-Security-Policy` (`default-src 'self'`, no objects, no framing, `base-uri 'none'`), `X-Frame-Options: DENY` and `nosniff`; the UI must not need external resources.

## Authentication
droverstatus has a single password. Logging in sets an in-memory session cookie (`HttpOnly; SameSite=Strict`). Everything under `/api/` needs a session except the auth endpoints; unauthenticated calls get `401 {"error":"unauthorized"}`. The password is stored only as a scrypt hash.

### First login: the bootstrap token
Until a password is set, the server runs in bootstrap mode and generates a random login token on every start. The token is valid only while no password is set.

- **On a terminal**, the startup message prints the login URL with the token in the fragment: `http://127.0.0.1:4177/login#token=…`. The fragment never reaches the server or a proxy log.
- **Otherwise** (systemd, background, `</dev/null`), only the path is printed. The token is written to `$XDG_RUNTIME_DIR/droverstatus/bootstrap-token` (directory 0700, file 0600, on tmpfs, gone at logout or reboot), and it stays out of the journal. Under systemd, read it with:
  ```
  cat $XDG_RUNTIME_DIR/droverstatus/bootstrap-token
  ```
  Paste it on the login page.
- **If `XDG_RUNTIME_DIR` is unset and there is no terminal**, no token file is written. Start once on a terminal to see the token, or run `droverstatus set-password`.

After logging in with the token you are taken to **Settings** to choose a password. Setting one deletes the token file and disables the token for good.

### Settings page
`/settings`, reached from the app after login, has:
- **Set password** on first run (in bootstrap mode the app goes there until a password exists), or **change password**: current password (or the token, before one is set), and a new password of at least 12 characters. There are no composition rules.
- **Logout**, which drops the current session.

Changing the password logs out every other session and closes their live event streams. Sessions last 30 days, and 7 days without use.

### Reset and set from the shell
Shell access to your account counts as proof of ownership, so there is no web reset.
```
droverstatus reset-password       # removes auth.json: bootstrap mode, a new token is issued
droverstatus set-password         # asks on a terminal (twice); reads one line from stdin otherwise
printf '%s' 'a long passphrase' | droverstatus set-password
```
Run them as the same user that runs the server (they use its `XDG_STATE_HOME`). A running server picks up both without a restart: `reset-password` drops all sessions and issues a new token, `set-password` logs out all sessions. The CLI commands do not start the server.

### Where the password lives
`$XDG_STATE_HOME/droverstatus/auth.json` (default `~/.local/state/droverstatus/auth.json`): directory 0700, file 0600, written atomically. The server refuses to start if the file is group- or world-readable or owned by another user. Deleting it is the same as `reset-password`.

Sessions are kept in memory, so a restart logs everyone out.

### Login limits
Five failed logins from one IP in 15 minutes return `429` with `Retry-After`. There is also a global cap of 100 failures per 15 minutes, which also returns `429`. Only one password check runs at a time, because scrypt is deliberately slow.

### Behind a reverse proxy (Nginx Proxy Manager)
Use HTTPS in front of droverstatus. Browsers do not send `Secure` cookies over plain HTTP, and the server does not know the request was HTTPS unless it trusts the proxy.

1. Run droverstatus on an address the proxy can reach (for example `--bind 192.168.1.5`), and make sure the port is not reachable from anywhere else.
2. Start it with `--trust-proxy` set to the proxy's address as droverstatus sees it. For a proxy in a Docker bridge network that is often the bridge subnet, for example:
   ```
   droverstatus --bind 192.168.1.5 --trust-proxy 172.18.0.0/16 --allowed-origins https://drover.example.com
   ```
   `--trust-proxy 1` trusts any client, which is only safe if nothing else can reach the port.
3. In NPM, add a Proxy Host for `drover.example.com` pointing at `192.168.1.5:4177`, with **Force SSL** enabled. NPM forwards `Host` and sets `X-Forwarded-Proto`, which is what enables the `__Host-` and `Secure` cookie flags.
4. `--allowed-origins` must list the public URL: the browser sends that `Origin`, and the Host guard needs that host.
5. In the proxy host's **Advanced** tab, add `proxy_buffering off;` so live updates are not held back.
6. Optional: an NPM **Access List** (basic auth) in front adds a second login for internet exposure.

Without `--trust-proxy`, forwarded headers are ignored: the login limiter counts the proxy's IP as the client, and cookies are not marked `Secure`.

> **Set a password right after the first start.** Until one is set, the bootstrap token is full access, and anyone who can read it (the runtime file, or the terminal output) can log in. Keep the port off the internet, and never forward it without HTTPS.

See [SECURITY.md](SECURITY.md) for the threat model and [docs/API.md](docs/API.md) for the auth endpoints.

### Reverse proxy (Nginx Proxy Manager)
Add the proxy's origin to `ALLOWED_ORIGINS`. The server sends `X-Accel-Buffering: no` on `/api/events`, but if corrals still show up late after a reload, disable buffering for the event stream in the proxy host's **Advanced** tab:
```nginx
location /api/events {
    proxy_pass $forward_scheme://$server:$port;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```
Enable **HTTP/2 Support** on the SSL tab. Over HTTP/1.1, browsers allow only 6 connections per host, and each open tab holds one event stream.

## Documentation
- [docs/API.md](docs/API.md): HTTP routes, auth endpoints, error shapes, SSE events
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data flow, auth and drover version policy
- [docs/droverstatus.service](docs/droverstatus.service): hardened systemd user unit

## Development
```
npm run lint        # eslint (toolchain in lint/, separate because typescript-eslint lacks TypeScript 7 support)
npm run typecheck
npm test
```
`npm start` rebuilds the web UI when `web/src`, `web/index.html` or `shared/src` are newer than `web/dist`. Node version: see `.nvmrc` (engines are enforced via `.npmrc`).

## Tests
```
npm test                                  # vitest (server, shared, web)
npm run test:e2e                          # start server+web on fixtures, run until Ctrl-C
npm run test:e2e -- npx playwright test   # run a command against it, then tear down
```
`test:e2e` copies `testkit/fixtures` to a tmp dir and points `DROVER_ROOT`, `DROVER_SH` and `ZELLIJ_BIN` at it and at `testkit/fake/{drover.sh,zellij}` (server :4178, web :5178). `HOME`, `XDG_STATE_HOME` and `XDG_RUNTIME_DIR` are also isolated in that tmp dir, so the real password file and token are never touched. Real corrals and zellij sessions are never touched. The command gets `E2E_URL`, `E2E_API`, `DROVER_ROOT` and `DROVER_CALLS`.

Fixtures: `a1a1a1a1` live (busy/blocked/idle agents), `b2b2b2b2` dead, `c3c3c3c3` closed, `d4d4d4d4` live with worktrees (close exits 4).

While it runs, in `$DROVER_ROOT`:
- `.calls.log` – every fake `drover.sh` call
- `echo "close=3:msg" > .exit` – force an exit code for a command (or env `FAKE_EXIT_<CMD>=n`)
- `.zellij-sessions` – edit to flip liveness (`(EXITED` = dead)

## Security
See [SECURITY.md](SECURITY.md). The server binds to 127.0.0.1 by default. It needs a password once set, but it serves HTTP only: `--bind <ip>` (or `BIND_ADDR`) on a LAN address is for trusted networks, and anything beyond that should go through an HTTPS reverse proxy with `--trust-proxy`. `Host` headers other than loopback, the bound IP and `ALLOWED_ORIGINS` hosts are rejected.

## License
GPL-3.0-only, see [LICENSE](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
