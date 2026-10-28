# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).

## [0.1.0] - Unreleased
### Added
- Password authentication. Until a password is set, a bootstrap token is printed on a terminal, or its path is printed under systemd (`$XDG_RUNTIME_DIR/droverstatus/bootstrap-token`). A Settings page sets and changes the password and logs out.
- Password stored as a scrypt hash in `$XDG_STATE_HOME/droverstatus/auth.json` (0600, atomic writes, refused if readable by others).
- `droverstatus reset-password` and `droverstatus set-password` (reads stdin); a running server picks up both without a restart.
- Sessions: in-memory, `HttpOnly; SameSite=Strict` cookies (`__Host-` and `Secure` over HTTPS), 30-day max age, 7 days idle. A password change logs out other sessions and closes their event streams.
- Login rate limit: 429 after 5 failed logins per IP in 15 minutes, plus a global cap; one scrypt check at a time.
- `--trust-proxy` / `TRUST_PROXY` to trust `X-Forwarded-For` and `X-Forwarded-Proto` from a reverse proxy such as Nginx Proxy Manager.
- `--bind <ip>` / `BIND_ADDR` to listen on a non-loopback address (default `127.0.0.1`); warns at startup, Host guard accepts the bound IP.
- `--allowed-origins` / `ALLOWED_ORIGINS` (comma-separated) to accept extra origins, e.g. behind a reverse proxy; their hosts pass the Host guard.
- Live view of drover corrals, agents (busy/idle/blocked), tasks, messages and reports via SSE.
- Create, close (with worktree prompt) and revive corrals; kill agents; send messages; view agent screens.
- Test kit: synthetic fixtures, fake `drover.sh`/`zellij`, `npm run test:e2e`.
