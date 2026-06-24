# macOS and Linux launcher

`fdv-bouldering-timer` is a small Avalonia/.NET launcher for macOS and Linux.
It reads `params.txt`, uses the portable or system Node.js runtime, displays
local network addresses, opens the timer, and provides restart and stop
commands.

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
