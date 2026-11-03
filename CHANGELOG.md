# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [0.3.0] - 2026-11-03
### Added
- Agent controls: change model, permission mode and purpose; get a create-PR link (pushes the agent's branch).
- Kill an agent with an optional reason (`drover.sh kill --reason`).
- Tasks: dispatch (optionally with a fresh context) and approve a write scope for the task's owner; approved scopes are shown.
- Corral flow: show and set the flow and tracker steps.
- Purpose, PR link, approve, flow and kill reason need drover >= 0.14.
- API routes for the above; agents carry `perm`, tasks `approved`, corrals and stories `flow`.
### Changed
- `POST /api/corrals` no longer takes `model`; the model picker on New drover is removed (the drover always runs sonnet).
### Fixed
- Creating a corral failed with drover.sh >= 0.13.6 (`unknown option: --model`).

## [0.2.3] - 2026-10-30
### Changed
- Hashed web assets are cached; `index.html` is revalidated.

## [0.2.2] - 2026-10-30
### Added
- Docs: show HTML (sandboxed) and image files.

## [0.2.1] - 2026-10-29
### Added
- Installable as a PWA (manifest, icons).
### Changed
- Requires Node 26 (latest LTS).

## [0.2.0] - 2026-10-28
### Added
- Password authentication. Until a password is set, a bootstrap token is printed on a terminal, or its path is printed under systemd (`$XDG_RUNTIME_DIR/droverstatus/bootstrap-token`). A Settings page sets and changes the password and logs out.
- Password stored as a scrypt hash in `$XDG_STATE_HOME/droverstatus/auth.json` (0600, atomic writes, refused if readable by others).
- `droverstatus reset-password` and `droverstatus set-password` (reads stdin); a running server picks up both without a restart.
- Sessions: in-memory, `HttpOnly; SameSite=Strict` cookies (`__Host-` and `Secure` over HTTPS), 30-day max age, 7 days idle. A password change logs out other sessions and closes their event streams.
- Login rate limit: 429 after 5 failed logins per IP in 15 minutes, plus a global cap; one scrypt check at a time.
- `--trust-proxy` / `TRUST_PROXY` to trust `X-Forwarded-For` and `X-Forwarded-Proto` from a reverse proxy such as Nginx Proxy Manager.
- `--bind <ip>` / `BIND_ADDR` to listen on a non-loopback address (default `127.0.0.1`); warns at startup, Host guard accepts the bound IP.
- Corral docs update live when a file changes on disk.
- Docs: serve JSON and config text files, JSON highlighting, Prettify button.
### Fixed
- `/api/events` sends `X-Accel-Buffering: no` so reverse proxies do not buffer the stream.

## [0.1.8] - 2026-10-23
### Fixed
- `DROVER_ROOT` and `CLAUDE_CONFIG_DIR` are forwarded to detached actions.

## [0.1.7] - 2026-10-23
### Added
- `--allowed-origins` / `ALLOWED_ORIGINS` (comma-separated) to accept extra origins, e.g. behind a reverse proxy; their hosts pass the Host guard.

## [0.1.6] - 2026-10-23
### Changed
- Corral actions run via the systemd user manager, so corrals never share droverstatus' process tree, cgroup or sandbox.

## [0.1.5] - 2026-10-23
### Changed
- Create Claude artifact button is primary and right-aligned.

## [0.1.4] - 2026-10-22
### Changed
- Offline banner only shows after a connection was lost; web UX refinements.
- Origin guard limits the dev UI port to loopback or the bound IP; `/doc` allows txt/log; IPv6 URLs are bracketed.

## [0.1.3] - 2026-10-22
### Added
- Example systemd user unit and README section for the single-file build.
- Markdown/doc views, worktrees, reports and story board.

## [0.1.2] - 2026-10-21
### Added
- Dev port flags (`-p`/`-w`, `WEB_PORT`); connections are force-closed on shutdown.

## [0.1.1] - 2026-10-21
### Changed
- Dev server is API only (`DROVER_DEV=1`); the UI runs on Vite port 5187.

## [0.1.0] - 2026-10-21
### Added
- Live view of drover corrals, agents (busy/idle/blocked), tasks, messages and reports via SSE.
- Create, close (with worktree prompt) and revive corrals; kill agents; send messages; view agent screens.
- Test kit: synthetic fixtures, fake `drover.sh`/`zellij`, `npm run test:e2e`.
