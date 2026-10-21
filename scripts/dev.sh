#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Usage: npm run dev -- [-p|--port API_PORT] [-w|--web-port WEB_PORT]
export PORT=${PORT:-4187} WEB_PORT=${WEB_PORT:-5187}
while [ $# -gt 0 ]; do
  case $1 in
    -p|--port) PORT=$2; shift 2 ;;
    -w|--web-port) WEB_PORT=$2; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done
for p in $PORT $WEB_PORT; do
  if (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null; then echo "port $p already in use" >&2; exit 1; fi
done
trap "trap - INT TERM EXIT; kill 0" INT TERM EXIT
npm run dev -w server & npm run dev -w web & wait -n
