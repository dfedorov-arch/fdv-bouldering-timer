# Performance diagnostics

Performance diagnostics are opt-in and disabled during normal timer operation. `?perf=1` only observes existing code paths; it does not change the authoritative clock, render cadence, sound scheduling, synchronization requests, or recovery snapshots. `?perf=2` is an audible scheduler stress mode, `?perf=3` is a sparse long-run transition mode, and `?perf=4` adds an isolated Android audio-clock keepalive experiment.

## Modern browser

Open the timer with `?perf=1`, for example:

```text
http://127.0.0.1:8008/?perf=1
```

Read or reset the current sample from the browser console:

```js
FDVPerformanceDiagnostics.snapshot()
FDVPerformanceDiagnostics.reset()
```

The snapshot contains operation counters, duration totals/averages/maxima, event-loop lag, signal scheduler collection sizes, and loaded start-list totals.

Modern offline recovery snapshots are written immediately when their compact content key changes and otherwise only by a five-second safety checkpoint. In network mode the key uses the server instance/version identity, timer/settings state, and the server's `startListRevision`; it deliberately ignores the harmless one-millisecond `startedAt` reconstruction noise in repeated server responses. Standalone mode keeps its exact local `serverStartedAt` in the key. The key never includes full start-list rows or the moving `savedAtWall`/`serverNow` fields. `offlineSnapshotChangedWrites`, `offlineSnapshotSafetyWrites`, and `offlineSnapshotSkipsUnchanged` show why calls wrote or skipped storage; `offlineSnapshotWrites`, `offlineSnapshotBytes`, and the `saveOfflineSnapshot` timing remain the aggregate totals. The stored schema and authoritative time anchors are unchanged.

Modern network clients also retain the last complete start-list payload by `startListRevision`. The revision contains the server-instance identity, so an ordinary unchanged `GET`, action response, or SSE state can omit `startLists`, while a list edit or server restart necessarily sends the complete array again. A missing payload is reused only when its non-empty revision exactly matches the locally retained data. A missing/malformed payload with any other revision clears the cached revision and schedules an unconditional recovery request; timer state and clock synchronization continue to apply while that lower-priority list recovery runs. `startListPayloadFullApplies`, `startListPayloadReuses`, and `startListPayloadRecoveryRequests` expose these paths. Compare `stateResponseBytes` and the server's `sseStateBytes` before and after this optimization.

### Forced sound scheduler stress mode

Open a Modern client with `?perf=2` to enable all `?perf=1` diagnostics and locally force sound permission for that browser regardless of the primary/global/instance sound switches. This override is not written to storage, not sent to the server, and does not change any other browser's settings. It also overrides the same-computer speaker suppression so several diagnostic browsers can schedule the same logical signals.

Browser autoplay policy still applies: click or tap once inside every tested browser so its `AudioContext` can run. The snapshot reports `audio.forcedByDiagnostics`, `audio.unlocked`, and a rolling `audio.scheduleEvents` window. Every audio event reports `audioUserOffsetMs`, the calibrated `targetServerTimeMs`, and the offset-free `canonicalTargetServerTimeMs`. Align logical signals across clients by the canonical target, then compare each `node.targetErrorMs` against its own calibrated target. Compare `latenessMs` only for timer fallbacks. A buffered Web Audio node is scheduled on the audio clock and can remain accurate even when its later JavaScript bookkeeping callback is delayed.

Every scheduler event in `?perf=2` is also exported as a separate compact line:

```text
FDV_AUDIO_SCHEDULE {"v":1,"level":2,...}
```

The line is queued only after the current audio-scheduling task. JSON serialization and console output therefore cannot delay the `AudioContext.start()` call. Use `signalKey`, `serverInstanceId`, and `canonicalTargetServerTimeMs` to align browsers on different operating systems. `audioUserOffsetMs` explains the deliberate difference between canonical and calibrated targets without having to infer it from the key. A `node` record also reports `nextSignalTargetServerTimeMs`, `scheduledStopServerTimeMs`, and `scheduledDurationMs`; for a warning these expose its effective duration after the separation guard has shortened it. `platform`, clock quality, the Web Audio target error, and fallback lateness travel in the same short record, avoiding the console truncation that can affect complete snapshots.

Use `?perf=2` only during an intentional audible test. Normal operation and `?perf=1` continue to respect all sound settings.

### Sparse long-run transition mode

Open every Modern client with `?perf=3` for a multi-cycle or multi-hour audible test. Sound is forced locally exactly as in `?perf=2`, so every client still requires one click or tap to unlock its `AudioContext`.

On a phone, no developer console is required. While any `?perf=1`, `?perf=2`, `?perf=3`, or `?perf=4` mode is active, a fixed **Download log** button appears over the timer. Tap it at the end of the test and send the downloaded `.txt` file. The plain-text extension avoids Android content-URI handoff problems in Samsung Internet. The export retains up to 4,000 compact records (enough for a typical 20–30 minute `?perf=3` or `?perf=4` run), reports if older records were dropped, and ends with a complete snapshot. The same download is available as `FDVPerformanceDiagnostics.download()` where a console is available.

This mode deliberately disables five-second `FDV_PERFORMANCE_SNAPSHOT` output, one-second event-loop sampling, and ordinary aggregate render/start-list measurements. It retains only transition-critical records:

- `FDV_AUDIO_SCHEDULE` for `rotationBoundary:*` transition signals and `warn` countdown signals at 5–4–3–2–1 seconds. Technical `warm`/`prewarm` events remain omitted from this sound-schedule stream. A normal buffered signal produces a `plan` record and then a `node` record; `fallback` means the buffered node was unavailable and the immediate playback request was accepted, and reports its actual lateness. If that request is rejected, the terminal record is instead `suppressed` with `sound-not-allowed` or `playback-rejected`. `bufferAttemptCount` and `bufferLastFailure` distinguish an unavailable buffer or suspended context from a promotion callback that never ran.
- `FDV_AUDIO_CLOCK` at audio unlock/resume, context state changes, technical prewarm, each 5-second warning batch, and every scheduled node's target instant. Each planned technical wake-up now has a traceable lifecycle: `prewarm-plan`, followed by exactly one of `prewarm-fire`, `prewarm-stale`, or `prewarm-cancelled`. The records identify `warm` versus `prewarm`, phase and cycle, target and boundary times, lateness, visibility, and the cancellation or suppression reason. The `prewarm-fire` record is queued only after `wakeAudioOutput()` has been called, so diagnostic bookkeeping cannot delay the actual wake-up. These records also include `AudioContext.currentTime - performance.now()`, `baseLatency`, `outputLatency`, and `getOutputTimestamp()` values when the Android browser exposes them. A `node-target-check` record separates JavaScript callback lateness from `audioContextProgressErrorMs`: a negative progress error means the audio clock had not yet reached the scheduled node time even after accounting for a late JavaScript callback. Comparing the rotation and break batches shows whether a whole five-signal series inherited a different audio-clock/output mapping after a long silent phase.
- `FDV_AUDIO_SCHEDULE` with `stage: "offset"` exactly when that browser's calibration changes. It records both `previousAudioUserOffsetMs` and `audioUserOffsetMs`, so a sparse log does not leave the change somewhere inside the quiet interval between countdowns.
- `FDV_AUDIO_SCHEDULE` with `stage: "cancelled"` when a future Web Audio node is stopped during signal clearing or rescheduling. `cancellationReason`, `nodeStarted`, the original start/stop targets, and the cancellation time distinguish harmless replacement of an unstarted node from interruption of a sound that had already begun. A later `node` with the same `signalKey` is the replacement, not an extra playback.
- `FDV_AUDIO_SCHEDULE` with `stage: "suppressed"` when a planned sound is deliberately dropped or its immediate playback request is rejected. `suppressionReason: "past-target"` identifies a signal outside its semantic lateness window; warning-specific reasons identify a missing duration or a late sound that would overlap the next countdown target. `sound-not-allowed` means the browser's effective local sound policy denied the attempt; `playback-rejected` means sound was allowed but no playback backend accepted it. In both cases the logical signal is consumed and is never replayed late.
- `FDV_AUDIO_SCHEDULE` with `stage: "expired"` when a plan never created a Web Audio node and a timer reset finds it beyond its allowed lateness window. `suppressionReason: "scheduler-window-missed"` confirms that a frozen or throttled page intentionally dropped the signal instead of replaying it in the wrong phase. `bufferAttemptCount: 0` and `bufferLastFailure: "not-attempted"` mean the browser never ran the promotion callback; nonzero attempts retain the last local rejection reason.
- `FDV_TRANSITION` at the actual `render()` call that commits a new displayed phase/cycle. Its target is the canonical server boundary at which the new segment starts, even when an ordinary periodic render rather than the dedicated boundary timer catches the transition. `renderSource` identifies `boundary`, `periodic`, `state-update`, `state-clock`, `resume`, `watchdog`, or another direct action. The record also contains render-start and completed-render server times, lateness, labels, phase/cycle, visibility, clock quality, client identity, platform, and server instance.
- `FDV_SERVER_INSTANCE` once when the client changes from one non-empty `serverInstanceId` to another. It records both instance ids, the old and restored `startedAt`, their `timelineShiftMs`, the expected and received elapsed time, `elapsedDiscontinuityMs`, and both phase keys. This makes a restart rollback or jump explicit even when no ordinary transition is rendered while the server is unavailable. A small discrepancy comparable to network latency is normal; a phase change or a large timeline shift is not.

There is no periodic console traffic outside transition and final-countdown activity. Non-transition boundary callbacks do not build the aggregate boundary diagnostic object in this mode. Compact output is deferred until after the timer render or audio scheduling call whose timing it describes. Compare long-run records by `serverInstanceId` and canonical target time, then watch whether `targetErrorMs`, `commitLatenessMs`, or cross-client target spread grows over successive cycles.

Transition audio keeps both its exact Web Audio promotion timer and its fallback timer across safe phase/state rescheduling. A fallback with `bufferAttemptCount: 0` and `bufferLastFailure: "not-attempted"` therefore points to an unexpected cancellation path; a nonzero count reports the last local scheduling rejection directly.

A future synthetic Web Audio signal is accepted as `node` only while its `AudioContext` is `running`. A suspended context cannot cancel the server-time fallback or produce a misleading successful node record; the later fallback retains `bufferLastFailure: "audio-context-not-running"`. Browser autoplay policy still determines whether the immediate fallback can actually make sound before a user gesture. Diagnostics can prove that a Web Audio node was scheduled or an immediate playback request was accepted, but only an external microphone can prove physical speaker output.

Automatic phase transitions use a 1200 ms maximum lateness, while a manual or remotely observed start may still sound up to 1500 ms after its original server target. The manual-start watchdog's 250 ms delay is included inside that 1500 ms total rather than added to it. Five-second warning fallbacks use a 300 ms maximum, never replay accumulated warnings, and are suppressed if their known playback duration would cross the next warning or transition target. Precisely scheduled warning buffers are faded and stopped before that next target with a 20 ms separation guard.

Technical wake-up tones have separate bounded windows because they are not competition signals: the early `prewarm` may run up to 500 ms late, while the later `warm` may run up to 250 ms late. This absorbs ordinary scheduler jitter while still completing the early wake-up before the five-second warning batch is planned and the later wake-up before the first audible warning. Audible warning and transition limits are unchanged.

Setting `no_sound_warm=true` in `params.txt` suppresses the audible oscillator for both technical wake-ups in every Modern client, including forced-sound diagnostic modes. The scheduled callback still attempts to resume `AudioContext` silently, preserving the non-audible part of the preparation. Diagnostics retain the ordinary prewarm lifecycle and add `stage: "prewarm-muted"` when the tone itself was suppressed. A blank value or `false` keeps the default audible warm-up behavior.

### Audio after page suspension

Modern clients treat `visibilitychange` to hidden, `pagehide`, and `freeze` as best-effort suspension warnings. The first work in those handlers invalidates the current audio-schedule generation, stops tracked Web Audio and HTML Audio playback, and clears pending signal callbacks. A generation guard also prevents an asynchronous `AudioContext.resume()`, buffer load, HTML Audio rejection fallback, manual-start watchdog, or festival announcement created before suspension from restoring an obsolete sound later. If the browser does not deliver a suspension event, the ordinary per-signal lateness checks remain the final protection against uncontrolled playback.

On return to the page, the client does not wait for the network before restoring future signals. It first repairs the trusted local server-clock model when the monotonic clock paused, then rebuilds the schedule from the locally retained canonical timer state. This keeps future transition and countdown sounds available during a network interruption. A later successful server response force-stops and atomically replaces that provisional local schedule using the fresh authoritative state, so reconnecting cannot leave both local and server-derived copies active.

The sound for the phase that began while the page was suspended is a narrowly defined exception, not a generic “play the current phase” action. The exact canonical boundary signal is eligible only inside its semantic lateness window: 1500 ms for the initial start and 1200 ms for later automatic rotation/break transitions. It retains the original signal key, so a sound already consumed by that client cannot be replayed. Five-second warnings and other elapsed signals are never reconstructed as catch-up audio. A page returning later in the phase therefore stays silent until the next genuinely future signal.

Sparse diagnostics record `FDV_AUDIO_CLOCK` with `stage: "page-audio-invalidated"` before suspension and `stage: "page-audio-reschedule"` after a local repair/rebuild or authoritative server replacement. The records include the reason, phase/cycle, schedule generation, number of stopped pending objects, and whether the exact recent boundary was scheduled. This is the evidence to use when investigating a sound heard immediately after waking a phone or browser.

### Experimental Android audio-clock keepalive

Use `?perf=4` only for a direct A/B comparison with `?perf=3`. It keeps the same forced sound and sparse transition logging, then starts a continuous Web Audio oscillator for the final 10 seconds of each phase. Phases shorter than 10 seconds keep it active for the whole phase. Its gain is `0.00005` (approximately -86 dBFS), and it stops just after the phase boundary. The aim is to test whether keeping Android's audio rendering graph active prevents the `AudioContext.currentTime` pauses observed after a long silent rotation.

The experiment records `FDV_AUDIO_CLOCK` entries with `stage: "keepalive-start"` and `stage: "keepalive-end"`, including the phase, desired and actual start, boundary target, duration, stop reason, and a full audio-clock sample. Resume failures and node-creation failures are recorded separately. Compare `node-target-check.audioContextProgressErrorMs` for rotation countdowns between otherwise identical `?perf=3` and `?perf=4` runs. A reduction toward zero would support the Android idle-audio hypothesis; unchanged negative errors would rule out this particular workaround.

This oscillator is never created without `?perf=4`; normal competition operation and `?perf=1`–`?perf=3` are unchanged. Even at the very low level it is intentionally experimental and should not be promoted to normal operation until a phone test confirms both timing improvement and absence of audible output through the intended speaker path.

## Legacy browser

Open `legacy.html?perf=1`, or append `perf=1` to the automatic Legacy URL. `perf=2` also enables diagnostics there, but cannot force sound because the Legacy client has no audio scheduler. A compact overlay updates every five seconds. `perf=3` disables the overlay and periodic snapshots and emits only compact `FDV_TRANSITION` records; it still cannot produce audio records. The complete sample remains available from the console:

```js
FDVLegacyPerformanceDiagnostics.snapshot()
FDVLegacyPerformanceDiagnostics.reset()
```

The Legacy implementation uses ES5-compatible syntax and falls back to `Date.now()` when `performance.now()` is unavailable.

## Server

Start the server explicitly with diagnostics enabled:

```powershell
node serve-bouldering-timer.js --performance-diagnostics
```

Alternatively set `FDV_PERFORMANCE_DIAGNOSTICS=1` before starting the server. Read the current server sample at:

```text
http://127.0.0.1:8008/api/performance
```

Use `/api/performance?reset=1` to reset the current counters. The endpoint returns `404` while diagnostics are disabled. Response byte counters and the optional `Content-Length` measurement header are enabled only in diagnostic mode.

While a timer is running, the server compares wall-clock progress and its monotonic process clock with the operating-system uptime clock. A suspension mismatch of at least 100 ms after a gap of at least three seconds is repaired before elapsed time is returned and emits one `FDV_SERVER_CLOCK_REPAIR` server-console line. A wall-clock/NTP adjustment without an equivalent uptime gap is reported in that record but does not move the timer. Snapshots store the uptime anchor as well: after an ordinary process restart elapsed time advances by OS uptime, while an older snapshot or a full machine reboot falls back to the original absolute `startedAt`. Future scheduled starts retain their original wall-clock target.

Clock-continuity evidence is collected even when opt-in performance diagnostics are disabled. `clockDiagnostics` is included in primary state and diagnostics-stream payloads and is persisted in the runtime snapshot. It retains the last 12 continuity corrections, the latest snapshot difference between monotonic elapsed and `savedAtWall - startedAt`, and the latest restore difference between OS-uptime age and wall-clock snapshot age. The primary browser card folds these values into its `SYNC` status and card tooltip. This instrumentation does not change whether a correction is applied.

## Baseline scenarios

Measure at least these cases before an optimization:

1. No start lists.
2. One start list with 120 participants and five routes.
3. Four such start lists.
4. The same data with incidents, including a maximum-incident stress case.
5. Primary plus multiple modern and Legacy displays.
6. Online, temporarily disconnected, browser resume, and server restart recovery.

Record synchronization error and sound behavior alongside performance counters. A reduction in CPU, allocations, or network traffic is not acceptable if it weakens timer accuracy, signal timing, or recovery.

## Repeatable baseline harness

List the deterministic scenarios:

```powershell
node scripts/run-performance-baseline.js --list-scenarios
```

Run an isolated server-only sample. The script copies the required runtime into a temporary directory, so it cannot overwrite the normal `runtime-state` snapshot:

```powershell
node scripts/run-performance-baseline.js --scenario four-120x5-incidents --sample-ms 30000 --source-commit bce8a92 --output docs/baselines/bce8a92-four-120x5-incidents.json
```

Use `--serve` when collecting real browser samples. The script prints modern and Legacy URLs and keeps the isolated server alive until `Ctrl+C`:

```powershell
node scripts/run-performance-baseline.js --scenario four-120x5-incidents --serve
```

In `--serve` mode, every newly connected browser is assigned all start lists from the selected scenario once. Reset the server and client diagnostic counters after the pages have loaded if you need a strictly aligned measurement window.

Browser snapshots now include identity, synchronized-clock estimates, reported synchronization quality, server availability, and logical sound targets. Compare `canonicalTargetServerTimeMs` across modern browsers; it removes the deliberate per-browser audio calibration offset.

In `?perf=1` and `?perf=2`, modern and Legacy clients write a structured `FDV_PERFORMANCE_SNAPSHOT {...}` console entry every five seconds. This is intended for automated collection tools that cannot access page globals directly. `?perf=3` intentionally omits these large entries.

`clockOffsetSpreadMs` is valid only for tabs on the same computer, where `Date.now()` shares one wall clock. Cross-device display synchrony and physical speaker output still require a field test or an external common camera/microphone recording. Never interpret equal logical sound targets as proof that different speakers produced sound simultaneously.

The first optimization comparison is stored in `docs/baselines/optimization-01-canonical-start-lists.json`. Modern start lists are sanitized at server-payload, restore, and mutation boundaries, then kept canonical in memory. The frequent render key uses an incrementing data revision instead of serializing every participant row; `startListRenderSkips` records early returns from that key.

Modern start-list rendering is deliberately outside the timer-critical task. `scheduleStartListRender()` coalesces requests, waits until after a timer paint, and refuses to start close to the next authoritative display boundary. Table structure is rebuilt only after list data or structure changes; phase/cycle changes update existing route and row nodes. Relevant counters are `startListRenderRequests`, `startListRenderCoalesced`, `startListCriticalWindowDeferrals`, `startListDeferredRuns`, `startListTableRebuilds`, and `startListDynamicUpdates`.

Start-list width measurement is also deferred and coalesced. Its input key includes the viewport, visual viewport, list structure/data revision, density, visibility, orientation, and column count. A structural render and its surrounding visibility/resize work therefore share one queued fit instead of running a synchronous fit followed by several duplicate animation-frame fits. A settling request always gets one confirmation pass and only gets a third pass when the measured layout actually changed; intentional horizontal overflow no longer causes repeated measurement by itself. Delayed orientation callbacks remain because mobile viewport dimensions can settle asynchronously. Compare `startListWidthFitRequests`, `startListWidthFitCoalesced`, `startListWidthFitSkips`, `startListWidthFitSettlePasses`, `startListWidthFitRuns`, and the `fitStartListPanelWidth` timing.

Legacy timer-font fitting is also removed from the ordinary displayed-second path. A label change calls `fitTimerText()` only when the required minute-digit width changes; viewport, orientation, list-layout, page-return, and font-load events retain settling checks. Those checks reuse one canvas/context and skip the binary search when the viewport, wide sample, weight, and family key is unchanged. `timerFitCalls`, `timerFitSkips`, `timerFitSearches`, and `timerFitCanvasCreates` distinguish inexpensive settling checks from actual font searches. Timer values and boundary scheduling remain independent of fitting. The focused browser result is stored in `docs/baselines/optimization-03-legacy-timer-fit.json`.

## Display-boundary stress trace

Modern and Legacy `?perf=1` snapshots include `display.boundaryEvents`, a rolling window of the last 16 scheduled display boundaries. Each event records the authoritative server target, callback and completed-render server times, callback/commit lateness, render duration, labels before and after the callback, phase, page visibility, and server instance. Modern has an intentional 8 ms boundary guard; Legacy has a 25 ms guard, both recorded as `guardMs`.

The aggregate timings `displayBoundaryCallbackLateness`, `displayBoundaryCommitLateness`, and `displayBoundaryRender` remain available after an event leaves the rolling window. Counters record callbacks whose completed display was at least 100, 500, or 1000 ms late.

For a weak Linux VM or another stress environment:

1. Keep its local clock configuration unchanged if clock offset is part of the test. A large stable wall-clock offset is valid; compare stability and cross-client spread instead of requiring the offset to be near zero.
2. Open both clients with `?perf=1`, then run `FDVPerformanceDiagnostics.reset()` or `FDVLegacyPerformanceDiagnostics.reset()` in the matching console.
3. Reproduce the visible discrepancy and export both consoles promptly. The structured five-second snapshots will contain overlapping boundary windows.
4. Align events primarily by `targetServerTimeMs`, `serverInstanceId`, resulting label, and phase. Use `commitLatenessMs` to compare what spectators could see; use `callbackLatenessMs` versus `renderDurationMs` to separate scheduler starvation from expensive rendering.

The trace is fully disabled without `?perf=1`, `?perf=2`, `?perf=3`, or `?perf=4`; the normal boundary callback does not build diagnostic objects or collect the rolling history. In `?perf=3` and `?perf=4`, non-transition boundaries are discarded immediately.
