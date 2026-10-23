# Build 425: automatic local Windows audio

Implemented automatic delegation from an eligible modern browser on the Windows server computer to native PCM output. The timer timeline is unchanged. The elected browser's saved correction and unsaved audio-test preview are applied to native targets. Browser Web Audio is stopped before native activation; native cancellation is acknowledged before browser fallback.

Validation on the current Windows host, 2026-10-22:

- Windows-compatible Node suite: 463 cases, 458 passed, 5 opt-in/platform skips, no failures. The POSIX-shell release-preflight and macOS launcher files were excluded on this host. Release-input verification passed separately for build425.
- 28 distinct Chromium scenarios passed across clock, controls, Secondary and native-audio suites. Existing browser-audio fixtures explicitly disable native output in their disposable server copy. Native route scenarios use a fake output device and cover frozen-page scheduling, remote Stop, offset preservation, mute/re-enable, closure and locality/origin rejection.
- Real Brave155.0.8059.85, a clean temporary profile, hidden tab for105s: both full minute-rotation warning series reached the server output stub, five warnings each. No page errors. This confirms route scheduling, not physical speaker timing.
- Opt-in Windows native test passed with zero-valued PCM: deadline estimate within50ms, selective break-warning cancellation preserving START, full stop ACK, and the independent2200ms watchdog. Real packaged MP3/WAV assets were decoded without audible playback.
- Actual Node12.22.12 x64 and x86 native smoke checks passed with silent PCM and real MP3/WAV decoding. Both architectures also passed the three existing server/clock/list/snapshot/mixed-runtime Secondary tests under the current Windows host.
- Generated web and file standalone HTML opened in Chromium with build425, local clock readiness and no native route or page errors.
- Modern x64 and Win7/8 x64/x86 preview ZIPs include the native source, helper, pinned NAudio DLL and full Ms-PL notice. Source/DLL equality, packaged-runtime syntax checks, archive completeness and absence of runtime/private certificate entries passed. Existing launcher/runtime binary hashes are unchanged. Checksums are in dist/SHA256SUMS-build425-preview.txt.
- RU/EN guide captures show the real native-route correction panel using a stubbed output device. Existing unrelated screenshots were preserved.

Native code currently requires Windows, PowerShell3+ and .NET4+. Other systems, unsupported native prerequisites and output initialization failures retain browser playback. Claims are ephemeral and are neither persisted nor replicated. Physical Win7/Win8 hardware, acoustic alignment between devices, driver-specific latency and computer sleep were not validated by these software checks. The existing correction value is retained; no automatic acoustic recalibration is inferred from the output cursor.

Implementation details, cancellation bounds and failure fencing are documented in ../architecture.md and ../performance-diagnostics.md. No Samsung viewport changes, release publication, live server restart or Git commit were performed.
