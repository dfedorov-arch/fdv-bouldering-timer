#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <version> <architecture> <portable-package-dir> <output-deb>" >&2
  exit 2
fi

VERSION="$1"
ARCHITECTURE="$2"
PACKAGE_DIR="$3"
OUTPUT="$4"
case "$ARCHITECTURE" in
  x64) DEB_ARCH=amd64 ;;
  arm64) DEB_ARCH=arm64 ;;
  *) echo "Unsupported Linux architecture: $ARCHITECTURE" >&2; exit 2 ;;
esac

ROOT=$(mktemp -d)
cleanup() { rm -rf "$ROOT"; }
trap cleanup EXIT

mkdir -p "$ROOT/opt/fdv-bouldering-timer" "$ROOT/usr/share/applications"
cp -R "$PACKAGE_DIR"/. "$ROOT/opt/fdv-bouldering-timer/"
mkdir -p "$ROOT/DEBIAN"
cat > "$ROOT/DEBIAN/control" <<EOF
Package: fdv-bouldering-timer
Version: $VERSION
Section: utils
Priority: optional
Architecture: $DEB_ARCH
Maintainer: FDV
Description: Network-synchronized bouldering competition timer
 Includes a local server and a desktop launcher.
EOF
cat > "$ROOT/usr/share/applications/fdv-bouldering-timer.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=FDV Bouldering Timer
Exec=/opt/fdv-bouldering-timer/fdv-bouldering-timer
Terminal=false
Categories=Utility;Sports;
EOF
dpkg-deb --build --root-owner-group "$ROOT" "$OUTPUT"
