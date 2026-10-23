# macOS and Linux launcher

`fdv-bouldering-timer` is a small Avalonia/.NET launcher for macOS and Linux.
It reads `params.txt`, uses the portable or system Node.js runtime, displays
local network addresses, opens the timer, and provides restart and stop
commands.

The heading and window title show the running server's build number. The
readiness request supplies it; health probes remain headers-only, and a restart
clears the previous build. Responses from a cancelled startup cannot update it.

The server listens on all local interfaces. The launcher reloads settings and
rebuilds the displayed links after every restart, and refreshes those links
when the operating system reports a network-address change. It enumerates
local interfaces without starting Bonjour discovery or manufacturing a macOS
Local Network permission request. Health checks are serialized and bounded.

Build one runtime with the .NET SDK:

```bash
launcher/unix/build-launcher.sh linux-x64
launcher/unix/build-launcher.sh linux-arm64
launcher/unix/build-launcher.sh osx-x64
launcher/unix/build-launcher.sh osx-arm64
```

The generated executable is written to `dist/unix-launcher/<runtime-id>`.
For macOS, the script also creates `FDV Bouldering Timer.app` so users can
launch the timer from Finder. GitHub Actions builds these launchers
automatically and includes them in the portable releases. The launcher must
remain next to `serve-bouldering-timer.js`, `params.txt`, and the other timer
files. `start-timer-mac.command` and `start-timer-linux.sh` remain fallback
launchers.

Release artifacts must also contain `native-audio/` beside the launcher or
`.app`. Build it with `bash native-audio/unix/build-player.sh <rid>
<artifact-dir>/native-audio`. The portable builder refuses an incomplete Unix
artifact. See `native-audio/unix/README.md` for output and speech prerequisites.
