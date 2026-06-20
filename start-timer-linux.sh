#!/usr/bin/env bash
set -u

cd "$(dirname "$0")" || exit 1

HTTP_PORT=$(awk -F= '/^[[:space:]]*http_port[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2}' params.txt 2>/dev/null | tail -n 1)
HTTPS_PORT=$(awk -F= '/^[[:space:]]*https_port[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2}' params.txt 2>/dev/null | tail -n 1)
PORTABLE_NODE_LINUX=$(sed -n 's/^[[:space:]]*portable_node_linux[[:space:]]*=[[:space:]]*//p' params.txt 2>/dev/null | tail -n 1)
HTTP_PORT=${HTTP_PORT:-8008}
HTTPS_PORT=${HTTPS_PORT:-8443}
PORTABLE_NODE_LINUX=${PORTABLE_NODE_LINUX:-runtime/linux/bin/node}

HAS_HTTPS=false
if [[ -f "timer-key.pem" && -f "timer-cert.pem" ]] || [[ -f "timer-cert.pfx" ]]; then
  HAS_HTTPS=true
fi

echo "Starting bouldering timer..."
echo

if [[ "$PORTABLE_NODE_LINUX" == /* ]]; then
  NODE_CANDIDATE="$PORTABLE_NODE_LINUX"
else
  NODE_CANDIDATE="./$PORTABLE_NODE_LINUX"
fi

NODE_BIN=""
if [[ -x "$NODE_CANDIDATE" ]]; then
  NODE_BIN="$NODE_CANDIDATE"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is not installed."
  echo "Portable Node.js was not found at: $PORTABLE_NODE_LINUX"
  echo "Change portable_node_linux in params.txt or install Node.js LTS"
  echo "from https://nodejs.org/en/download and run this file again."
  exit 1
fi
echo "Using Node.js: $NODE_BIN"

echo "Stopping previous timer server on ports $HTTP_PORT and $HTTPS_PORT..."
for port in "$HTTP_PORT" "$HTTPS_PORT"; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
    [[ -z "$pids" ]] || kill $pids 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi
done
sleep 1
echo

"$NODE_BIN" serve-bouldering-timer.js &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  wait "$SERVER_PID"
  exit $?
fi

echo "Local address:"
echo "  http://127.0.0.1:$HTTP_PORT/"
if [[ "$HAS_HTTPS" == true ]]; then
  echo "  https://127.0.0.1:$HTTPS_PORT/"
fi
echo

echo "Network addresses for other devices:"
if command -v ip >/dev/null 2>&1; then
  while read -r iface address; do
    [[ -z "$address" ]] && continue
    echo "  [$iface] http://$address:$HTTP_PORT/"
    if [[ "$HAS_HTTPS" == true ]]; then
      echo "  [$iface] https://$address:$HTTPS_PORT/"
    fi
  done < <(ip -o -4 addr show scope global | awk '{split($4, value, "/"); print $2, value[1]}')
else
  for address in $(hostname -I 2>/dev/null); do
    [[ "$address" == 127.* ]] && continue
    echo "  http://$address:$HTTP_PORT/"
    if [[ "$HAS_HTTPS" == true ]]; then
      echo "  https://$address:$HTTPS_PORT/"
    fi
  done
fi
echo

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:$HTTP_PORT/" >/dev/null 2>&1 &
elif command -v gio >/dev/null 2>&1; then
  gio open "http://127.0.0.1:$HTTP_PORT/" >/dev/null 2>&1 &
fi

echo "Timer server is running. Keep this window open while using the timer."
echo "Press Ctrl+C to stop."
wait "$SERVER_PID"
STATUS=$?
trap - EXIT
exit "$STATUS"
