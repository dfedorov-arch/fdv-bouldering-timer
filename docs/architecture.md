# Timer architecture

This document describes the current implementation contract. User-facing documentation uses **start list** / **список**. Existing internal identifiers such as `startList*`, `protocolRevision`, and `legacyProtocols` are compatibility details and must not be renamed casually.

Numbered timer repetitions use **Ротация / Rotation** in both clients and the incident editor. This is a display-only terminology change: `cycle`, `seekCycle`, `startCycle`, `resumeCycle`, saved state, and imported Cycle column aliases retain their existing names and behavior.

## Authority and clocks

The Node.js server is authoritative for competition state, settings, browser assignments, start lists, incidents, and timeline anchors. Browsers render that state and extrapolate the moving timer from synchronized timestamps.

Three time domains are intentionally separate:

- server wall time anchors scheduled starts and restart recovery;
- a server monotonic clock advances running state without wall-clock corrections;
- each browser's monotonic clock drives local rendering between responses.

Clients estimate server offset and request delay from repeated samples. Timer rendering is scheduled near the next displayed-second boundary. Diagnostics also report render delay. A modern or Legacy display may continue from its last authoritative timeline during a temporary outage, but it reconciles with the server after reconnecting. The optional TIME display formats local wall time using the server time-zone offset; it is not the timer's time source.

Persisted running state retains an absolute timeline anchor. Restart recovery must prefer that anchor over a stale saved elapsed value so process downtime does not shift the competition. Clock-source disagreements are recorded in diagnostics rather than silently hidden.

## Runtime modules

- `serve-bouldering-timer.js`: HTTP/HTTPS, API actions, SSE, client registry, ordering/pinning, per-display list selection/layout, snapshots, state versions, sound commands, diagnostics, and static files.
- `lib/timer-domain.js`: settings normalization, validation, scheduled clock-time calculations, and domain helpers.
- `lib/timer-transitions.js`: pure runtime transitions. It performs no I/O and does not mutate the previous state.
- `lib/client-action-transport.js`: browser command delivery, retry/timeout handling, base-version conflicts, and control-denial results.
- `index.html`: modern UI, rendering, clock synchronization, sound scheduling, start-list editing, diagnostics, standalone behavior, and interaction.
- `legacy.html`: old-browser shell.
- `lib/legacy-start-list.js` and `lib/start-list-display.js`: Legacy-compatible list rendering, participant progression, incidents, and layout.
- `lib/offline-audio.js`: generated embedded settings and audio data used when the modern page runs without the server.

`/api/state`, `/api/action`, and the SSE state payload are compatibility boundaries. Refactors may reduce or omit unchanged list payloads by revision, but must preserve client-visible semantics.

## State transitions and commands

Every timer command is evaluated from one complete previous state and produces:

1. a complete next state;
2. whether anything changed;
3. clock effects (`set`, `clear`, or `keep`);
4. the next scheduled transition;
5. an optional audio prewarm command.

Runtime commands carry a base version and unique command ID. The server rejects stale versions and caches results so a network retry cannot execute one command twice.

Scheduled Classic and Festival starts automatically enter rotation 1 at the absolute target time. Final finishes its preliminary countdown in a waiting state and requires a separate Start. Stop followed by Start clears the scheduled-start label and immediately shows the correct rotation state.

Completed one-shot attempts render zero with the configured break background/text palette at the same display boundary, including local extrapolation before a server completion snapshot arrives. Modern uses `break-active` in its completion branch; Legacy selects break colors for `view.phase === "done"` without changing `view.isBreak` or list scheduling. Readiness, scheduled-start waiting, and repeating zero-break rotations retain their original colors. No extra render timers or geometry fitting are added. Completed route diamonds use dark blue `#28508c` in both clients; permanently stopped route crosses remain red.

## Start lists

Up to four independent lists can be imported. They are informational and never drive timer duration. The server stores canonical sanitized data, incidents, exclusions, a revision that includes server-instance identity, and per-client display selections.

Modern clients retain the last complete payload for the matching revision. Unchanged state responses can omit large list arrays. Legacy requests send their known revision and receive full selected data only when data, server instance, or selection changes.

Each secondary display can select a different subset. With exactly two visible lists, it also stores a per-display stacked/parallel override. Turning the global Start lists switch off hides lists everywhere but preserves those selections.

Participant progression is derived from effective rotation order after exclusions and route incidents. A temporary route suspension has a start rotation and optional resume rotation; both planned boundaries must remain visible before either rotation occurs. Its persisted `blocksStartCycleWave` flag determines whether the whole concurrent wave is held from the suspension rotation, including participants who would otherwise start on upstream routes. The incident editor defaults this flag on when the selected start rotation moves into the future and off for a current or past rotation, but an explicit operator choice is authoritative. Missing flags in older saved state retain the pre-feature behavior. Editing incidents, seeking, and excluding/restoring rows must preserve unaffected list scroll positions.

Modern marker rendering, incident creation/previews, and Legacy marker rendering use shared ES5 `calculationIncidents` before evaluating attempts. It first rebases exclusions, then resolves whole-wave pause anchors chronologically against already resolved earlier incidents, with the current Classic/Final schedule. Thus an earlier suspension added later, changed, resumed, or removed cannot leave a later pause tied to a stale participant. Stored snapshots are not mutated: old saved anchors are corrected on read for calculation. Pauses without whole-wave hold keep their explicit participant anchors. An unresolved earlier pause without any schedulable participant retains the saved later anchor until the timeline becomes resolvable. Results are cached by incident contents, exclusions, participant count, and format parameters (at most eight entries); in-place edits invalidate the key. No new intervals, per-cell anchor searches, or geometry fitting are added.

Shared `stopSupersedingPause` identifies a same-route permanent stop with `stop.startCycle <= pause.startCycle`. Such a pause stays in saved data but is excluded from anchor resolution, attempt delays, future/current pause markers, active/editable pause lookup, pause-history highlighting, and upstream header states. The modern incident note explains that the pause does not apply. This also covers old zero-length stop-ended records saved by the previous editor at an equal start rotation. Removing the stop restores eligibility without deleting the pause. A stop strictly after the pause start preserves the existing suspension/stop-resolution behavior and accumulated delay. No extra render or geometry schedule is introduced.

The incident editor rewrites a pause as stop-ended only when the stop is strictly after its start. Sanitization uses the same strict boundary when inferring a stop resolution for an open-ended pause. A stop at or before the start therefore preserves the original `resumeCycle` and `resolution`, so cancellation restores a scheduled ending exactly (17 through 17 means resume 18), including after persistence/reload. Open-ended pauses stay open-ended. The existing cancellation behavior for a pause that already began before the stop is unchanged; old data whose ending was previously overwritten cannot reveal the original value.

Tables are read-only in screen mode, including after the primary browser enters its Screen view. Modern rendering separates structural rebuilds from dynamic cell updates and defers width fitting outside timer-critical display boundaries. Legacy builds stable tables and updates marker classes incrementally where possible.

Screens with visible lists retain a read-only rotation badge below the timer, including fullscreen and Legacy. Modern screens reuse the existing schedule chip and footer while progress/actions remain hidden. Legacy reserves a fixed 66-pixel footer for its badge only when lists are visible. Badge text/class updates reuse existing render boundaries; no new interval or recurring geometry fit is introduced. Optional server clocks and the badge occupy separate space. Without lists the original timer-only layout is preserved.

Legacy explicitly refits geometry on list visibility transitions, including global disabling and hiding the last per-screen list. This clears inline list-area reservations even on old TVs that emit no resize event. Unchanged visibility does not trigger this fit.

Portrait Legacy tables use automatic intrinsic column sizing: the first data column has a 30-pixel minimum and route cells use 26 pixels, leaving space for complete participant text. Measured horizontal overflow enables scrolling in either orientation; compatible stacked tables retain shared column widths. Overflow checks remain behind the existing list-progress/revision guard and bounded viewport-fit callbacks, with no new interval or continuous geometry fitting.

For a temporary suspension resolved by resuming, participant pause markers disappear from `resumeCycle - 1` onward. The unchanged shifted attempt schedule supplies ready markers for attempts starting at `resumeCycle`, including upstream participants held by `blocksStartCycleWave`. Route headers and incident editing still treat the route as paused until `resumeCycle`. An unresolved suspension, a suspension resolved by stopping, or another ongoing suspension retains its own markers. This rule lives in the shared ES5-compatible display module and adds no timers or geometry recalculations.

Before this preparation boundary, a bounded resume limits pause icons to attempts whose pre-pause scheduled climbing overlaps the paused interval; preparation counts only for routes 2 and later, after the participant has entered competition. `pauseMarkerRoute` caps first-route `waitingFromCycle` at `resumeCycle - 1`, and later routes at `resumeCycle`. It keeps one icon on the earliest held route for each participant. The pre-pause schedule includes previous incident shifts and uses effective participant indexes and the selected Final format. This changes marker selection only, not `attemptInfo` or the delayed timetable. Open-ended pauses and those resolved by stopping are not capped; a zero-length pause has no interval to mark. The incident description uses `resumeCycle - 1` as the inclusive last paused rotation, while the resume input and actual schedule still use `resumeCycle`. Zero-length pauses get a neutral no-paused-rotations description; a stop resolution still names the actual stop rotation.

## Browser registry and diagnostics

One browser can be primary. It always occupies position 1 and is not movable. Other clients may be reordered; pinning persists their intended position through disconnect/reconnect. When at least three browsers exist, the primary can enable matching browser numbers on cards and screen timer areas.

Diagnostic badge order is `LEGACY`, `AUDIO`, `TIME`, `NET`, `SYNC`, `SSE`, `TAB`, then `LIST 1–4`. Color semantics are shared:

- gray: unavailable;
- dark green: available but inactive;
- light green: active or healthy;
- yellow: warning;
- red: failed or expected but not working;
- cyan: visible list or layout action;
- orange outline: manual Legacy choice on a capable browser, or a two-list layout that differs from default.

Wake Lock is part of the modern TAB tooltip, not a separate badge. Legacy does not claim a Wake Lock state. AUDIO uses actual AudioContext clock-progress error for health; `baseLatency` and `outputLatency` are informational only and do not determine status.

## Audio

The server describes sound events; each eligible modern browser schedules playback against its synchronized timeline. Primary and remote sound permissions are independent, and browsers on the primary computer are suppressed to prevent duplicate sound. User offsets are per client. Mobile autoplay rules require an explicit user gesture.

The ordinary mode keeps only a compact audio-clock progress measurement. Extended performance diagnostics are opt-in and must not add continuous tracing to normal operation.

## Android standalone window

The native APK embeds the generated standalone HTML in a WebView. Android 15+ enforces edge-to-edge for the current target SDK 35, so `MainActivity` places the WebView in a full-size FrameLayout and applies visible `systemBars() | displayCutout()` insets as absolute container padding. The WebView receives the remaining inset rectangle, preventing duplicate system-bar reservation without dropping unrelated keyboard insets. Hidden bars add no fixed gap; gesture navigation uses its actual smaller bottom inset, and landscape bars/cutouts can reserve side space. Android 8–14 retain the original decor-fitted window with zero additional padding.

The listener runs only when Android dispatches window-inset changes. Identical padding is not written again; one initial `requestApplyInsets()` follows `setContentView`. There are no new JavaScript timers, polling, geometry-fitting loops, HTML/CSS changes, or AndroidX dependencies. `test/android-insets.test.js` exercises the actual Activity against JVM API doubles for old/new OS versions, button/gesture/hidden navigation, repeated events, rotation, cutouts, and remaining keyboard insets. This does not replace a real APK build or device/emulator visual check. The platform contract is documented in [Android's edge-to-edge guide](https://developer.android.com/develop/ui/views/layout/edge-to-edge).

## Persistence

Server state is written atomically to `timer-state.json` through a temporary file. `lib/runtime-state-storage.js` chooses the location: portable packages keep `runtime-state/` beside the server; MSI, PKG, and DEB install `fdv-installed.marker` and select per-user state storage. Windows uses `%LOCALAPPDATA%/FDV Bouldering Timer/runtime-state`, macOS uses `~/Library/Application Support/FDV Bouldering Timer/runtime-state`, and Linux uses `${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/runtime-state` (relative XDG paths are ignored). A one-time startup write probe also handles old unmarked installations: only `EACCES`, `EPERM`, or `EROFS` in the portable directory trigger fallback to the per-user directory. The selected directory is logged by the server and therefore visible in the launcher. No recurring directory probes are added.

If the selected snapshot does not exist, startup may restore the previous snapshot beside the application and then save it in the selected directory. The old file is retained. Once a new snapshot exists it takes precedence; invalid or expired new state must not fall back to an obsolete old file. Browser offline snapshots use compact change keys and a five-second safety checkpoint instead of serializing complete moving state on every render. Start-list data is revisioned and not embedded repeatedly when unchanged.

Schema changes require a version migration or explicit safe fallback. Integration tests cover active, paused, scheduled, Final, and restart recovery paths.

## Launcher networking

Desktop launchers start the server on the wildcard listener (`0.0.0.0`) so every active local interface can accept connections. They refresh parsed settings and displayed links whenever the server restarts, and refresh network links when the operating system reports an address change. Address discovery is local interface enumeration only: the macOS/Linux launcher must not initiate Bonjour browsing merely to trigger a Local Network permission prompt. Health probes are serialized and bounded so a stopped or changing server cannot accumulate connections.

## Generated outputs and release gates

Do not edit generated `dist/` packages or `lib/offline-audio.js` manually. Before release:

```bash
node serve-bouldering-timer.js --generate-offline-audio
node scripts/verify-release-inputs.js
npm test
npm run test:visual
```

Portable releases are built with `scripts/build-portable-releases.sh` and smoke-tested from extracted archives. GUI launcher artifacts are required by default. `--without-launchers` creates a development artifact, not a release candidate.

When a visible feature changes, update `help.html`, `ReadMe.txt`, `README.md`, the documentation map, relevant technical documents, and current `help-assets` screenshots in the same change. Update visual regression baselines only after inspecting the intentional result.
