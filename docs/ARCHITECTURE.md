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

## drover version policy
`MIN_DROVER_VERSION` in `server/src/config.ts` is the oldest `ferenyl-claude` plugin version known to work. The plugin version is read from `.claude-plugin/plugin.json` above `drover.sh`; an older one only produces a startup warning, it does not block. Raise the constant when droverstatus starts depending on newer `drover.sh` behaviour and update the README requirement.
