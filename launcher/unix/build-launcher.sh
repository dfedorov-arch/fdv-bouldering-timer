#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <runtime-id> [output-directory]" >&2
  echo "Runtime IDs: linux-x64, linux-arm64, osx-x64, osx-arm64" >&2
  exit 1
fi

RID="$1"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/../.." && pwd)
OUTPUT_DIR=${2:-"$ROOT_DIR/dist/unix-launcher/$RID"}
PUBLISH_DIR="$OUTPUT_DIR/publish"

case "$RID" in
  linux-x64|linux-arm64|osx-x64|osx-arm64) ;;
  *)
    echo "Unsupported runtime ID: $RID" >&2
    exit 1
    ;;
esac

rm -rf "$OUTPUT_DIR"
mkdir -p "$PUBLISH_DIR"

dotnet publish "$SCRIPT_DIR/FdvBoulderingTimer.Launcher.csproj" \
  --configuration Release \
  --runtime "$RID" \
  --self-contained true \
  --output "$PUBLISH_DIR" \
  /p:PublishSingleFile=true \
  /p:PublishTrimmed=false

chmod +x "$PUBLISH_DIR/fdv-bouldering-timer"
cp "$PUBLISH_DIR/fdv-bouldering-timer" "$OUTPUT_DIR/fdv-bouldering-timer"
chmod +x "$OUTPUT_DIR/fdv-bouldering-timer"

if [[ "$RID" == osx-* ]]; then
  APP_DIR="$OUTPUT_DIR/FDV Bouldering Timer.app"
  mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
  cp "$PUBLISH_DIR/fdv-bouldering-timer" "$APP_DIR/Contents/MacOS/fdv-bouldering-timer"
  chmod +x "$APP_DIR/Contents/MacOS/fdv-bouldering-timer"
  cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>fdv-bouldering-timer</string>
  <key>CFBundleIdentifier</key>
  <string>ru.fdv.bouldering-timer.launcher</string>
  <key>CFBundleName</key>
  <string>FDV Bouldering Timer</string>
  <key>CFBundleDisplayName</key>
  <string>FDV Bouldering Timer</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST
fi

echo "Unix launcher created in: $OUTPUT_DIR"
