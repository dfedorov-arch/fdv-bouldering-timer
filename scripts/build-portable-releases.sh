#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_VERSION=local
APP_VERSION_SET=false
ALLOW_MISSING_LAUNCHERS=false
PREFLIGHT_ONLY=false

for argument in "$@"; do
  case "$argument" in
    --without-launchers) ALLOW_MISSING_LAUNCHERS=true ;;
    --preflight-only) PREFLIGHT_ONLY=true ;;
    --*)
      echo "Unknown option: $argument" >&2
      exit 2
      ;;
    *)
      if [[ "$APP_VERSION_SET" == true ]]; then
        echo "Only one application version may be specified." >&2
        exit 2
      fi
      APP_VERSION="$argument"
      APP_VERSION_SET=true
      ;;
  esac
done

NODE_VERSION=${NODE_VERSION:-24.17.0}
DIST_DIR=${DIST_DIR:-"$ROOT_DIR/dist"}
WORK_DIR=$(mktemp -d)
DOWNLOAD_DIR=${NODE_DOWNLOAD_CACHE:-"$WORK_DIR/downloads"}
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

for command in curl tar unzip zip; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command was not found: $command" >&2
    exit 1
  fi
done

require_launcher() {
  local variable_name="$1"
  local launcher_path="$2"
  local expected_kind="$3"
  if [[ -z "$launcher_path" ]]; then
    echo "Required launcher variable is not set: $variable_name" >&2
    return 1
  fi
  if [[ "$expected_kind" == "file" && ! -f "$launcher_path" ]]; then
    echo "Required launcher file was not found: $variable_name=$launcher_path" >&2
    return 1
  fi
  if [[ "$expected_kind" == "path" && ! -e "$launcher_path" ]]; then
    echo "Required launcher path was not found: $variable_name=$launcher_path" >&2
    return 1
  fi
}

validate_launchers() {
  if [[ "$ALLOW_MISSING_LAUNCHERS" == true ]]; then
    echo "Launcher check skipped by explicit --without-launchers mode." >&2
    return
  fi
  local failed=false
  require_launcher "WINDOWS_LAUNCHER_EXE" "${WINDOWS_LAUNCHER_EXE:-}" "file" || failed=true
  require_launcher "MACOS_LAUNCHER_ARM64" "${MACOS_LAUNCHER_ARM64:-}" "path" || failed=true
  require_launcher "MACOS_LAUNCHER_X64" "${MACOS_LAUNCHER_X64:-}" "path" || failed=true
  require_launcher "LINUX_LAUNCHER_ARM64" "${LINUX_LAUNCHER_ARM64:-}" "file" || failed=true
  require_launcher "LINUX_LAUNCHER_X64" "${LINUX_LAUNCHER_X64:-}" "file" || failed=true
  if [[ "$failed" == true ]]; then
    echo "Release packaging requires every GUI launcher. Use --without-launchers only for an explicitly incomplete local package." >&2
    exit 1
  fi
}

validate_launchers
if [[ "$PREFLIGHT_ONLY" == true ]]; then
  echo "Portable release preflight passed."
  exit 0
fi

node "$ROOT_DIR/serve-bouldering-timer.js" --generate-offline-audio
node "$ROOT_DIR/scripts/verify-release-inputs.js"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR" "$DOWNLOAD_DIR" "$WORK_DIR/extracted"

curl -fsSL "$NODE_BASE_URL/SHASUMS256.txt" -o "$WORK_DIR/SHASUMS256.txt"

checksum_value() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}

download_node() {
  local archive="$1"
  local target="$DOWNLOAD_DIR/$archive"
  local partial="$target.partial"
  local expected
  local actual

  expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$WORK_DIR/SHASUMS256.txt")
  if [[ -z "$expected" ]]; then
    echo "Checksum was not found for $archive" >&2
    exit 1
  fi

  if [[ -f "$target" ]]; then
    actual=$(checksum_value "$target")
    if [[ "$actual" == "$expected" ]]; then
      echo "Using cached $archive" >&2
      echo "$target"
      return
    fi
    rm -f "$target"
  fi
  echo "Downloading $archive" >&2
  curl -fL -C - "$NODE_BASE_URL/$archive" -o "$partial"
  mv "$partial" "$target"
  actual=$(checksum_value "$target")
  if [[ "$actual" != "$expected" ]]; then
    echo "Checksum mismatch for $archive" >&2
    exit 1
  fi
  echo "$target"
}

copy_common_files() {
  local target="$1"
  mkdir -p "$target"
  cp "$ROOT_DIR/LICENSE" "$ROOT_DIR/help.html" \
    "$ROOT_DIR/index.html" "$ROOT_DIR/legacy.html" "$ROOT_DIR/offline-audio.js" "$ROOT_DIR/params.txt" \
    "$ROOT_DIR/serve-bouldering-timer.js" "$target/"
  cp -R "$ROOT_DIR/beeps" "$ROOT_DIR/fonts" "$ROOT_DIR/help-assets" "$target/"
  cp -R "$ROOT_DIR/lib" "$target/"
  if [[ -f "$ROOT_DIR/compare-btimer-and-fdv-bouldering-timer.html" ]]; then
    cp "$ROOT_DIR/compare-btimer-and-fdv-bouldering-timer.html" "$target/"
  fi
}

extract_tar_node() {
  local archive="$1"
  local destination="$2"
  mkdir -p "$destination"
  tar -xzf "$archive" -C "$destination"
}

build_windows() {
  local archive_name="node-v${NODE_VERSION}-win-x64.zip"
  local archive
  local extracted="$WORK_DIR/extracted/windows-x64"
  local package_name="fdv-bouldering-timer-${APP_VERSION}-windows-x64"
  local package="$WORK_DIR/$package_name"

  archive=$(download_node "$archive_name")
  mkdir -p "$extracted"
  unzip -q "$archive" -d "$extracted"
  local node_root="$extracted/node-v${NODE_VERSION}-win-x64"

  copy_common_files "$package"
  cp "$ROOT_DIR/ReadMe-windows.txt" "$package/ReadMe.txt"
  cp "$ROOT_DIR/start-timer-win.bat" "$ROOT_DIR/create-https-certificate.bat" "$package/"
  if [[ -n "${WINDOWS_LAUNCHER_EXE:-}" ]]; then
    if [[ ! -f "$WINDOWS_LAUNCHER_EXE" ]]; then
      echo "Windows launcher was not found: $WINDOWS_LAUNCHER_EXE" >&2
      exit 1
    fi
    cp "$WINDOWS_LAUNCHER_EXE" "$package/fdv-bouldering-timer.exe"
  fi
  mkdir -p "$package/runtime/win"
  cp "$node_root/node.exe" "$package/runtime/win/node.exe"
  cp "$node_root/LICENSE" "$package/runtime/win/LICENSE-Node.txt"
  cp "$ROOT_DIR/runtime/win/README.txt" "$package/runtime/win/README.txt"

  (cd "$WORK_DIR" && zip -qr "$DIST_DIR/$package_name.zip" "$package_name")
}

build_unix() {
  local os="$1"
  local arch="$2"
  local node_platform="$3"
  local launcher="$4"
  local certificate_script="$5"
  local runtime_name="$6"
  local archive_name="node-v${NODE_VERSION}-${node_platform}-${arch}.tar.gz"
  local archive
  local extracted="$WORK_DIR/extracted/${os}-${arch}"
  local package_name="fdv-bouldering-timer-${APP_VERSION}-${os}-${arch}"
  local package="$WORK_DIR/$package_name"
  local node_root
  local gui_launcher=""

  archive=$(download_node "$archive_name")
  extract_tar_node "$archive" "$extracted"
  node_root="$extracted/node-v${NODE_VERSION}-${node_platform}-${arch}"

  copy_common_files "$package"
  case "$os" in
    macos) cp "$ROOT_DIR/ReadMe-macos.txt" "$package/ReadMe.txt" ;;
    linux) cp "$ROOT_DIR/ReadMe-linux.txt" "$package/ReadMe.txt" ;;
  esac
  cp "$ROOT_DIR/$launcher" "$ROOT_DIR/$certificate_script" "$package/"
  case "${os}-${arch}" in
    macos-arm64) gui_launcher="${MACOS_LAUNCHER_ARM64:-}" ;;
    macos-x64) gui_launcher="${MACOS_LAUNCHER_X64:-}" ;;
    linux-arm64) gui_launcher="${LINUX_LAUNCHER_ARM64:-}" ;;
    linux-x64) gui_launcher="${LINUX_LAUNCHER_X64:-}" ;;
  esac
  if [[ -n "$gui_launcher" ]]; then
    if [[ ! -e "$gui_launcher" ]]; then
      echo "GUI launcher was not found: $gui_launcher" >&2
      exit 1
    fi
    if [[ "$os" == "macos" && -d "$gui_launcher" ]]; then
      cp -R "$gui_launcher" "$package/FDV Bouldering Timer.app"
      chmod +x "$package/FDV Bouldering Timer.app/Contents/MacOS/fdv-bouldering-timer"
      cat > "$package/fdv-bouldering-timer" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export FDV_TIMER_BASE_DIR="$PWD"
exec "./FDV Bouldering Timer.app/Contents/MacOS/fdv-bouldering-timer" "$@"
SH
      chmod +x "$package/fdv-bouldering-timer"
    else
      cp "$gui_launcher" "$package/fdv-bouldering-timer"
      local gui_launcher_dir
      gui_launcher_dir=$(dirname "$gui_launcher")
      find "$gui_launcher_dir" -maxdepth 1 -type f \( -name '*.so' -o -name '*.dylib' -o -name '*.json' -o -name '*.png' -o -name '*.desktop' -o -name '*.sh' \) -exec cp {} "$package/" \;
      chmod +x "$package/fdv-bouldering-timer"
    fi
  fi
  mkdir -p "$package/runtime/$runtime_name/bin"
  cp "$node_root/bin/node" "$package/runtime/$runtime_name/bin/node"
  cp "$node_root/LICENSE" "$package/runtime/$runtime_name/LICENSE-Node.txt"
  cp "$ROOT_DIR/runtime/$runtime_name/README.txt" "$package/runtime/$runtime_name/README.txt"
  chmod +x "$package/$launcher" "$package/$certificate_script" "$package/runtime/$runtime_name/bin/node"

  tar -czf "$DIST_DIR/$package_name.tar.gz" -C "$WORK_DIR" "$package_name"
}

build_windows
build_unix "macos" "arm64" "darwin" "start-timer-mac.command" "create-https-certificate-mac.command" "mac"
build_unix "macos" "x64" "darwin" "start-timer-mac.command" "create-https-certificate-mac.command" "mac"
build_unix "linux" "x64" "linux" "start-timer-linux.sh" "create-https-certificate-linux.sh" "linux"
build_unix "linux" "arm64" "linux" "start-timer-linux.sh" "create-https-certificate-linux.sh" "linux"

for expected in \
  "$DIST_DIR/fdv-bouldering-timer-${APP_VERSION}-windows-x64.zip" \
  "$DIST_DIR/fdv-bouldering-timer-${APP_VERSION}-macos-arm64.tar.gz" \
  "$DIST_DIR/fdv-bouldering-timer-${APP_VERSION}-macos-x64.tar.gz" \
  "$DIST_DIR/fdv-bouldering-timer-${APP_VERSION}-linux-x64.tar.gz" \
  "$DIST_DIR/fdv-bouldering-timer-${APP_VERSION}-linux-arm64.tar.gz"; do
  if [[ ! -s "$expected" ]]; then
    echo "Expected portable package was not created: $expected" >&2
    exit 1
  fi
done

(
  cd "$DIST_DIR"
  : > SHA256SUMS.txt
  for file in *.zip *.tar.gz; do
    [[ -f "$file" ]] || continue
    printf '%s  %s\n' "$(checksum_value "$file")" "$file" >> SHA256SUMS.txt
  done
)

echo "Portable release assets created in $DIST_DIR"
