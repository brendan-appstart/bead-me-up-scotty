#!/usr/bin/env bash
# Kill whatever process is listening on a given TCP port.
# Usage: ./scripts/killport.sh <port> [more ports...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <port> [port...]" >&2
  exit 1
fi

for port in "$@"; do
  # lsof: -t prints only PIDs, -i TCP:<port>, -sTCP:LISTEN limits to listeners.
  pids=$(lsof -ti "TCP:${port}" -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$pids" ]; then
    echo "port ${port}: nothing listening"
    continue
  fi
  echo "port ${port}: killing PID(s) ${pids//$'\n'/ }"
  # Try graceful TERM first, then force-kill anything still alive.
  kill $pids 2>/dev/null || true
  sleep 0.5
  still=$(lsof -ti "TCP:${port}" -sTCP:LISTEN 2>/dev/null || true)
  [ -n "$still" ] && kill -9 $still 2>/dev/null || true
done
