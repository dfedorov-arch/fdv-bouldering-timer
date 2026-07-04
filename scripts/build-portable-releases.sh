#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
APP_VERSION=${1:-local}
NODE_VERSION=${NODE_VERSION:-24.17.0}
DIST_DIR=${DIST_DIR:-"$ROOT_DIR/dist"}
WORK_DIR=$(mktemp -d)
NODE_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"

node "$ROOT_DIR/serve-bouldering-timer.js" --generate-offline-audio

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

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR" "$WORK_DIR/downloads" "$WORK_DIR/extracted"

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
  local target="$WORK_DIR/downloads/$archive"
  local expected
  local actual

  expected=$(awk -v name="$archive" '$2 == name { print $1 }' "$WORK_DIR/SHASUMS256.txt")
  if [[ -z "$expected" ]]; then
    echo "Checksum was not found for $archive" >&2
    exit 1
  fi

  curl -fsSL "$NODE_BASE_URL/$archive" -o "$target"
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

(
  cd "$DIST_DIR"
  : > SHA256SUMS.txt
  for file in *.zip *.tar.gz; do
    [[ -f "$file" ]] || continue
    printf '%s  %s\n' "$(checksum_value "$file")" "$file" >> SHA256SUMS.txt
  done
)

echo "Portable release assets created in $DIST_DIR"
