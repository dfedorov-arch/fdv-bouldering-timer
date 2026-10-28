# macOS and Linux launcher

To publish a tested macOS prerelease without changing main/Latest, manually run
the Release workflow on develop with publish_macos_preview=true and a numeric
preview_installer_version (currently 2.3.3). It waits for the full platform test/
build matrix, repackages the successful macOS PKGs, verifies source files,
signatures, non-relocating installation and uploaded SHA256 digests, then
publishes develop-<build>-macos as a prerelease. Ordinary pushes never publish
a preview. No stable v* tag or default-branch update is involved.

`fdv-bouldering-timer` is a small Avalonia/.NET launcher for macOS and Linux.
It reads `params.txt`, uses the portable or system Node.js runtime, displays
local network addresses, opens the timer, and provides restart and stop
commands.

Build442 unifies desktop controls with Windows (including CLR2/Win7/8):
Open timer, Copy link, Restart server, Stop and exit, HTTPS certificate and
EN/RU. The shared `launcher/windows/LauncherLanguage.cs` supplies captions,
statuses, tray/menu commands, certificate text and validation messages. Russian
is the default on all OSes; saved ru/en wins. The preference is per user:
macOS Application Support/FDV Bouldering Timer/launcher-language.txt, Linux
XDG_STATE_HOME (absolute only) or ~/.local/state/fdv-bouldering-timer.

EN/RU also queues the existing authenticated loopback language-only command
to the launcher's own child. A fresh random capability is passed per launch;
requests are serialized and canceled/retired across restart. Startup applies
language before opening the browser. No restart, timer anchor, health-probe
reset or geometry/audio change is involved. Raw Node output and old log lines
are not translated.

Closing the GUI now **hides it without stopping Node**. A tray/menu-bar menu
contains Show launcher, Open timer, Restart server, HTTPS certificate and
Stop and exit. Click the app again to restore a hidden window: a per-user
mutex and current-user-only named pipe wake the existing instance without
starting another server. On macOS, clicking the Dock icon minimizes an open
launcher and restores a minimized/hidden launcher. An open certificate dialog
keeps its owner visible and is activated instead. The menu-bar Show launcher
command and single-instance IPC always show the window without toggling.
macOS sends the same Reopen event for reopening the app in Finder. Linux
desktop environments without tray icons still have the re-launch route.
Explicit Stop and exit or OS/application shutdown cleans up and stops only
the owned child. Console .command/.sh launchers remain foreground processes
and still stop via Ctrl+C; they are not GUI tray applications.
The initial Opened handler runs startup once only, even when Hide/Show raises
Opened again. The headless harness exercises this event path with a safe startup
counter, not a real server-launch action.

`FDV_TEST_UNIX_LAUNCHER=1 node --test test/unix-launcher.test.js` uses the
real Avalonia controls on a headless backend, a disposable language endpoint
and separate IPC processes. It validates translated dialogs, preference,
URL/child/probe identity, hide/reopen/exit and single-instance recovery; it is
not a claim that physical Dock/tray rendering has been checked on every DE.

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
launch the timer from Finder. The Dock icon is the bundle's ICNS resource;
the menu-bar icon uses `Contents/MacOS/timer-launcher.png` next to the executable.
Both are included before signing, so copying the `.app` into portable/PKG
packages preserves them. Packaging rejects a missing or empty menu-bar PNG.
A raw `dotnet publish` output does not include these generated icons; use the
build script for a complete macOS app (or put `timer-launcher.png` beside a
locally published executable for its menu-bar icon).
GitHub Actions builds these launchers
automatically and includes them in the portable releases. The launcher must
remain next to `serve-bouldering-timer.js`, `params.txt`, and the other timer
files. `start-timer-mac.command` and `start-timer-linux.sh` remain fallback
launchers.

Release artifacts must also contain `native-audio/` beside the launcher or
`.app`. Build it with `bash native-audio/unix/build-player.sh <rid>
<artifact-dir>/native-audio`. The portable builder refuses an incomplete Unix
artifact. See `native-audio/unix/README.md` for output and speech prerequisites.
