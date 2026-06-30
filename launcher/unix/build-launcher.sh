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
LAUNCHER_VERSION=${LAUNCHER_VERSION:-1.0.6}
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
ICON_PNG="$OUTPUT_DIR/timer-launcher.png"
python3 - "$ICON_PNG" <<'PY'
import math
import os
import struct
import sys
import zlib

path = sys.argv[1]
size = 256
bg = (17, 23, 34, 255)
white = (244, 247, 251, 255)
cyan = (73, 198, 229, 255)
yellow = (255, 200, 87, 255)
pixels = [bg] * (size * size)
scale = size / 64.0
stroke = 5.0 * scale
aa = 1.25 * scale

def blend(dst, src, alpha):
    inv = 1.0 - alpha
    return tuple(int(dst[i] * inv + src[i] * alpha + 0.5) for i in range(4))

def paint(x, y, color, alpha):
    if 0 <= x < size and 0 <= y < size and alpha > 0:
        idx = y * size + x
        pixels[idx] = blend(pixels[idx], color, min(1.0, alpha))

def line_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length_sq = vx * vx + vy * vy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)

def stroke_line(ax, ay, bx, by, color, width):
    ax *= scale; ay *= scale; bx *= scale; by *= scale
    radius = width / 2.0
    margin = radius + aa
    min_x = max(0, int(math.floor(min(ax, bx) - margin)))
    max_x = min(size - 1, int(math.ceil(max(ax, bx) + margin)))
    min_y = max(0, int(math.floor(min(ay, by) - margin)))
    max_y = min(size - 1, int(math.ceil(max(ay, by) + margin)))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            d = line_distance(x + 0.5, y + 0.5, ax, ay, bx, by)
            paint(x, y, color, max(0.0, min(1.0, (radius + aa - d) / aa)))

def stroke_circle(cx, cy, diameter, color, width):
    cx = (cx + diameter / 2.0) * scale
    cy = (cy + diameter / 2.0) * scale
    radius = diameter * scale / 2.0
    half = width / 2.0
    margin = half + aa
    min_x = max(0, int(math.floor(cx - radius - margin)))
    max_x = min(size - 1, int(math.ceil(cx + radius + margin)))
    min_y = max(0, int(math.floor(cy - radius - margin)))
    max_y = min(size - 1, int(math.ceil(cy + radius + margin)))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            d = abs(math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius)
            paint(x, y, color, max(0.0, min(1.0, (half + aa - d) / aa)))

def fill_circle(cx, cy, diameter, color):
    cx = (cx + diameter / 2.0) * scale
    cy = (cy + diameter / 2.0) * scale
    radius = diameter * scale / 2.0
    min_x = max(0, int(math.floor(cx - radius - aa)))
    max_x = min(size - 1, int(math.ceil(cx + radius + aa)))
    min_y = max(0, int(math.floor(cy - radius - aa)))
    max_y = min(size - 1, int(math.ceil(cy + radius + aa)))
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            paint(x, y, color, max(0.0, min(1.0, (radius + aa - d) / aa)))

stroke_circle(12, 16, 40, white, stroke)
stroke_line(32, 36, 32, 24, cyan, stroke)
stroke_line(32, 36, 41, 30, cyan, stroke)
stroke_line(25, 9, 39, 9, white, stroke)
stroke_line(32, 9, 32, 15, white, stroke)
stroke_line(44, 14, 50, 20, yellow, stroke)
fill_circle(29, 33, 6, yellow)

raw = b"".join(b"\x00" + bytes(component for pixel in pixels[y * size:(y + 1) * size] for component in pixel) for y in range(size))
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n"
png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
png += chunk(b"IDAT", zlib.compress(raw, 9))
png += chunk(b"IEND", b"")
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "wb") as output:
    output.write(png)
PY

if [[ "$RID" == osx-* ]]; then
  APP_DIR="$OUTPUT_DIR/FDV Bouldering Timer.app"
  mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
  cp -R "$PUBLISH_DIR"/. "$APP_DIR/Contents/MacOS/"
  chmod +x "$APP_DIR/Contents/MacOS/fdv-bouldering-timer"
  ICONSET_DIR="$OUTPUT_DIR/timer-launcher.iconset"
  mkdir -p "$ICONSET_DIR"
  python3 - "$ICONSET_DIR" <<'PY'
import math
import os
import struct
import sys
import zlib

target = sys.argv[1]
sizes = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]
bg = (17, 23, 34, 255)
white = (244, 247, 251, 255)
cyan = (73, 198, 229, 255)
yellow = (255, 200, 87, 255)

def blend(dst, src, alpha):
    inv = 1.0 - alpha
    return tuple(int(dst[i] * inv + src[i] * alpha + 0.5) for i in range(4))

def line_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length_sq = vx * vx + vy * vy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / length_sq))
    cx, cy = ax + t * vx, ay + t * vy
    return math.hypot(px - cx, py - cy)

def draw_icon(size, path):
    pixels = [bg] * (size * size)
    scale = size / 64.0
    stroke = max(1.0, 5.0 * scale)
    aa = max(1.0, 1.25 * scale)

    def paint_pixel(x, y, color, alpha):
        if 0 <= x < size and 0 <= y < size and alpha > 0:
            idx = y * size + x
            pixels[idx] = blend(pixels[idx], color, min(1.0, alpha))

    def stroke_line(ax, ay, bx, by, color, width):
        ax *= scale; ay *= scale; bx *= scale; by *= scale
        radius = width / 2.0
        margin = radius + aa
        min_x = max(0, int(math.floor(min(ax, bx) - margin)))
        max_x = min(size - 1, int(math.ceil(max(ax, bx) + margin)))
        min_y = max(0, int(math.floor(min(ay, by) - margin)))
        max_y = min(size - 1, int(math.ceil(max(ay, by) + margin)))
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                d = line_distance(x + 0.5, y + 0.5, ax, ay, bx, by)
                alpha = max(0.0, min(1.0, (radius + aa - d) / aa))
                paint_pixel(x, y, color, alpha)

    def stroke_circle(cx, cy, diameter, color, width):
        cx = (cx + diameter / 2.0) * scale
        cy = (cy + diameter / 2.0) * scale
        radius = diameter * scale / 2.0
        half = width / 2.0
        margin = half + aa
        min_x = max(0, int(math.floor(cx - radius - margin)))
        max_x = min(size - 1, int(math.ceil(cx + radius + margin)))
        min_y = max(0, int(math.floor(cy - radius - margin)))
        max_y = min(size - 1, int(math.ceil(cy + radius + margin)))
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                d = abs(math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius)
                alpha = max(0.0, min(1.0, (half + aa - d) / aa))
                paint_pixel(x, y, color, alpha)

    def fill_circle(cx, cy, diameter, color):
        cx = (cx + diameter / 2.0) * scale
        cy = (cy + diameter / 2.0) * scale
        radius = diameter * scale / 2.0
        min_x = max(0, int(math.floor(cx - radius - aa)))
        max_x = min(size - 1, int(math.ceil(cx + radius + aa)))
        min_y = max(0, int(math.floor(cy - radius - aa)))
        max_y = min(size - 1, int(math.ceil(cy + radius + aa)))
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                alpha = max(0.0, min(1.0, (radius + aa - d) / aa))
                paint_pixel(x, y, color, alpha)

    stroke_circle(12, 16, 40, white, stroke)
    stroke_line(32, 36, 32, 24, cyan, stroke)
    stroke_line(32, 36, 41, 30, cyan, stroke)
    stroke_line(25, 9, 39, 9, white, stroke)
    stroke_line(32, 9, 32, 15, white, stroke)
    stroke_line(44, 14, 50, 20, yellow, stroke)
    fill_circle(29, 33, 6, yellow)

    raw = b"".join(b"\x00" + bytes(component for pixel in pixels[y * size:(y + 1) * size] for component in pixel) for y in range(size))
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as output:
        output.write(png)

for name, size in sizes:
    draw_icon(size, os.path.join(target, name))
PY
  iconutil -c icns "$ICONSET_DIR" -o "$APP_DIR/Contents/Resources/timer-launcher.icns"
  rm -rf "$ICONSET_DIR"
  cat > "$APP_DIR/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>fdv-bouldering-timer</string>
  <key>CFBundleIconFile</key>
  <string>timer-launcher</string>
  <key>CFBundleIdentifier</key>
  <string>ru.fdv.bouldering-timer.launcher</string>
  <key>CFBundleName</key>
  <string>FDV Bouldering Timer</string>
  <key>CFBundleDisplayName</key>
  <string>FDV Bouldering Timer</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${LAUNCHER_VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${LAUNCHER_VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>10.15</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST
  if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign - "$APP_DIR"
  fi
  cat > "$OUTPUT_DIR/fdv-bouldering-timer" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export FDV_TIMER_BASE_DIR="$PWD"
exec "./FDV Bouldering Timer.app/Contents/MacOS/fdv-bouldering-timer" "$@"
SH
  chmod +x "$OUTPUT_DIR/fdv-bouldering-timer"
else
  cp -R "$PUBLISH_DIR"/. "$OUTPUT_DIR/"
  chmod +x "$OUTPUT_DIR/fdv-bouldering-timer"
  cat > "$OUTPUT_DIR/install-linux-launcher.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR=$(cd "$(dirname "$0")" && pwd)
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$DESKTOP_DIR/fdv-bouldering-timer.desktop"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=FDV Bouldering Timer
Comment=Start and control the FDV Bouldering Timer server
Exec=$APP_DIR/fdv-bouldering-timer
Path=$APP_DIR
Icon=$APP_DIR/timer-launcher.png
Terminal=false
Categories=Utility;
StartupNotify=true
StartupWMClass=fdv-bouldering-timer
DESKTOP
chmod +x "$DESKTOP_FILE" "$APP_DIR/fdv-bouldering-timer"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
fi
echo "Installed desktop launcher: $DESKTOP_FILE"
echo "Open it from the applications menu, or pin it to the dock after launch."
SH
  chmod +x "$OUTPUT_DIR/install-linux-launcher.sh"
  cat > "$OUTPUT_DIR/fdv-bouldering-timer.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=FDV Bouldering Timer
Comment=Run install-linux-launcher.sh once to register this app with an icon
Exec=./fdv-bouldering-timer
Icon=./timer-launcher.png
Terminal=false
Categories=Utility;
StartupNotify=true
StartupWMClass=fdv-bouldering-timer
DESKTOP
fi

echo "Unix launcher created in: $OUTPUT_DIR"
