# Timer architecture

This document describes the current implementation contract. User-facing documentation uses **start list** / **список**. Existing internal identifiers such as `startList*`, `protocolRevision`, and `legacyProtocols` are compatibility details and must not be renamed casually.

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

Scheduled Classic and Festival starts automatically enter cycle 1 at the absolute target time. Final finishes its preliminary countdown in a waiting state and requires a separate Start. Stop followed by Start clears the scheduled-start label and immediately shows the correct cycle state.

## Start lists

Up to four independent lists can be imported. They are informational and never drive timer duration. The server stores canonical sanitized data, incidents, exclusions, a revision that includes server-instance identity, and per-client display selections.

Modern clients retain the last complete payload for the matching revision. Unchanged state responses can omit large list arrays. Legacy requests send their known revision and receive full selected data only when data, server instance, or selection changes.

Each secondary display can select a different subset. With exactly two visible lists, it also stores a per-display stacked/parallel override. Turning the global Start lists switch off hides lists everywhere but preserves those selections.

Participant progression is derived from effective cycle order after exclusions and route incidents. A temporary route suspension has a start cycle and optional resume cycle; both planned boundaries must remain visible before either cycle occurs. Editing incidents, seeking, and excluding/restoring rows must preserve unaffected list scroll positions.

Tables are read-only in screen mode, including after the primary browser enters its Screen view. Modern rendering separates structural rebuilds from dynamic cell updates and defers width fitting outside timer-critical display boundaries. Legacy builds stable tables and updates marker classes incrementally where possible.

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

## Persistence

Server state is written atomically to `runtime-state/timer-state.json` through a temporary file. Browser offline snapshots use compact change keys and a five-second safety checkpoint instead of serializing complete moving state on every render. Start-list data is revisioned and not embedded repeatedly when unchanged.

Schema changes require a version migration or explicit safe fallback. Integration tests cover active, paused, scheduled, Final, and restart recovery paths.

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
