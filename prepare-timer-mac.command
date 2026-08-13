#!/bin/zsh

set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
APP_EXECUTABLE="$SCRIPT_DIR/FDV Bouldering Timer.app/Contents/MacOS/fdv-bouldering-timer"
PORTABLE_NODE="$SCRIPT_DIR/runtime/mac/bin/node"

clear
echo "FDV Bouldering Timer — prepare macOS release"
echo
echo "Release directory:"
echo "$SCRIPT_DIR"
echo

if [[ ! -d "$SCRIPT_DIR/FDV Bouldering Timer.app" || ! -f "$PORTABLE_NODE" ]]; then
  echo "Error: the app or bundled Node.js was not found next to this script."
  echo "Move this file to the root of the extracted release and run it again."
  echo
  read -k 1 "?Press any key to close..."
  echo
  exit 1
fi

echo "Removing the macOS quarantine attribute from the release..."
if ! /usr/bin/xattr -dr com.apple.quarantine "$SCRIPT_DIR"; then
  echo
  echo "The quarantine attribute could not be removed completely."
  echo "Check that your user account can modify the extracted release directory."
  echo
  read -k 1 "?Press any key to close..."
  echo
  exit 1
fi

echo "Restoring executable permissions..."
/bin/chmod +x "$APP_EXECUTABLE" "$PORTABLE_NODE"
[[ -f "$SCRIPT_DIR/fdv-bouldering-timer" ]] && /bin/chmod +x "$SCRIPT_DIR/fdv-bouldering-timer"
[[ -f "$SCRIPT_DIR/start-timer-mac.command" ]] && /bin/chmod +x "$SCRIPT_DIR/start-timer-mac.command"
[[ -f "$SCRIPT_DIR/create-https-certificate-mac.command" ]] && /bin/chmod +x "$SCRIPT_DIR/create-https-certificate-mac.command"

remaining=0
for target in "$SCRIPT_DIR/FDV Bouldering Timer.app" "$APP_EXECUTABLE" "$PORTABLE_NODE"; do
  if /usr/bin/xattr -p com.apple.quarantine "$target" >/dev/null 2>&1; then
    remaining=1
  fi
done

echo
if (( remaining == 0 )); then
  echo "Done. Quarantine was removed and executable permissions were restored."
  echo "Close this window, then start FDV Bouldering Timer.app."
  result=0
else
  echo "Preparation was incomplete: an executable still has the quarantine attribute."
  echo "Check the directory permissions and run this script again."
  result=1
fi

echo
read -k 1 "?Press any key to close..."
echo
exit $result
