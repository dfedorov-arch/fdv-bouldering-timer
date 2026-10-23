# Build 427: scheduled-start MINUTE

The user reported a missing one-minute warning while waiting for the first Classic rotation. Investigation found a reproducible native coordinator defect, independent of the426 PCM-buffer change.

Pending calendar starts are intentionally reprojected from wall time to the monotonic timer coordinate on every continuity read. Real Date.now samples have integer-ms precision; performance.now retains fractions. Without a new calendar target, the projected start can therefore differ by less than1ms. The coordinator used that raw floating-point value in both its generation signature and async-prepare guard. Repeated samples reset native output and could prevent the MINUTE from being submitted or cut it after submission.

The fix retains the accepted audio anchor within less than1ms for the same live server instance. This stabilized value is used consistently for preparation guards, generation signatures, cue keys and native planning. Stopping clears the retained anchor; an instance change or a difference of at least1ms accepts a new anchor and replaces the queue. Authoritative clocks, public timer state, calendar targets, browser scheduling, rate calibration, per-client correction and PCM buffering are unchanged.

Reproduction and validation, current Windows host,2026-10-23:

- A focused coordinator regression failed before the fix: a0.25ms reprojection stopped an already-submitted pending MINUTE. It passes with the fix and verifies that a real2s correction still replaces the queue.
- The original high-precision fake wall clock masked the integration failure. A new integerWallClock fixture mode models real Date.now sampling. Against the packaged426 coordinator in a disposable server, the scheduled Classic test failed to obtain a pending MINUTE plan. The fixed coordinator passes the same scenario.
- Scheduled Classic, Festival and Final native scenarios pass with an offset of-300ms: one pending MINUTE, unchanged stop count across repeated samples, target preserved within the bounded1ms projection tolerance, no repeat on resync and unchanged authoritative calendar start. Final remains countdown-only.
- The scheduled Classic scenario also passed using installed Brave. These browser/native-route scenarios use a fake output device; they establish routing/queue correctness, not a recording of the user's speakers.
- Windows-compatible Node suite:465 cases,460 passed,5 opt-in/platform skips, no failures. POSIX release-shell and macOS-launcher files are excluded on this Windows host. Actual Node12 x64/x86 server/clock/list/snapshot/Secondary checks passed, three cases per architecture.

The optional FDV_TEST_NATIVE_AUDIO_BASELINE path used by the scheduled-start test copies a comparison coordinator only into that test server's temporary folder. No production/live server source is replaced by this comparison. Source/test diagnostics and package checks remain separate from microphone or physical-device validation. Existing guide captures remain current because no controls/layout changed. No live server restart, publication or Git commit was performed.

Final browser regression:32 Chromium clock/controls/native/Secondary scenarios passed. The full existing browser-audio scheduled Classic/Final tests also passed unchanged. Native PCM output code is unchanged from426, whose real-device silent deadline/cancel/watchdog and decoding checks remain applicable.
