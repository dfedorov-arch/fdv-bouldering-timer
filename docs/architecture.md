# Timer architecture

## Source of truth

The Node.js server is the only authority for competition state and time. Browsers send commands and render the state returned by the server. A browser may extrapolate the countdown while temporarily offline, but it must reconcile with the server after reconnecting.

## Module boundaries

- `serve-bouldering-timer.js` owns HTTP/HTTPS, SSE connections, snapshots, client registration, diagnostics, sound commands, and orchestration.
- `lib/timer-domain.js` owns validation and normalization of timer settings and scheduled clock-time calculations.
- `lib/timer-transitions.js` owns pure runtime state transitions. It does not perform I/O or mutate the previous state.
- `lib/client-action-transport.js` owns browser command delivery, retries, timeouts, version conflicts, and control-denial results.
- `index.html` owns presentation, browser clock synchronization, sound scheduling, and user interaction.

The public `/api/state`, `/api/action`, and SSE payloads are compatibility boundaries. Refactoring inside a module must not silently change these payloads.

## State transition contract

Every timer command is evaluated from one complete previous state and produces:

1. a complete next state;
2. whether the state changed;
3. clock effects (`set`, `clear`, or `keep`);
4. the next scheduled transition time;
5. an optional audio prewarm command.

Runtime commands carry a base version and a unique command ID. The server rejects stale versions and caches command results so network retries cannot execute the same command twice.

## Persistence

The server writes `runtime-state/timer-state.json` atomically through a temporary file and restores recent snapshots on startup. The integration suite verifies active and paused restoration. Snapshot format changes require a schema-version change and migration or an explicit safe fallback.

## Release gates

Before a release:

```bash
node serve-bouldering-timer.js --generate-offline-audio
node scripts/verify-release-inputs.js
node --test test/*.test.js
```

`scripts/verify-release-inputs.js` rejects mismatched build numbers or missing runtime modules. `dist/` is generated output and must not be edited manually. Portable packages must be built through `scripts/build-portable-releases.sh` and smoke-tested from the extracted archive.

Release packaging requires the Windows, macOS, and Linux GUI launcher artifacts by default and fails before downloading runtimes if any launcher is missing. An intentionally incomplete local package without GUI launchers must be requested explicitly:

```bash
scripts/build-portable-releases.sh local --without-launchers
```

Packages produced in that mode are development artifacts, not release candidates.
