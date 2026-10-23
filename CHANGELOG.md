# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [0.1.0] - Unreleased
### Added
- `--bind <ip>` / `BIND_ADDR` to listen on a non-loopback address (default `127.0.0.1`); warns at startup, Host guard accepts the bound IP.
- `--allowed-origins` / `ALLOWED_ORIGINS` (comma-separated) to accept extra origins, e.g. behind a reverse proxy; their hosts pass the Host guard.
- Live view of drover corrals, agents (busy/idle/blocked), tasks, messages and reports via SSE.
- Create, close (with worktree prompt) and revive corrals; kill agents; send messages; view agent screens.
- Test kit: synthetic fixtures, fake `drover.sh`/`zellij`, `npm run test:e2e`.
