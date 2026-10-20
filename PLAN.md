# Droverstatus – webbapp för corrals, drovers och agenter

## Context
Drover-skillen (`/home/ferenyl/projects/oss/claudeskills/plugins/ferenyl-claude/skills/drover`) orkestrerar Claude-agenter i Zellij-sessioner ("corrals"). Status finns idag bara i corral-tabben (`drover-dashboard.sh` via `watch -n2`). Målet: en lokal webbapp – en liten software factory – som visar alla corrals/drovers/agenter i realtid och kan skapa, stänga, revive:a drovers, döda agenter, skicka meddelanden och visa agentskärmar.

Steg 0 vid implementation: spara denna plan som `/home/ferenyl/projects/oss/droverstatus/PLAN.md` (plan mode tillåter bara plan-filen nu).

## Datakällor (läses, skrivs aldrig av appen)
`~/.claude/drover/<HID>/`:
- `registry.json` – `id, session, project, slug, drover_cwd, closed, shutdown, drover{mode,model,session_id,tab_id}, agents{<id>:{model,tab_name,tab_id,pane_id,purpose,cwd}}`
- `status/<id>.json` (inkl. `drover.json`) – `{state: busy|idle|blocked, session_id, transcript_path, cwd, at}` (skrivs av `drover-status.sh` via hooks)
- `tasks.json` – `[{id,title,acceptance[],depends_on[],owner,state,attempts}]`
- `messages.log` (`<iso> [from -> to] msg`), `inbox/drover.log`, `reports/<agent>.md`, `brief.md`
- Liveness: `zellij list-sessions -n` (samma logik som `alive()` i `drover.sh:55`, EXITED = död).
- Ignorera `~/.claude/drover/sessions/` (inte en HID).

## Åtgärder (all mutation via `drover.sh`, aldrig zellij direkt)
Sökväg till skriptet konfigureras (`DROVER_SH`, default ovan + `/scripts/drover.sh`). Körs med `execFile` (ingen shell), timeout.
| UI | Kommando |
|---|---|
| Ny drover | skriv brief till temp-fil → `drover.sh new <slug> <dir> --model M --brief F`; parsa `HID=` |
| Stäng drover | `drover.sh close <HID>`; exit 4 → visa worktree-lista (dirty-markerade), välj `--remove-worktrees`/`--keep-worktrees` |
| Döda agent | `drover.sh kill <HID> --force <id>` |
| Meddelande | `drover.sh send <HID> drover ui "<msg>"` |
| Revive | `drover.sh revive <HID>` (visas när session död och `closed != true`) |
| Agentskärm | `drover.sh read <HID> <id> [lines]` pollat ~2s, bara när panelen är öppen |

## Arkitektur
Monorepo med npm workspaces, TypeScript överallt.
```
droverstatus/
  package.json            # workspaces: server, web, shared
  shared/src/types.ts     # Corral, Agent, AgentStatus, Task, Message, events
  server/                 # Node 22 + Fastify
    src/config.ts         # DROVER_ROOT, DROVER_SH, PORT, bind 127.0.0.1
    src/store.ts          # in-memory snapshot per HID, bygger från filer
    src/watcher.ts        # chokidar på DROVER_ROOT (depth 3, awaitWriteFinish, ignorera *.lock/*.tmp/*.XXXXXX)
    src/liveness.ts       # poll zellij list-sessions var 5s
    src/droverCli.ts      # execFile-wrapper, en metod per kommando, returnerar {ok, code, stdout, stderr}
    src/routes.ts         # REST + SSE
    src/index.ts
  web/                    # React 18 + Vite
    src/api.ts            # fetch + EventSource
    src/useCorrals.ts     # state från snapshot + diffar
    src/components/CorralList, CorralCard, AgentTable, TaskList, MessageFeed, AgentScreen, NewDroverDialog, CloseDialog
```
- Realtid: **SSE** `GET /api/events` – första event `snapshot`, sedan `corral-updated {hid, corral}` / `corral-removed {hid}`. Watcher debouncar per HID (~150ms) och bygger om hela corral-objektet (filerna är små). Liveness-ändring triggar samma event.
- REST: `GET /api/corrals`, `POST /api/corrals` (new), `DELETE /api/corrals/:hid?worktrees=remove|keep`, `POST /api/corrals/:hid/revive`, `POST /api/corrals/:hid/messages`, `DELETE /api/corrals/:hid/agents/:id`, `GET /api/corrals/:hid/agents/:id/screen?lines=40`, `GET /api/corrals/:hid/reports/:id`.
- Validering: slug kebab-case, HID `^[0-9a-f]{8}$`, agent-id kebab, projektkatalog måste finnas, modell ∈ haiku|sonnet|opus|fable.
- Fel från CLI returneras som `{error, stderr, code}` och visas som toast; exit 4 på close → 409 med worktree-lista.
- Säkerhet: bind endast 127.0.0.1 (appen kan starta Claude-agenter). Ingen auth i v1.
- Prod: servern serverar `web/dist` statiskt; dev: Vite-proxy `/api` → server.

## UI
- Vänster: lista corrals (slug, HID, levande/död/stängd-badge, antal busy/idle/blocked), filter "visa stängda".
- Huvudvy per corral: header (session, projekt, attach-kommando kopierbart, drover-modell + state), knappar Stäng/Revive.
- Agenttabell: id, modell, tab/pane, state-färg (blocked framhävd), `at` som relativ tid, purpose, knappar Skärm/Döda.
- Tasks (state, owner, attempts, deps), meddelandeflöde (messages.log + inbox), rapporter (markdown).
- Meddelandefält till drover. "Ny drover"-dialog: slug, projektkatalog, modell (default sonnet), brief (textarea).
- Browser-notis när en agent går till `blocked` (valfritt, Notification API).

## Implementationsordning
1. Workspace-scaffold + shared types.
2. Server: store + parsers (tolerant mot saknade/halvskrivna filer), watcher, liveness, SSE.
3. Server: droverCli + action-routes.
4. Web: snapshot/SSE-hook, listor och vyer.
5. Web: dialoger och åtgärder, skärmvy.
6. `npm run dev` / `npm start`, README kort.

## Verifiering
- Starta servern, öppna UI: befintliga corrals (`2a2d869c`, `abd9a485`) visas som stängda.
- Skapa ny drover från UI mot ett testrepo → corral dyker upp live; `zellij attach corral-<slug>-<HID>` fungerar.
- I corralen: låt drovern spawna en agent → agent syns, state växlar busy/idle live; trigga permission prompt → blocked.
- Skicka meddelande → syns i drover-panen och i messages.log-flödet.
- Skärmvy visar samma som `drover.sh read`.
- Döda agent → försvinner ur listan. Döda zellij-sessionen manuellt → "död" + Revive fungerar.
- Stäng drover med worktrees → dialog, båda val fungerar.
