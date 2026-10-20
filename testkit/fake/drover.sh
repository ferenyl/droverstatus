#!/usr/bin/env bash
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
sessions="$R/.zellij-sessions"
mod() { local f=$1; shift; local t; t=$(mktemp); jq "$@" "$f" > "$t" && mv "$t" "$f"; }
case "$cmd" in
  new)
    slug=$1; dir=$2; shift 2; model=sonnet
    while [ $# -gt 0 ]; do case $1 in --model) model=$2; shift;; esac; shift; done
    hid=$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n'); d="$R/$hid"
    mkdir -p "$d"/{status,reports,inbox,agents}
    jq -n --arg h "$hid" --arg s "corral-$slug-$hid" --arg p "$dir" --arg sl "$slug" --arg m "$model" \
      '{id:$h,session:$s,project:$p,slug:$sl,drover_cwd:$p,closed:false,drover:{mode:"live",model:$m,session_id:"fake",tab_id:1},agents:{}}' > "$d/registry.json"
    echo '[]' > "$d/tasks.json"; : > "$d/messages.log"
    echo '{"state":"idle"}' > "$d/status/drover.json"
    echo "corral-$slug-$hid [Created 0s ago]" >> "$sessions"
    echo "HID=$hid" ;;
  close)
    hid=$1; shift; wt=""
    for a in "$@"; do case $a in --remove-worktrees) wt=remove;; --keep-worktrees) wt=keep;; esac; done
    if [ -f "$R/$hid/worktrees.txt" ] && [ -z "$wt" ]; then cat "$R/$hid/worktrees.txt"; echo "worktrees exist" >&2; exit 4; fi
    [ "$wt" = remove ] && rm -f "$R/$hid/worktrees.txt"
    mod "$R/$hid/registry.json" '.closed=true | .agents={}'
    sess=$(jq -r .session "$R/$hid/registry.json"); sed -i "/^$sess /d" "$sessions" 2>/dev/null ;;
  kill)
    hid=$1; id=${@: -1}
    jq -e --arg i "$id" '.agents[$i]' "$R/$hid/registry.json" >/dev/null || { echo "no such agent $id" >&2; exit 1; }
    mod "$R/$hid/registry.json" --arg i "$id" 'del(.agents[$i])'; rm -f "$R/$hid/status/$id.json" ;;
  send)
    hid=$1; to=$2; from=$3; shift 3
    echo "$(now) [$from -> $to] $*" >> "$R/$hid/messages.log"; echo "[$from -> $to] $*" >> "$R/$hid/inbox/$to.log" ;;
  revive)
    sess=$(jq -r .session "$R/$1/registry.json"); sed -i "s/ (EXITED.*//; /^$sess /!b" "$sessions"
    grep -q "^$sess " "$sessions" || echo "$sess [Created 0s ago]" >> "$sessions" ;;
  read)
    printf 'fake screen of %s/%s\n$ claude\n> working...\n' "$1" "$2" ;;
  *) echo "fake drover.sh: unsupported '$cmd'" >&2; exit 2 ;;
esac
