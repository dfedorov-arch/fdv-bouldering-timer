# macOS and Linux launcher

`fdv-bouldering-timer` is a small Avalonia/.NET launcher for macOS and Linux.
It reads `params.txt`, uses the portable or system Node.js runtime, displays
local network addresses, opens the timer, and provides restart and stop
commands.

All four runtime builds include **Create HTTPS certificate**. The dialog lists
local IPs and the host name without DNS/Bonjour discovery; edit these names
before creating an RSA2048/SHA256 self-signed certificate valid for 365 days.
No external OpenSSL is needed. Replacement requires confirmation and retains
private backups. Generation runs off the UI thread, does not stop Node, and
does not alter OS trust. A separate confirmation (default No) offers restart;
until restart, the running HTTPS listener and advertised links stay unchanged.
Share only `timer-public.cer`, never the private `timer-cert.pfx`.

Installed PKG/DEB builds use per-user storage:
- macOS: `~/Library/Application Support/FDV Bouldering Timer/https`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/https`
  (only absolute XDG_STATE_HOME values are used).

Portable uses `https` beside the launcher, with per-user fallback if directory
creation/writing is denied. An existing active portable PFX must be replaced
in place or fail; it is never silently shadowed by an unused fallback. Directories
are 0700, files and backups 0600. Public CER is rolled back if atomic PFX
publication fails. Paths/precedence match `lib/https-certificate-storage.js`.
Legacy root PEM/PFX still work when no managed PFX exists; platform scripts
remain available but do not replace managed certificates.

Native temporary-certificate/TLS/restart tests (no user state or trust changes):
`FDV_TEST_UNIX_CERTIFICATES=1 node --test test/unix-https-certificate.test.js`
with the .NET SDK installed. CI runs this on macOS and Linux host architectures;
cross-built architectures still need native-machine installation testing.

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
