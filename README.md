# droverstatus

Local web UI for [drover](https://github.com/Ferenyl) corrals: live view of drovers, agents (busy/idle/blocked), tasks, messages and reports, plus create/close/revive corrals, kill agents, send messages and view agent screens. State is read from `~/.claude/drover/<HID>/`; all mutations go through `drover.sh`.

## Prerequisites
Node 22+, npm, `zellij`, and the drover skill's `drover.sh`.

## Install / run
```
npm install
npm run dev     # server (tsx watch) + vite dev server
npm start       # build web, then serve everything from the server
```
Default URL: http://127.0.0.1:4177

## Environment
| Var | Default |
|---|---|
| `DROVER_ROOT` | `~/.claude/drover` |
| `DROVER_SH` | `~/projects/oss/claudeskills/plugins/ferenyl-claude/skills/drover/scripts/drover.sh` |
| `ZELLIJ_BIN` | `zellij` |
| `PORT` | `4177` |

## Tests
```
npm test                                  # vitest (server, shared, web)
npm run test:e2e                          # start server+web on fixtures, run until Ctrl-C
npm run test:e2e -- npx playwright test   # run a command against it, then tear down
```
`test:e2e` copies `testkit/fixtures` to a tmp dir and points `DROVER_ROOT`, `DROVER_SH` and `ZELLIJ_BIN` at it and at `testkit/fake/{drover.sh,zellij}` (server :4178, web :5178). Real corrals and zellij sessions are never touched. The command gets `E2E_URL`, `E2E_API`, `DROVER_ROOT` and `DROVER_CALLS`.

Fixtures: `a1a1a1a1` live (busy/blocked/idle agents), `b2b2b2b2` dead, `c3c3c3c3` closed, `d4d4d4d4` live with worktrees (close exits 4).

While it runs, in `$DROVER_ROOT`:
- `.calls.log` – every fake `drover.sh` call
- `echo "close=3:msg" > .exit` – force an exit code for a command (or env `FAKE_EXIT_<CMD>=n`)
- `.zellij-sessions` – edit to flip liveness (`(EXITED` = dead)

## Security
The server binds to 127.0.0.1 only and rejects other `Host` headers. It can launch and stop agents, so do not expose it (no port forwarding or reverse proxy).
