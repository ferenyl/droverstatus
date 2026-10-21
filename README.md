# droverstatus

Local web UI for drover (the `ferenyl-claude` plugin) corrals: live view of drovers, agents (busy/idle/blocked), tasks, messages and reports, plus create/close/revive corrals, kill agents, send messages and view agent screens. State is read from `~/.claude/drover/<HID>/`; all mutations go through `drover.sh`.

## Requirements
- Linux (tested); macOS untested
- Node >= 22 and npm
- [Zellij](https://zellij.dev)
- The drover plugin `ferenyl-claude` >= 0.9.0 (provides `drover.sh`)

## What this is not
No authentication, no multi-user support, not for remote access. It is a localhost-only tool; see [SECURITY.md](SECURITY.md).

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
cp dist/droverstatus ~/.local/bin/ && droverstatus   # install on PATH
droverstatus </dev/null &>/dev/null &!               # in the background, stop with: killall droverstatus
```
Open the URL it prints. Stop with Ctrl+C or Esc.

## Environment
| Var | Default |
|---|---|
| `DROVER_ROOT` | `~/.claude/drover` |
| `DROVER_SH` | `drover.sh` from `PATH`, else the newest `~/.claude/plugins/cache/*/*/*/skills/drover/scripts/drover.sh`; the server refuses to start if none is found |
| `ZELLIJ_BIN` | `zellij` |
| `PORT` | `4177` (overridden by `--port`/`-p`) |
| `WEB_PORT` | `5187`, dev only: Vite UI port (overridden by `--web-port`/`-w`) |

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
See [SECURITY.md](SECURITY.md). The server binds to 127.0.0.1 only and rejects other `Host` headers. It can launch and stop agents, so do not expose it (no port forwarding or reverse proxy).

## License
GPL-3.0-only, see [LICENSE](LICENSE). Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
