#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Fake drover.sh for e2e. Uses $DROVER_ROOT; logs calls to $DROVER_ROOT/.calls.log.
# Force exit codes: file $DROVER_ROOT/.exit with lines "<cmd>=<code>[:stderr text]" (live-editable),
# or env FAKE_EXIT_<CMD>=<code>. Defaults: close exits 4 while $hid/worktrees.txt exists and no worktree flag.
set -u
R=${DROVER_ROOT:?}; cmd=${1:-}; shift || true
now() { date -Iseconds; }
echo "$(now) $cmd $*" >> "$R/.calls.log"
forced=$(grep -m1 "^$cmd=" "$R/.exit" 2>/dev/null | cut -d= -f2-)
if [ -z "$forced" ]; then v="FAKE_EXIT_$(echo "$cmd" | tr a-z A-Z)"; forced=${!v:-}; fi
if [ -n "$forced" ]; then
  code=${forced%%:*}; msg=${forced#*:}; [ "$msg" = "$forced" ] && msg="fake: forced exit $code"
  if [ "$code" = 4 ] && [ -f "$R/${1:-}/worktrees.txt" ]; then cat "$R/$1/worktrees.txt"; fi
  echo "$msg" >&2; exit "$code"
fi
# 0.9.0: `<cmd> <HID> --force ...`; kill refuses without it when the drover lives in a corral (mode corral)
force=0; if [ "${2:-}" = --force ]; then force=1; set -- "$1" "${@:3}"; fi
guard() { [ "$force" = 1 ] || [ "$(jq -r '.drover.mode // empty' "$R/$1/registry.json")" != corral ] || { echo "drover lives in $(jq -r .session "$R/$1/registry.json"); attach (zellij attach ...) or pass --force" >&2; exit 1; }; }
sessions="$R/.zellij-sessions"
mod() { local f=$1; shift; local t; t=$(mktemp); jq "$@" "$f" > "$t" && mv "$t" "$f"; }
case "$cmd" in
  new)
    slug=$1; dir=$2; shift 2; model=sonnet
    while [ $# -gt 0 ]; do case $1 in --model) model=$2; shift;; esac; shift; done
    hid=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n'); d="$R/$hid"
    mkdir -p "$d"/{status,reports,inbox,agents}
    jq -n --arg h "$hid" --arg s "corral-$slug-$hid" --arg p "$dir" --arg sl "$slug" --arg m "$model" \
      '{id:$h,session:$s,project:$p,slug:$sl,drover_cwd:$p,closed:false,drover:{mode:"corral",model:$m,session_id:"fake",tab_id:1},agents:{}}' > "$d/registry.json"
    echo '[]' > "$d/tasks.json"; : > "$d/messages.log"
    echo '{"state":"idle"}' > "$d/status/drover.json"
    echo "corral-$slug-$hid [Created 0s ago]" >> "$sessions"
    echo "HID=$hid"; echo; echo "Session: corral-$slug-$hid"; echo "zellij attach corral-$slug-$hid" ;;
  close)
    hid=$1; shift; wt=""
    for a in "$@"; do case $a in --remove-worktrees) wt=remove;; --keep-worktrees) wt=keep;; esac; done
    if [ -f "$R/$hid/worktrees.txt" ] && [ -z "$wt" ]; then cat "$R/$hid/worktrees.txt"; echo "worktrees exist" >&2; exit 4; fi
    [ "$wt" = remove ] && rm -f "$R/$hid/worktrees.txt"
    mod "$R/$hid/registry.json" '.closed=true | .shutdown=true | .agents={}'
    sess=$(jq -r .session "$R/$hid/registry.json"); sed -i "/^$sess /d" "$sessions" 2>/dev/null; echo "closing $sess"; echo "shut down: $sess" ;;
  kill)
    hid=$1; id=${@: -1}; guard "$hid"
    jq -e --arg i "$id" '.agents[$i]' "$R/$hid/registry.json" >/dev/null || { echo "unknown agent: $id" >&2; exit 1; }
    mod "$R/$hid/registry.json" --arg i "$id" 'del(.agents[$i])'; rm -f "$R/$hid/status/$id.json"; echo "closed: $id" ;;
  send) # to drover: inbox only; to an agent: must exist; blocked agents get the message queued (exit 0, note on stderr)
    hid=$1; to=$2; from=$3; shift 3; line="[$from -> $to] $*"
    if [ "$to" != drover ]; then
      jq -e --arg i "$to" '.agents[$i]' "$R/$hid/registry.json" >/dev/null || { echo "unknown agent: $to" >&2; exit 1; }
      if [ "$(jq -r .state "$R/$hid/status/$to.json" 2>/dev/null)" = blocked ]; then
        echo "[drover-sh -> drover] queued for $to (blocked, needs input): $*. After it is unblocked: drover.sh flush $hid $to" >> "$R/$hid/inbox/drover.log"
        echo "$(now) $line (queued)" >> "$R/$hid/messages.log"; echo "queued for $to (blocked)" >&2; exit 0
      fi
    else echo "$line" >> "$R/$hid/inbox/drover.log"; fi
    echo "$(now) $line" >> "$R/$hid/messages.log" ;;
  revive)
    mod "$R/$1/registry.json" 'del(.closing_at) | del(.shutdown)'
    sess=$(jq -r .session "$R/$1/registry.json"); sed -i "s/ (EXITED.*//; /^$sess /!b" "$sessions"
    grep -q "^$sess " "$sessions" || echo "$sess [Created 0s ago]" >> "$sessions" ;;
  read)
    [ "$2" = drover ] || jq -e --arg i "$2" '.agents[$i]' "$R/$1/registry.json" >/dev/null || { echo "unknown agent: $2" >&2; exit 1; }
    printf 'fake screen of %s/%s\n$ claude\n> working...\n' "$1" "$2" ;;
  *) echo "fake drover.sh: unsupported '$cmd'" >&2; exit 2 ;;
esac
