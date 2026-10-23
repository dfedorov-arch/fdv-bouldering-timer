#!/usr/bin/env bash
set -euo pipefail
RID=${1:?Usage: build-player.sh runtime-id output-directory}
OUTPUT=${2:?Usage: build-player.sh runtime-id output-directory}
case "$RID" in linux-x64|linux-arm64|osx-x64|osx-arm64) ;; *) echo "Unsupported audio runtime: $RID" >&2; exit 2 ;; esac
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUTPUT"
dotnet publish "$SCRIPT_DIR/FdvNativeAudio.csproj" --configuration Release --runtime "$RID" \
  --self-contained true --output "$OUTPUT" -p:PublishSingleFile=true -p:PublishTrimmed=false \
  -p:RestoreLockedMode=true
cp "$SCRIPT_DIR/NLAYER-LICENSE.txt" "$SCRIPT_DIR/README.md" "$OUTPUT/"
chmod +x "$OUTPUT/fdv-audio-player"
if [[ "$RID" == osx-* ]] && command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$OUTPUT/fdv-audio-player"
  codesign --verify --strict "$OUTPUT/fdv-audio-player"
fi
