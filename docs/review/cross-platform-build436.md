# Cross-platform release adaptation — build436

The current interface, CTRL mode, minute/break warnings, per-browser native
audio preference, correction and180-second speaker keep-awake settings use
the shared sources in Windows, Windows Legacy, macOS, Linux, Android and
standalone packaging. Windows native playback is retained. Android remains a
server client / standalone application with browser audio.

macOS (Intel/Apple Silicon) and Linux (x64/ARM64) gain native server audio through
`native-audio/unix`. The helper compiles the existing C# PCM mixer with Core
Audio/ALSA adapters; the JS coordinator, signal plans, ten-millisecond anchor
tolerance and client prepare/mute/activate/release protocol are shared.
Browser offsets are applied by the existing coordinator. Stop waits for the
device queue to be discarded before acknowledging, and failures retain the
existing guarded browser fallback. No external media player's unknown buffer
is used for competition playback.

Linux selects ALSA `default`, under the desktop user; libasound.so.2 is required.
The DEB declares ALSA and recommends espeak-ng. macOS uses AudioQueue with a
three-block reserve. Initial asynchronous device timestamps are allowed to
become ready within the existing five-second prime deadline; an unavailable
clock cannot activate the route. WAV PCM/float and managed NLayer3.0.0 MP3 are
decoded once. NLayer is an exact dependency with a checked-in hash lock and MIT
license. Missing festival speech voices/tools cause browser fallback for the
whole profile rather than silent omission of announcements.

Unix launchers now display the running server's build in the heading and
window title, from the existing bounded readiness response. Restart clears
stale metadata; cancelled requests cannot apply it. Health checks stay
headers-only. Native helper artifacts travel with the corresponding launcher;
portable assembly rejects missing helpers/licenses and restores executable
permissions. CI builds/signs macOS helpers on macOS. The preparation script
also restores their permissions after quarantine removal.

Validation on the Windows development machine:

- Full Windows-compatible Node suite:479 tests,474 passed,5 existing opt-in
  skips. A first run exposed two timing-sensitive tests. The SEC case passed
  in isolation and the final full run; its clock assertion was unchanged.
  The speaker preference test now waits for the persisted value instead of a
  fixed300ms delay. Both passed in the final full run.
- Six Bash release preflight cases passed through Git Bash, including rejection
  of missing native helpers. Five Unix launcher/source guard cases passed.
  The POSIX executable-bit assertion is not validated by NTFS.
- Chromium:36 cases passed across clock, CTRL, native route and SEC suites.
  Two additional generated standalone HTML smoke checks passed.
- Actual Node12 x64 and x86:8 cases passed for each, covering compatibility,
  mixed-runtime SEC, speaker preference and per-browser native opt-out.
- Unix device-free C# check: exact START/WARN PCM through repeated refills,
  duplicate suppression, quiet-tone priority, JSON protocol, selective quiet
  cancellation, Stop, mono resampling, invalid input, all13 packaged MP3/WAV
  assets and valid/invalid launcher build metadata passed. No audio device opened.
- Unix launcher and native helper both cross-published for linux-x64,
  linux-arm64, osx-x64 and osx-arm64. Compilation reported no warnings/errors.
- Android assembleRelease and lintRelease succeeded (0 lint errors,4 warnings).
  APK signature verified and certificate matched the existing v2.3.0 reference.
  Preview versionName2.3.0-build436, versionCode20300; no signing identity changed.
- Windows modern x64 and Legacy x64/x86 preview ZIPs have verified source,
  runtime, native dependency, required-file and private-entry checks.
  Offline/standalone assets and release-input validation are current436.

Artifacts are under dist: Windows preview ZIPs, standalone HTML, signed Android
preview APK, cross-published Unix launcher/helper directories and checksums.
PKG/DEB assembly and macOS ad-hoc signing are configured in release CI, not run
on this Windows host during the local implementation checks. No tag, public
release or live-server restart was performed.

Follow-up: the user requested committing this work to develop. The release
workflow now also builds on develop pushes and manual dispatch, saving all
packages as Actions artifacts. These previews use version0.0.<run number>;
the in-app build remains436. The sole GitHub Release publication step requires
a push of a v-prefixed tag, so a develop/manual run cannot publish a release.
Windows7/8 x86/x64 remain in the same build/collection matrix. A newly added
manual trigger only becomes available once the workflow exists on the default
branch; the develop push trigger allows validation before that merge.

Still requiring target hardware: Core Audio/ALSA playback, repeated rotations
with hidden/frozen tabs, actual Stop/mute/opt-out and output-device changes,
speech availability, mixing with music, physical correction and Bluetooth
speaker behavior. Cross-compilation/device-free PCM checks do not establish
audible timing, absence of underruns or OS/device compatibility. Installation
of the new PKG/DEB and physical Android/old Windows checks also remain external.
