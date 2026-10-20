#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Starts server + web against a tmp copy of testkit/fixtures with fake drover.sh/zellij.
# Usage: npm run test:e2e [-- <cmd...>]   no cmd: run until Ctrl-C; with cmd: run it, then tear down (exit = cmd's).
# Env for <cmd>: E2E_URL (web), E2E_API, DROVER_ROOT (tmp fixtures; edit live), DROVER_CALLS (fake call log).
set -eu
here=$(cd "$(dirname "$0")" && pwd); repo=$(dirname "$here")
tmp=$(mktemp -d -t droverstatus-e2e-XXXXXX)
cp -a "$here/fixtures/." "$tmp/"
export DROVER_ROOT=$tmp DROVER_SH=$here/fake/drover.sh ZELLIJ_BIN=$here/fake/zellij
export PORT=${E2E_API_PORT:-4178} WEB_PORT=${E2E_WEB_PORT:-5178}
export E2E_API=http://127.0.0.1:$PORT E2E_URL=http://127.0.0.1:$WEB_PORT DROVER_CALLS=$tmp/.calls.log
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT INT TERM
cd "$repo"
npm run start -w server >"$tmp/.server.log" 2>&1 & pids+=($!)
npm exec -w web -- vite --port "$WEB_PORT" --strictPort --host 127.0.0.1 >"$tmp/.web.log" 2>&1 & pids+=($!)
for u in "$E2E_API/api/corrals" "$E2E_URL/"; do
  for _ in $(seq 60); do curl -sf "$u" >/dev/null && break; sleep 0.5; done
  curl -sf "$u" >/dev/null || { echo "not up: $u" >&2; cat "$tmp"/.*.log >&2; exit 1; }
done
echo "e2e: web $E2E_URL api $E2E_API root $tmp"
if [ $# -gt 0 ]; then "$@"; else wait; fi
