# Architecture

droverstatus is a read-mostly view over files plus a thin command layer over `drover.sh`.

```
$DROVER_ROOT/<HID>/*  --chokidar-->  watcher --> Store --SSE--> web UI
                                       liveness (zellij) -^        |
web UI --HTTP mutations--> routes --execFile--> drover.sh ---------+
```

- **Files are the source of truth.** Corral state (registry, status, tasks, messages, reports, stories, docs) is written by drover and its agents under `DROVER_ROOT`. droverstatus never writes these files.
- **Watcher -> Store -> SSE.** `watcher.ts` watches the root and tells `Store` which corral changed; `Store` re-reads that corral, and if it differs emits `updated`/`removed`. `GET /api/events` forwards these as `corral-updated`/`corral-removed` after a `snapshot`.
- **Liveness.** `liveness.ts` periodically asks Zellij which sessions are alive and updates corrals.
- **Mutations** go only through `DroverCli` (`droverCli.ts`), which runs `drover.sh` with `execFile` (no shell) and validated ids.
- **Packages:** `shared` (types, id regexes), `server` (Fastify), `web` (React + Vite). `build:dist` bundles server and UI into one executable.

## Request pipeline and auth
`app.ts` registers two `onRequest` hooks, in this order:
1. **Host/Origin guard.** DNS-rebinding and cross-site checks, as before.
2. **Auth gate** (`server/src/auth/routes.ts`). Any `/api/*` route other than the auth endpoints needs a valid session, otherwise `401`. It runs before the handler, so the SSE route is gated too.

`server/src/auth/` is split by responsibility:
- `auth.ts`: the `Auth` object. Holds the password hash and the bootstrap token, checks logins (rate limit, one scrypt verify at a time), changes passwords, and watches `auth.json` so CLI changes reach a running server.
- `file.ts`: paths (`$XDG_STATE_HOME/droverstatus/auth.json`, `$XDG_RUNTIME_DIR/droverstatus/bootstrap-token`), the versioned `auth.json` format, atomic 0600 writes, and the permission check.
- `hash.ts`: scrypt PHC hashing and verification.
- `sessions.ts`: in-memory sessions with an epoch. A password change ends them and closes their event streams.
- `limiter.ts`: failed-login counters per IP and globally, plus the single verify slot.
- `cookie.ts`: the session cookie (`__Host-` and `Secure` over HTTPS only) and its parser.
- `cli.ts`: `droverstatus reset-password` and `set-password`. They run before the server starts and need no `drover.sh`.

Apart from the mutations above, droverstatus writes only `auth.json` and the bootstrap-token file, both via `Auth` or the CLI. The token exists only while `auth.json` has no password.

`--trust-proxy` (`TRUST_PROXY`) sets Fastify's `trustProxy`, so `req.ip` and `req.protocol` honour `X-Forwarded-*` from the listed proxies. Without it, the login limiter and the cookie scheme use the direct connection only.

## drover version policy
`MIN_DROVER_VERSION` in `server/src/config.ts` is the oldest `ferenyl-claude` plugin version known to work. The plugin version is read from `.claude-plugin/plugin.json` above `drover.sh`; an older one only produces a startup warning, it does not block. Raise the constant when droverstatus starts depending on newer `drover.sh` behaviour and update the README requirement.
