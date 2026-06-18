#!/bin/zsh
cd "$(dirname "$0")"

HTTP_PORT=$(awk -F= '/^[[:space:]]*http_port[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2}' params.txt 2>/dev/null | tail -n 1)
HTTPS_PORT=$(awk -F= '/^[[:space:]]*https_port[[:space:]]*=/{gsub(/[[:space:]]/, "", $2); print $2}' params.txt 2>/dev/null | tail -n 1)
PORTABLE_NODE_MAC=$(sed -n 's/^[[:space:]]*portable_node_mac[[:space:]]*=[[:space:]]*//p' params.txt 2>/dev/null | tail -n 1)
HTTP_PORT=${HTTP_PORT:-8008}
HTTPS_PORT=${HTTPS_PORT:-8443}
PORTABLE_NODE_MAC=${PORTABLE_NODE_MAC:-runtime/mac/bin/node}
HAS_HTTPS=false
if [[ -f "timer-key.pem" && -f "timer-cert.pem" ]]; then
  HAS_HTTPS=true
elif [[ -f "timer-cert.pfx" ]]; then
  HAS_HTTPS=true
fi

echo "Starting bouldering timer..."
echo

NODE_BIN=""
if [[ "$PORTABLE_NODE_MAC" == /* ]]; then
  NODE_CANDIDATE="$PORTABLE_NODE_MAC"
else
  NODE_CANDIDATE="./$PORTABLE_NODE_MAC"
fi
if [[ -x "$NODE_CANDIDATE" ]]; then
  NODE_BIN="$NODE_CANDIDATE"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="node"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js is not installed."
  echo "Portable Node.js was not found at: $PORTABLE_NODE_MAC"
  echo "Change portable_node_mac in params.txt or install Node.js LTS"
  echo "from https://nodejs.org/en/download and run this file again."
  echo
  read -k 1 "?Press any key to close..."
  exit 1
fi
echo "Using Node.js: $NODE_BIN"

echo "Stopping previous timer server on ports $HTTP_PORT and $HTTPS_PORT..."
for port in "$HTTP_PORT" "$HTTPS_PORT"; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
    if [[ -n "$pids" ]]; then
      kill $pids 2>/dev/null
      sleep 1
      pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
      if [[ -n "$pids" ]]; then
        kill -9 $pids 2>/dev/null
      fi
    fi
  fi
done
echo

"$NODE_BIN" serve-bouldering-timer.js &
SERVER_PID=$!

sleep 1

echo "Local address:"
echo "  http://127.0.0.1:$HTTP_PORT/"
if [[ "$HAS_HTTPS" == true ]]; then
  echo "  https://127.0.0.1:$HTTPS_PORT/"
fi
echo

network_label() {
  local iface="$1"
  local port_name=""
  if command -v networksetup >/dev/null 2>&1; then
    port_name=$(networksetup -listallhardwareports 2>/dev/null | awk -v dev="$iface" '
      /^Hardware Port: / { port=substr($0, 16) }
      /^Device: / { if (substr($0, 9) == dev) { print port; exit } }
    ')
  fi
  if [[ -n "$port_name" ]]; then
    echo "$port_name: $iface"
    return
  fi
  case "$iface" in
    en0|en1) echo "Wi-Fi/Ethernet: $iface" ;;
    bridge*|utun*|awdl*|llw*|vbox*|vmnet*) echo "Virtual: $iface" ;;
    *) echo "Network: $iface" ;;
  esac
}

echo "Network addresses for other devices:"
if command -v ipconfig >/dev/null 2>&1; then
  for iface in $(ifconfig -l); do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null)
    if [[ -n "$ip" && "$ip" != 127.* ]]; then
      label=$(network_label "$iface")
      echo "  [$label] http://$ip:$HTTP_PORT/"
      if [[ "$HAS_HTTPS" == true ]]; then
        echo "  [$label] https://$ip:$HTTPS_PORT/"
      fi
    fi
  done
fi
echo

open "http://127.0.0.1:$HTTP_PORT/"

echo "Timer server is running. Keep this window open while using the timer."
echo "Press Ctrl+C to stop."
wait "$SERVER_PID"
