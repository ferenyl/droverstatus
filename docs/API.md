# API reference

JSON over HTTP on the server port. Mutating requests (`POST`/`DELETE`) from a browser must carry an `Origin` matching the request `Host` or listed in `ALLOWED_ORIGINS`; every request must carry a `Host` of loopback, the bound IP (or any IP literal on a wildcard bind) or an `ALLOWED_ORIGINS` host. Every route except the auth endpoints below needs a session cookie from `POST /api/auth/login`; without one the answer is `401 {"error":"unauthorized"}`. See [README: Authentication](../README.md#authentication) and [SECURITY.md](../SECURITY.md). Types live in `shared/src/types.ts`.

- `hid`: 8 hex chars. Agent `id`: kebab-case.
- Errors are `ApiError`: `{ error, stderr?, code?, worktrees? }` with a 4xx/5xx status. A failing `drover.sh` call gives 500 with `stderr` and its exit `code`.
- Auth responses (`/api/auth/*`) carry `Cache-Control: no-store`.

## Auth
Sessions use the cookie `droverstatus_session` (`__Host-droverstatus_session` with `Secure` over HTTPS): `HttpOnly; SameSite=Strict; Path=/`, 30-day max age, 7 days idle. Login and password endpoints also set a fresh cookie; logout clears it.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/auth/session` | | `{ authenticated: boolean, passwordSet: boolean }`. Public |
| POST | `/api/auth/login` | `{ password?: string, token?: string }` (`password` once set, otherwise the bootstrap `token`) | 204 + session cookie; 401 `invalid credentials`; 429 `too many attempts` or `login busy` with `Retry-After`; 503 if `auth.json` is unusable. Public, Origin-checked |
| POST | `/api/auth/logout` | | 204, drops the session and clears the cookie. Public |
| POST | `/api/auth/password` | `{ current?: string, token?: string, password: string }` (`current` once a password is set, otherwise the `token`; `password` 12 to 1024 characters) | 204 + new session cookie (every other session is ended); 400 bad password; 401 invalid credentials; 429 as above |

- Any other `/api/*` route without a valid session: `401 {"error":"unauthorized"}`, before the route runs. This includes `/api/events`, so unauthenticated clients cannot use up the event-stream limit.
- `GET /api/auth/session` is the way for a client to check login state, since `EventSource` cannot read a 401.
- A password change ends every other session and closes their open `/api/events` streams.
- The bootstrap token is accepted only while `passwordSet` is `false`. Once a password is set, it is rejected.

## Routes
| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/api/corrals` | | `Corral[]` |
| GET | `/api/events` | | SSE stream, see below |
| POST | `/api/corrals` | `{ slug, dir, model?, brief? }` (`dir` absolute, existing) | 201 `{ hid }` |
| DELETE | `/api/corrals/:hid` | `?worktrees=remove\|keep` | `{ ok }`; 409 with `worktrees` (close exits 4) when worktrees exist; 409 if already closed |
| POST | `/api/corrals/:hid/revive` | | `{ ok }`; 409 if closed or alive |
| POST | `/api/corrals/:hid/messages` | `{ message, to? }` (`to` = `drover` or an agent id) | `{ ok }` |
| GET | `/api/corrals/:hid/messages` | `?before=<byte offset>` | `{ messages, offset }` (200 per page, `offset` for the next older page) |
| POST | `/api/corrals/:hid/agents/:id/flush` | | `{ ok }` |
| DELETE | `/api/corrals/:hid/agents/:id` | | `{ ok }` (kills the agent) |
| GET | `/api/corrals/:hid/agents/:id/screen` | `?lines=1..500` (default 40) | `{ screen }` |
| GET | `/api/corrals/:hid/worktrees` | | `Worktree[]` (runs git status per worktree) |
| GET | `/api/corrals/:hid/brief` | | `text/markdown` |
| GET | `/api/corrals/:hid/stories/:id` | | `text/markdown` |
| GET | `/api/corrals/:hid/reports/:id` | | `text/markdown` |
| GET | `/api/corrals/:hid/doc` | `?path=<absolute path>` (must be registered for the corral) | `text/markdown` |

Status codes: 400 bad input, 401 no valid session, 403 bad Host/Origin or project `dir` outside `DROVER_PROJECT_ROOTS`, 404 unknown corral/agent/file, 409 state conflict or action already in progress, 413 doc too large, 429 too many failed logins, 500 `drover.sh` failure, 503 too many event streams (or auth unavailable on login).

- Lifecycle actions (create, close, revive, flush, kill, ...) run one at a time per target; a concurrent duplicate gets 409 `action already in progress`.
- `POST /api/corrals` returns 403 `project dir outside allowed roots` when `DROVER_PROJECT_ROOTS` is set and `dir` (after resolving symlinks) is not inside any listed root.
- Every response has `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`, plus `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- `CLAUDE_CONFIG_DIR` moves the default `DROVER_ROOT` (`<dir>/drover`) and the `drover.sh` plugin-cache lookup.

## SSE events (`/api/events`)
Each event has `event: <type>` and `data: <json>`; comment lines `: ping` every 25 s keep the connection alive.

| Type | Data |
|---|---|
| `snapshot` | `{ type, corrals: Corral[] }`, sent once on connect |
| `corral-updated` | `{ type, hid, corral }` |
| `corral-removed` | `{ type, hid }` |

Without a session the stream is refused with `401` before any event is sent. At most 50 event streams are served at once; further connections get 503 `too many event streams`. On reconnect the client gets a fresh `snapshot`; there is no replay.
