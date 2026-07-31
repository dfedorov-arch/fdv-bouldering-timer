# Performance diagnostics

Performance diagnostics are opt-in and disabled during normal timer operation. They observe existing code paths; they do not change the authoritative clock, render cadence, sound scheduling, synchronization requests, or recovery snapshots.

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

The snapshot contains operation counters, duration totals/averages/maxima, event-loop lag, signal scheduler collection sizes, and loaded protocol totals.

## Legacy browser

Open `legacy.html?perf=1`, or append `perf=1` to the automatic Legacy URL. A compact overlay updates every five seconds. The complete sample remains available from the console:

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

## Baseline scenarios

Measure at least these cases before an optimization:

1. No protocols.
2. One protocol with 120 participants and five routes.
3. Four such protocols.
4. The same data with incidents, including a maximum-incident stress case.
5. Primary plus multiple modern and Legacy displays.
6. Online, temporarily disconnected, browser resume, and server restart recovery.

Record synchronization error and sound behavior alongside performance counters. A reduction in CPU, allocations, or network traffic is not acceptable if it weakens timer accuracy, signal timing, or recovery.
