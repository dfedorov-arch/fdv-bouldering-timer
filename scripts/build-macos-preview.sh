#!/usr/bin/env bash
# Repackage already-tested CI PKGs, never a user's installed application/data.
set -euo pipefail
INPUT=${1:?Usage: build-macos-preview.sh input-directory output-directory numeric-installer-version}
OUTPUT=${2:?Output directory required}
VERSION=${3:?Numeric installer version required}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid preview installer version' >&2; exit 2; }
[[ ! -e "$OUTPUT" ]] || { echo 'Preview output directory must not already exist' >&2; exit 2; }
mkdir -p "$OUTPUT"
OUTPUT=$(cd "$OUTPUT" && pwd)
INPUT=$(cd "$INPUT" && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
BUILD=$(node -e 'const fs=require("fs");const m=fs.readFileSync(process.argv[1],"utf8").match(/const BUILD_NUMBER = (\d+);/);if(!m)throw Error("Missing build");console.log(m[1]);' "$ROOT/serve-bouldering-timer.js")
TAG="develop-$BUILD-macos"
COMMIT=$(git -C "$ROOT" rev-parse HEAD)
cp "$ROOT/docs/releases/macos-preview.md" "$OUTPUT/PREVIEW-README.txt"
node - "$OUTPUT/BUILD-INFO.json" "$TAG" "$BUILD" "$VERSION" "$COMMIT" <<'JS'
const fs=require('fs');const [file,tag,build,version,commit]=process.argv.slice(2);
fs.writeFileSync(file,JSON.stringify({previewTag:tag,buildNumber:Number(build),installerAndBundleVersion:version,
  commit,stableRelease:false,appleNotarized:false,
  githubActionsRun:process.env.GITHUB_SERVER_URL&&process.env.GITHUB_REPOSITORY&&process.env.GITHUB_RUN_ID
    ?`${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`:null,
  packaging:'Repackaged from successful CI macOS PKGs. Only numeric bundle metadata and packaging changed; apps ad-hoc re-signed. No functional source changes.'},null,2)+'\n');
JS
for arch in arm64 x64; do
  count=$(find "$INPUT" -maxdepth 1 -type f -name "*-macos-$arch.pkg" | wc -l | tr -d ' ')
  [[ "$count" == 1 ]] || { echo "Expected exactly one $arch CI PKG" >&2; exit 1; }
  original=$(find "$INPUT" -maxdepth 1 -type f -name "*-macos-$arch.pkg")
  expanded="$WORK/expanded-$arch"
  pkgutil --expand-full "$original" "$expanded"
  payload="$expanded/Payload/Applications/FDV Bouldering Timer"
  for file in serve-bouldering-timer.js index.html lib/https-certificate-storage.js; do cmp "$ROOT/$file" "$payload/$file"; done
  app="$payload/FDV Bouldering Timer.app"
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$app/Contents/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$app/Contents/Info.plist"
  chmod +x "$app/Contents/MacOS/fdv-bouldering-timer" "$payload/runtime/mac/bin/node" "$payload/prepare-timer-mac.command"
  audio="$payload/lib/native-audio/darwin-$arch/fdv-audio-player"
  chmod +x "$audio"
  codesign --force --deep --sign - "$app"
  codesign --verify --deep --strict "$app"
  codesign --verify --strict "$audio"
  cp "$OUTPUT/PREVIEW-README.txt" "$OUTPUT/BUILD-INFO.json" "$payload/"
  name="fdv-bouldering-timer-develop-$BUILD-macos-$arch"
  mkdir -p "$WORK/portable-$arch"
  cp -R "$payload" "$WORK/portable-$arch/$name"
  rm "$WORK/portable-$arch/$name/fdv-installed.marker"
  tar -czf "$OUTPUT/$name.tar.gz" -C "$WORK/portable-$arch" "$name"
  pkgbuild --root "$expanded/Payload" --component-plist "$ROOT/installer/macos/components.plist" \
    --identifier ru.fdv.boulderingtimer --version "$VERSION" --install-location / "$OUTPUT/$name.pkg"
  pkgutil --expand "$OUTPUT/$name.pkg" "$WORK/pkgcheck-$arch"
  test "$(xmllint --xpath 'count(/pkg-info/relocate/bundle)' "$WORK/pkgcheck-$arch/PackageInfo")" = "0"
done
cd "$OUTPUT"
shasum -a 256 *.pkg *.tar.gz PREVIEW-README.txt BUILD-INFO.json > SHA256SUMS.txt
shasum -a 256 -c SHA256SUMS.txt
echo "macOS preview $TAG built from $COMMIT, installer $VERSION"
