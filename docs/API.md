# API reference

JSON over HTTP on the server port. Mutating requests (`POST`/`DELETE`) from a browser must carry an `Origin` matching the request `Host`; every request must carry a `Host` of loopback, the bound IP (or any IP literal on a wildcard bind). There is no authentication, see [SECURITY.md](../SECURITY.md). Types live in `shared/src/types.ts`.

- `hid`: 8 hex chars. Agent `id`: kebab-case.
- Errors are `ApiError`: `{ error, stderr?, code?, worktrees? }` with a 4xx/5xx status. A failing `drover.sh` call gives 500 with `stderr` and its exit `code`.

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

Status codes: 400 bad input, 403 bad Host/Origin or project `dir` outside `DROVER_PROJECT_ROOTS`, 404 unknown corral/agent/file, 409 state conflict or action already in progress, 413 doc too large, 500 `drover.sh` failure, 503 too many event streams.

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

At most 50 event streams are served at once; further connections get 503 `too many event streams`. On reconnect the client gets a fresh `snapshot`; there is no replay.
