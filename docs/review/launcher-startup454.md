# Launcher startup responsiveness — build454

The macOS/Linux launcher previously ran listener cleanup on the UI thread.
`ReadToEnd()` preceded `WaitForExit(1500)`, making that timeout ineffective;
stderr was not drained. An isolated reproduction of the original method with
a child sleeping 3200 ms took 3255 ms. The exact cause of the owner's macOS
internet-related stall has not been reproduced on that device.

Modern Windows also prepared startup on the UI thread, including PowerShell
cleanup with a five-second wait. Win7/8 skips that cleanup, but shared the
synchronous process-start path. All desktop variants now prepare startup on a
worker. Runtime lookup for update checks and network-interface enumeration
also run on workers; address rendering uses cached results and never blocks
server readiness waiting for enumeration.

Shared CLR2-compatible `LauncherProcess.cs` drains both command pipes, retains
at most 16 KiB per pipe and bounds exit plus EOF by a single command deadline
(1500 ms Unix; 5000 ms PowerShell). Failed, timed-out or truncated stdout is
never interpreted as a PID list. Unix lsof also receives `-nP`. Native process
creation itself can block a worker; a separate 15-second UI preparation timer
rejects late completion and permits retry. Existing readiness checks follow
successful preparation, with their existing limits.

Each attempt owns its pending child until UI adoption. Timeout, replacement
and exit cancel that ownership; late callbacks cannot adopt a child or replace
newer state. Exit signals only owned children; waiting and disposal run off
the UI. Listener cleanup on explicit startup retains the previous behavior,
combining old/new configured ports once. Timer, audio and server sources are
unchanged; build remains 454.

Validation on 13 November 2026:

- Windows launcher/update suites: 8 passed, none skipped, with modern and
  .NET2-reference/Win7 harnesses. Passive forms stay responsive during stalled
  preparation and network enumeration; timeout/retry, port reload on restart,
  stale child exit and exit before adoption are covered.
- Shared process checks cover stderr flooding, stdout overflow, nonzero exit,
  a 1500 ms deadline, cancellation and ownership transfer.
- Linux x64 headless harness ran in WSL with the same process and startup
  scenarios. Its headless pump explicitly invokes production timer handlers;
  Windows checks use native UI timers. Isolated fake Node servers and disabled
  test listener cleanup prevent touching the owner's running servers.
- Product Windows, CLR2 Windows and macOS ARM64 sources compile. macOS device
  startup and physical Dock/tray rendering remain untested here.
- Linux Node contract/language suites: 12 passed and one SDK opt-in test
  skipped (the new headless scenarios above ran separately). Release-input
  verification passed for build454, and Git whitespace checks passed.

Integration on 16 November 2026 starts from GitHub develop `91700ee`, preserving
its settings editor and audio-test changes. Source lists include both the
settings model/dialog and process helper on every target. Settings are disabled
during startup preparation, so a dialog cannot request an ignored concurrent
restart. Combined Windows/CLR2, language, Final-audio and render suites passed
101 tests (one Unix SDK opt-in skipped on Windows). The combined Linux harness
separately passed settings RU/EN, process-tests, startup and peer-status in WSL;
six macOS contracts and release-input verification also passed. The combined
macOS ARM64 product compiles; execution on a Mac remains unverified.

Changes target develop. Published 3.0.0 assets are unchanged.
