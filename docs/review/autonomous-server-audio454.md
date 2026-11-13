# Autonomous server audio — develop build454 follow-up

The owner reported silence while the main browser was minimized; bringing its
window forward immediately restored sound. Live diagnostics showed a ready
Windows backend, an inactive output and intermittent owner-browser contact.
The precise browser/network cause of the connection loss was not captured.
The code did establish the harmful dependency: closing the audio SSE stream
called disconnected → drop, stopped PCM and removed the scheduling owner.

## Implemented behavior

An activated native output now belongs to the server. Browser observation
streams and server output selections are separate. Closing a tab/context,
pagehide cleanup, lost SSE, frozen JavaScript and registry expiry cannot remove
that selection or cancel its submitted signals. Reattaching an observer leaves
the native generation intact; late cleanup for an older token cannot revoke a
replacement. Initial activation still requires authenticated direct-local
prepare/activation. Existing selected output also survives a changed browser
network path; a new remote native claim remains forbidden.

Explicit primary-browser sound preference is sent separately from globalSound
and telemetry. Requests are serialized; failed preference updates use existing
state processing with a five-second backoff. Native opt-out, shared sound
permissions, Legacy rules, Pause/Stop, settings/offset/profile changes and
authority fencing remain effective without an observer. Native player recovery
resumes future cues without requiring a browser to reacquire output.

The local runtime snapshot stores bounded output selections, minimal local
authorization/primary metadata and primary sound preferences under
serverAudioSelection, with host/platform binding. Observer tokens and forced
diagnostic selections are not restored. Offsets retain their existing storage.
Snapshot age/clock validity rules still apply. The selection is outside public
timer state and Secondary replication: pairing does not turn on the peer's
speaker. The native helper's parent watchdog, EOF handling, stable event IDs and
audible lateness limits are retained.

After an observer error, browser fallback is still immediate. Fresh server state
can confirm that autonomous native playback remains active and suppress local
duplicates despite exhausted observer retries. A sample from before the error
cannot suppress fallback. This avoids treating an observer fault as proof that
the server speaker stopped.

## Validation

The focused Node suite passed 96 tests with one existing opt-in skip. It covered
audio coordination/player recovery, state storage, Secondary behavior and actual
Node12.22.12 x64 compatibility on this Windows host. An additional paired-server
test passed, proving local output selection does not activate the standby and
explicit native opt-out still propagates. Total: **97 passed, one opt-in skip**.

```powershell
$env:FDV_LEGACY_NODE='<official Node12.22.12 executable>'
node --test test/server-audio.test.js test/server-audio-native.test.js test/secondary-server.test.js test/runtime-state-storage.test.js test/windows-legacy.test.js
```

All 16 native-audio browser cases passed, followed by the new observer-transport
case and reruns of manual route selection/failure fallback: **17 distinct browser
scenarios passed**. The closed-context case ran five rotations, waited for the
owner to expire from diagnostics, checked event uniqueness, and confirmed that
a command from an independent HTTP connection stopped further cues. Other cases
cover freeze, native failure/recovery with no browser, restart with no browser,
saved correction, manual mute/route choices, expired start cues, scheduled
Classic/Festival/Final warnings, keyboard controls and origin/proxy rejection.

```powershell
node node_modules/@playwright/test/cli.js test --config test/visual/playwright.config.js native-audio.spec.js
```

Browser audio tests use the disposable native backend and isolated state, never
the operator's servers or physical speakers. Real-device output, native Win7,
macOS and Linux GUI behavior were not retested here. Windows 7 compatibility
checks used the official Node12 runtime on Windows 10.

An extra clock-continuity suite was also attempted. It retained an existing
diagnostic expectation mismatch (simulated macOS monotonicIncludesSleep false
versus expected true) and two Windows EPERM errors replacing the fixture clock
file. An isolated comparison using the previous packaged coordinator and the
new coordinator produced the same diagnostic flag, elapsed 240.02 seconds and
unchanged competition version. These extra checks are not counted as passing;
no timer-clock code or those clock assertions were changed. Snapshot serialization
does not sample or repair the timer clock.

RU/EN documentation and tooltips are updated. Standalone/Android HTML regeneration,
build454 release-input checks, guide image/anchor/mobile-width checks and Git
whitespace checks passed. Build remains **454**, as requested. Existing packaged
archives and running operator instances have not been replaced or restarted.

## Local package follow-up

Updated test archives for Windows x64, Windows7/8 x64, Linux x64 and macOS ARM64 are in dist/build-454-autonomous-audio/artifacts. All launchers and Unix audio helpers were rebuilt; bundled-runtime startup smoke checks passed on Windows/Node24, Windows/Node12 and WSL/Linux. Every archived file was checked against staging, critical source files against the worktree, and Unix executable modes were checked. BUILD-INFO.json records source hashes and SHA256SUMS.txt covers the artifacts. macOS ARM64 ad-hoc signatures, resource seals and Node signature hashes were checked independently; no native Mac run or Apple notarization was performed. Existing operator processes and older archive directories were retained.
