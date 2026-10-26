# Timer architecture

This document describes the current implementation contract. User-facing documentation uses **start list** / **список**. Existing internal identifiers such as `startList*`, `protocolRevision`, and `legacyProtocols` are compatibility details and must not be renamed casually.

Numbered timer repetitions use **Ротация / Rotation** in both clients and the incident editor. This is a display-only terminology change: `cycle`, `seekCycle`, `startCycle`, `resumeCycle`, saved state, and imported Cycle column aliases retain their existing names and behavior.

## Authority and clocks

### Windows HTTPS certificate creation (build 419)

The native launcher has a RU/EN selector. `LauncherLanguage.cs`
loads a per-user launcher-language.txt preference before single-instance/error
UI; missing/invalid values default to Russian regardless of OS language, while
saved ru/en choices take precedence. Switching updates existing
controls/status/tray/address labels while preserving selected URL and server
readiness, then saves the preference. It never rewrites params or browser storage,
starts a process, resets server-health timers or changes clock/audio behavior.
From build420 it additionally sets the common language on its own child server:
the launcher generates a random32-byte capability per launch, passes it only in
the child environment and uses an asynchronous loopback POST. The server captures
and removes that environment variable; it is never in public state, snapshots,
files, browser URLs or logs. `lib/launcher-language.js` checks loopback, constant-
time token equality, absence of browser-origin headers and language-only ru/en
payloads. No browser registration/impersonation/PIN bypass for other commands is
introduced. Language updates use the ordinary version/snapshot/SSE/replication
path and are idempotent when already selected. A following reserve forwards this
specific path through authenticated reverse RPC; an internal request marker is
set only by the server's peer callback, never accepted from JSON/HTTP headers.
Fenced/rejoining/baseline-loading nodes reject changes. Pending native choices
are coalesced/serialized and process-bound; startup readiness applies the current
choice before optional browser opening. Failure logs a warning and does not
restart anything; no periodic language polling/retry is added. Browser changes
are not polled back into the launcher. Existing SSE language changes may rebuild
future audio nodes as before, but the canonical start anchor and sound targets
remain unchanged; the audio implementation is untouched.
Certificate dialogs inherit the selection, including custom validation errors.
Raw Node.js output/system error details and historical log lines are untouched.
Passive native UI tests exercise actual button clicks with fixture-only state;
production construction retains the original startup/health/network behavior.

`HttpsCertificateDialog.cs` is operator-only UI in both modern and CLR2 launchers.
`HttpsCertificate.cs` uses the user-scoped RSA/AES CryptoAPI provider, explicit
SHA256-RSA signing and native `CertCreateSelfSignCertificate`; custom DER only
encodes SAN DNS/IP extensions. RSA2048, CA:false, serverAuth and 365-day validity
are explicit. The unique temporary key container is deleted after PFX export.
It never writes to an X509 trust store. See Microsoft's
[native signing API](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-certcreateselfsigncertificate)
and [AES provider](https://learn.microsoft.com/en-us/windows/win32/seccrypto/microsoft-aes-cryptographic-provider).

Installed marker selects per-user LocalAppData/FDV Bouldering Timer/https;
portable selects root/https with user fallback if its dedicated directory cannot
be secured/written. An active portable PFX must be replaced in place or fail.
Private directory/file ACLs allow current user and SYSTEM only. Atomic temporary
files + File.Replace retain private backups; public CER is rolled back if PFX
publication fails. The compatibility password is not a secret/access boundary.
`lib/https-certificate-storage.js` mirrors paths read-only at startup. Managed
PFX outranks legacy root PEM/PFX; all static paths under https are denied.
Node.js and launcher must run under the same Windows user.

Replacement consent and server restart consent are separate, default No. Merely
creating a certificate changes neither the running HTTPS context nor advertised
links; only an explicit restart activates it. There are no new timer/geometry/
network polling loops or clock/audio/replication changes. Trust, DNS and firewall
remain explicit operator tasks; mutual Node.js trust is needed for Secondary.
Native tests cover TLS/startup/ACLs/backups/restart, opt-in Node12 and CLR2 builds
on modern Windows. Actual old-OS certificate validation remains a hardware task.

### Hot secondary server (build 416)

Build 418 setup advertises an HTTP loopback primary using the local address of its actual TCP connection to a non-loopback reserve (one setup-only status probe, never first-NIC selection). Explicit network origins/domains and same-machine loopback pairs remain unchanged. HTTPS loopback requires reopening the primary at a certificate-covered network name; no TLS bypass or HTTP downgrade is added. Before accepting a cross-machine pair, the reserve performs a bounded reverse GET of public state without clientId and verifies the primary process/build. A per-acceptance guard and recheck prevent asynchronous pairing from overwriting a newly started competition. NAT/firewall/certificate failures produce actionable localized errors. Both origins must still be reachable by all clients. Persisted old pairs are not silently migrated; explicitly unpair/reconfigure them.

Pair acknowledgements and authenticated heartbeat responses carry the reserve's observed client origins back to the primary, retaining bounded aliases for CORS in both directions. The client recognizes reserve aliases and unpair acknowledgements using known process identities without canonicalizing a live URL or reconnecting audio solely for metadata. Unrelated/stale processes cannot clear pair metadata. This permits a localhost-opened operator to keep its original document/endpoint while the canonical primary address is a LAN origin, and a localhost-opened reserve display to return across origins.

Normal removal sends authenticated `requireNoClients` to the reserve; its current local registry is checked atomically before removing the pair. Failures return `SECONDARY_HAS_CLIENTS` with only minimal browser labels/IDs/display numbers/addresses. The UI maps these IDs to the operator's diagnostic numbers, uses textContent (not HTML), and localizes return/close/wait instructions. A six-second last-contact expiry remains unchanged. Setup rollback omits this guard so a failed initial handshake can still undo its own newly created pair. No extra periodic request/timer loop is added: address checks occur only at setup and the client check at explicit removal; bounded origin metadata rides existing heartbeat responses. Timer math, rate fitting, audio warm-up/scheduling and rendering are unchanged.

`lib/secondary-server.js` is the server-side Secondary server controller; the ES5 `lib/client-secondary-server.js` is shared by Modern and Legacy. With no configured pair, there are no replication/probe timers or requests. Single-file HTML and Android standalone mode disable this controller; Android network mode uses the ordinary server page. The normal primary clock, browser rate estimator and audio warm-up/scheduling policy are unchanged.

Build 417 uses full Резервный / Secondary names in dialog text, tooltips and errors; SEC is retained only as a compact button/badge label and in documentation referring to that label. Internal `sec` API/storage fields are unchanged. Global hotkeys ignore already-handled/composition events, inputs, textareas, selects, editable content and open dialogs, so typing HTTP or a hostname cannot reset/start/pause the competition. This adds no polling or geometry work and does not alter clock/audio scheduling.

The primary's Secondary server setup pairs one empty, running server with the same application build and deterministic binary audio/font hash. It refuses a pre-existing competition, primary browser, different build or resource mismatch. A private random 256-bit pairing key authenticates replication and is persisted only in the runtime snapshot; static serving denies runtime-state, Git metadata and key files. Public state exposes the session identifier and addresses, never the key. Pairing is server-to-server, not a cross-origin browser POST. This is not a replacement for firewall/access control: existing primary-client/PIN controls remain the application's control boundary.

The primary pushes at one-second intervals, coalescing an immediate push after changes. Full canonical state/configuration, list data/revision, audio offsets, Legacy choices and recent applied command IDs are sent only when the version differs; clock measurements, browser registries and pending commands/events accompany heartbeats. Audio/font binaries are not transferred. The standby uses four-timestamp, low-RTT measurements to align its own monotonic clock to the original primary timer coordinate. It learns a bounded rate after a sufficient sample span with repeated candidate confirmation, limits incremental offset corrections, and keeps that affine clock running without packets. It preserves the logical start anchor, rather than restarting from a rounded elapsed value. Its calendar compatibility API is derived separately for Legacy. Only corroborated host sleep advances a paused monotonic source; a wall-clock step alone does not repair it.

A browser moved individually to a following standby sends actions there. Reverse RPC in a separate primary-initiated long-poll channel wakes immediately for an operator command, executes it at the primary and prompts immediate replication of state/results. Idle command polls return after 1.2 seconds; ordinary state/clock heartbeats remain one-second. The heartbeat response is also a fallback command carrier if no long poll is open. Expired unsent requests are removed. Runtime command IDs deduplicate retries and are included in the standby ledger. List edits translate the standby's local revision to the original source revision, preserving conflict checks. Mirrored targeted audio tests/wake/Legacy events carry deduplication IDs and expiry; reconnection must not replay stale sound tests. There is no independent browser command fan-out that could double-apply Start/Pause/Seek.

Each browser probes its standby every 2.5 seconds using XHR (including Legacy), independently of ordinary server synchronization. Only successful contact with its active primary resets the 20-second primary-outage threshold; successful standby probes do not postpone failover. At the threshold the browser can join a still-following standby if only its own primary path failed. Once the upstream is stale, the standby is promoted; explicit primary-operator group takeover can promote immediately. Native HTTP timeouts/probe cadence mean observed cutover can be later than exactly 20 seconds.

Cutover changes API/SSE/audio/font endpoints inside the same document, not `location`. Client identity, AudioContext and fullscreen are preserved. Modern retires old transports and instance IDs, obtains a measured clock for the new process, then follows the existing initial-calibration/audio recovery policy. Merely configuring a Secondary server must not clear an existing schedule or replace Web Audio nodes. Legacy changes its XHR endpoint and recalibrates its existing simplified clock; it remains silent. The original document origin and its service worker/storage remain unchanged, including after reload from that origin. Cross-origin CORS is restricted to the pair and retained client connection-origin aliases. HTTPS-to-HTTP mixed content and browser private-network restrictions still apply. Native server HTTPS requests verify certificates: a browser warning exception does not establish Node.js trust. Install a trusted CA/certificate on both sides; do not disable TLS verification.

Public `sec` metadata drives setup status and per-browser SEC badges after TAB. Diagnostics merges both registries by stable client ID and freshness, marks `onSecondary`, and includes the standby clock error in modern SYNC estimates. A dark-green SEC means reachable but not used, light-green means the browser is connected through it, gray means unreachable. A browser's badge moves it; the primary browser's badge promotes the standby and moves the group. The SEC button beside PIN opens setup instead.

Secondary server switching is bidirectional: a light-green badge returns the selected browser to the current primary (not necessarily the original machine after role reversal). Returning the operator from a following standby moves the group without changing authority. `/api/sec/switch` on a follower uses the existing authenticated reverse-RPC channel with a whitelisted endpoint, so switch requests always originate at the current authority. Per-client `switchRequests` contain explicit destinations and monotonically increasing sequences; clients persist consumed sequences for the pair/epoch and do not reapply old return commands after a later automatic failover. Full switch maps replace, rather than union with, previous replica maps. A selected known process is explicitly re-enabled in both retired-instance guards before measured reconnection. Sticky takeover blocks returning to a stale/fenced former authority until the role-reversal handshake is complete.

The badge is labelled LEG in all cards (full LEGACY accessible name retained). Main diagnostic rows never wrap and compact their spacing/fonts when a Secondary server is configured, reserving the existing right-side ordering-control area. Mobile rows without a Secondary server also remain contained. LIST selectors keep their separate wrapping rules. This uses CSS only: no extra measurement, ResizeObserver, timer or repeated geometry-fitting loop.

Promotion is sticky and durably saved before acknowledgement. A promoted standby rejects replication; a returning old primary is fenced when it reconnects and cannot overwrite the active competition. It then initiates authenticated `/api/sec/rejoin`: the active server verifies build/assets and probes `/api/sec/return-ready` at a previously known return address, checking process identity and fencing. LAN/public origins are preferred over localhost aliases. If this reverse path is inaccessible or TLS trust fails, the active server remains promoted and the old primary stays fenced and retries; no falsely ready reserve is announced.

After verification, the active server durably reverses the pair's URLs/roles and increments `sec.epoch`; its timeline and exact start anchor remain unchanged. The returning server adopts the new epoch, clears stale local command results, blocks measured state while receiving its baseline, calibrates to the new primary and imports its latest state (including changed operator/PIN, lists and settings). Only then is the reserve ready. The acknowledgement is idempotent if lost; a repeated old rejoin does not create another epoch. Older-epoch replication is rejected before changing source identity or clocks. The new primary retains its affine clock/config across restart, and its replicated command ledger includes IDs inherited from the previous authority.

There is no automatic failback of the current primary. Browser metadata-only role changes update the Secondary server target without reconnecting the already-correct endpoint or touching audio. Stranded old-primary pages move to the current primary once. A later deliberate visit to the recovered reserve is retained. Older-epoch responses are discarded, while the specifically identified returned process can become a valid endpoint again; the next takeover can reuse it even without restarting that process. This also applies to Legacy. Bidirectional server reachability and certificate trust are required for automatic reversal; no new third-party discovery service is used.

Pair metadata/epoch, replica clock/rate, exact start anchor, mirrored configuration, primary/PIN and recent command ledger survive process restart using the existing calendar/uptime recovery policy. Pair removal requires the current unfenced primary, a reachable non-promoted standby, and no connected standby browsers.

This is asynchronous two-server hot standby, not consensus or synchronous transactional replication. A command lost before acknowledgement/replication may be absent after takeover. Without a third-party witness, a complete partition can leave an isolated primary active while another partition promotes the standby; fencing becomes enforceable when communication returns. Operators must provide network reachability and test the actual topology before competition. Self-signed certificate trust, actual Legacy CORS support and multi-device speaker timing require hardware/network verification; browser emulation cannot prove them.

Regression coverage: `test/secondary-server.test.js` covers pairing/refusal, monotonic rate, timeline identity, forwarding/deduplication, list revision translation, access restrictions, state/PIN/configuration/command-ledger restoration, pending Final restart and independent completion. Return scenarios change the operator during outage, reverse twice, restart the new primary, drop a committed role-change acknowledgement and block a return address. `test/client-secondary-server.test.js` covers the exact threshold, partial outage, per-tab persistence, old-epoch rejection, metadata-only reversal and subsequent reuse of the old process. `test/visual/secondary.spec.js` uses two real isolated servers plus Modern/Legacy pages for audio-node preservation, single/all transfer, merged diagnostics, two successive role reversals and timed outage/return as standby.

### Established single-server timing

The Node.js server is authoritative for competition state, settings, browser assignments, start lists, incidents, and timeline anchors. Browsers render that state and extrapolate the moving timer from synchronized timestamps.

Three time domains are intentionally separate:

- server wall time anchors scheduled starts and restart recovery;
- a server monotonic clock advances running state without wall-clock corrections;
- each browser's monotonic clock drives local rendering between responses.

Modern clients estimate server offset, request delay, and browser-clock rate from measured HTTP exchanges. Their local time model is `serverAtAnchor + (performance.now() - perfAtAnchor) * clockRate`. SSE delivers state changes, not clock measurements: an unmeasured push timestamp must never move that model. Timer rendering is scheduled near the next displayed-second boundary. Diagnostics also report render delay. A modern or Legacy display may continue from its last authoritative timeline during a temporary outage, but it reconciles with the server after reconnecting. The optional TIME display adds the separately received calendar offset to the modeled timer clock and formats it using the server time-zone offset; it is not the timer's time source.

Persisted running state retains an absolute timeline anchor. Restart recovery must prefer that anchor over a stale saved elapsed value so process downtime does not shift the competition. Clock-source disagreements are recorded in diagnostics rather than silently hidden.

### Independent modern timer coordinate (build 413)

Modern state additionally carries `timerClock: {version: 1, now, receivedAt, sentAt, startedAt}`. These values share one process-local monotonic coordinate. Its positive epoch-shaped origin is chosen once at server startup; it is NOT calendar time. A confirmed missing sleep interval advances this coordinate using the existing continuity policy, including while the competition is paused. Calendar-only adjustments never advance it. Existing top-level `now`, `startedAt`, `serverReceivedAt`, and `serverSentAt` retain their calendar meanings for older clients and Legacy.

`timerClockState` projects only modern consumers into the new coordinate, preserving wall values separately for TIME and scheduled-start labels. The clock estimator, rate confirmation, normal correction limits, audio warm-up, scheduling lookahead, Web Audio playback and user offsets are unchanged. Runtime commands identify their coordinate explicitly with `intendedTimerTime` and the existing `baseServerInstanceId`; older commands keep `intendedServerTime`. Audio-test commands likewise carry both `timerTime` and the compatible calendar `serverTime`.

A pure server calendar adjustment rebases the persisted/Legacy wall anchor without incrementing the competition version. Its SSE refresh therefore retains the modern sound schedule and already submitted Web Audio nodes. A still-pending calendar start is different: changing its wall-clock distance updates its monotonic target and state version. Once underway, calendar adjustments cannot change that run's target times. Pause, reset, seek, real suspension and server restart keep their existing authoritative semantics.

New server pages start with pending calibration, show `--:--` and “Synchronizing time”, and do not consume/play scheduled signals. SSE can supply state and lists but cannot unlock this gate. The first valid measured exchange for the current instance must have an RTT no greater than 500 ms; otherwise periodic synchronization retries. This bootstrap check does not alter ordinary established-clock or same-instance wake recovery. Calibration and current state are applied before sound restoration. Direct-file, Pages standalone and Android standalone do not await a server. An offline reload snapshot remains a provisional local reconstruction; first contact with a server requires measured calibration again.

Server snapshots keep schema 1: calendar save/start anchors, elapsed duration, running/paused/completed state and uptime evidence are retained. Raw process-local timer coordinates are neither persisted nor transplanted into a restarted process. Existing restoration reconstructs elapsed and a fresh monotonic anchor; `serverInstanceId` rejects late old-process packets. The pre-existing ambiguity of reboot plus changed/untrusted calendar time is not solved by this protocol. Browser snapshots retain their timer coordinate, protocol version and calendar presentation values with the calendar save time for the existing offline reconstruction path. Uncalibrated server state cannot overwrite a trusted browser checkpoint.

`test/visual/clock.spec.js` checks the actual modern page with SSE before HTTP and a wrong local clock, and verifies that server calendar steps in both directions preserve timer position, state version, signal scheduling and Web Audio node identity. Controlled-clock server tests also cover idle/paused clocks, scheduled starts, command coordinates and confirmed sleep. These tests supplement, not replace, real multi-device speaker measurements.

### State ordering is separate from time synchronization

`serverInstanceId` identifies a server process; `version` orders state changes within that process. A client accepts a new instance, resets instance-specific comparison/calibration state, and retires the previous ID for the lifetime of the page. Late HTTP, action, or SSE packets from a retired instance are ignored: they cannot roll the timer back to an old server, update its clock, or run success-side effects. Versions from different instances are not comparable.

An older state version from the current instance cannot overwrite newer competition state. Its valid HTTP timing interval may still contribute a clock sample, but a stale action response does not execute its normal success-side effects. Accepted current-instance state remains authoritative for operator commands, scheduled starts, phase changes, and completion.

### Three independent recovery paths

| Trigger | Clock model | State and transport | Audio |
| --- | --- | --- | --- |
| Ordinary network reconnection, with continuous browser clocks | Retain samples, accepted rate, and monotonic timeline; measure normally | Fetch current state; restart SSE only when absent, disconnected, closed, or silent beyond its watchdog | Do not erase a valid schedule solely because `online` fired |
| Ordinary tab hiding/return, with continuous clocks | Retain calibration and rate | Refresh state through the serialized recovery coordinator | Keep playing; visibility alone never clears a valid audio schedule |
| Actual freeze/pagehide/BFCache return | Retain calibration unless clock continuity fails | Resume through the existing recovery coordinator, even if still hidden | Cancel on suspension; rebuild after resume, with existing bounded boundary recovery |
| Browser-clock discontinuity or a request spanning a discontinuity | Clear samples and rate confirmation; retain the last monotonic timeline while calibration is pending | Require a fresh measured server response before trusting time again | Stop timed signals until calibration succeeds; then rebuild against verified time and current visibility |

`online`, focus, and visibility are not proof that browser clocks stopped. A disagreement of at least 100 ms invalidates calibration, including a short suspension: there is no three-second prerequisite. The comparison accepts either matching local wall/performance intervals or continuous performance-clock drift explained by the already accepted rate; a non-unit server rate must not invalidate two equal local intervals. This check runs before accepting a measurement or refreshing a trusted anchor. The measured request also validates both its send-to-headers interval and its headers-to-application interval, so a response spanning sleep, a wall-clock step, or delayed JSON processing across that discontinuity cannot become a clock sample.

Wall time is evidence of a discontinuity, not a replacement timer source. Two browser clocks alone cannot reliably distinguish sleep from a manual/NTP system-clock change, so there is no direct `Date.now()`-based correction of a running synchronized timer. A valid new measured response clears pending calibration and directly reanchors to the measured server estimate, preserving the held rate while fresh rate history is rebuilt. Ordinary measured corrections retain the 250 ms per-update limit; initialization, verified recalibration, and sufficiently large measured disagreement may apply a direct correction. The rate estimator still requires a long, stable sample window and repeated confirmation rather than responding to a single reconnect event.

If no server can verify time, the page continues extrapolating its last monotonic model but explicitly reports that accuracy is unverified; timed sound remains suspended. A standalone operator can press Stop and then Start for a new local run. This establishes a new local origin, not recovery of the old competition's elapsed time. Independent standalone runs cannot synchronize other browsers. An HTTP page that entered temporary standalone mode returns to authoritative server state when contact resumes; standalone changes are not uploaded. Direct file/single-file standalone pages have no server to return to.

The coordinator coalesces recovery events and serializes recovery with periodic synchronization. Ordinary network recovery does not abort a valid in-flight measurement. A confirmed discontinuity may cancel it and advance a request generation, preventing a late success or failure from affecting current recovery. SSE connections have their own generations. A bounded follow-up measurement can refine verified recovery without maintaining a separate competing clock loop.

### Presentation and diagnostics

The 100 ms rollback guard applies only to displayed seconds and rotations within an unchanged authoritative timeline. It does not change elapsed time, clock samples, audio scheduling, or operator commands; commands, a new server instance, and legitimate timeline changes reset the presentation context.

Pending calibration forces the modern SYNC badge red and exposes a tooltip and visible warning. The clock-error estimate includes measured latency/jitter plus any correction still unapplied because of the normal correction limit; a small RTT must not hide a large remaining offset. This is an estimate, not a guarantee about screen refresh, physical audio latency, or other devices. NET and SSE describe transport separately from clock validity.

Legacy deliberately retains its separate simplified wall-clock/XHR synchronization and has no audio. The modern monotonic-rate estimator, discontinuity gate, and recovery coordinator are not silently transplanted into it. Legacy generally offers lower timing accuracy and must be tested separately on the target old browser.

### Recovery regression coverage

Deterministic tests must vary event order as well as durations: a response before the wake event; sleep during a request or between headers and JSON application; delayed old-instance success/failure after a new instance; stale same-instance action responses; wall-clock steps in either direction; clock discontinuity while offline; calibration through timing-only responses; hidden-to-visible changes while forced recovery is in flight; and Final END/Classic phase signals when the queued follow-up fails. Continuous-clock network loss, focus, visibility, BFCache, standalone, and ordinary correction limits remain separate cases.

These controlled-clock and browser-transport tests do not establish every browser/OS sleep behavior or physical sound alignment. Before competition use, test actual target devices with network loss/reconnection, background/foreground, sleep/wake, server restart, and phase boundaries, including a missed follow-up request.

## Runtime modules

The author credit's native hover tooltip exposes `Email: dfedorov@gmail.com | Telegram: @fedorovdv` in both languages and generated standalone/Android HTML. Changing the tooltip does not alter the author link's two-step email activation. Native tooltips are verified through DOM attributes, not page screenshot pixels.

- `serve-bouldering-timer.js`: HTTP/HTTPS, API actions, SSE, client registry, ordering/pinning, per-display list selection/layout, snapshots, state versions, sound commands, diagnostics, and static files.
- `lib/timer-domain.js`: settings normalization, validation, scheduled clock-time calculations, and domain helpers.
- `lib/timer-transitions.js`: pure runtime transitions. It performs no I/O and does not mutate the previous state.
- `lib/client-action-transport.js`: browser command delivery, retry/timeout handling, base-version conflicts, and control-denial results.
- `lib/start-list-route-editor.js`: local route-count drafts and serialized/coalesced saves; also embedded in standalone/Android HTML and cached by the service worker.
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

Manual Final starts use the existing shared audio lead (`manualStartDisplayHold`) just like Classic starts. Both state application and local audio-schedule restoration must plan START on every eligible modern client, including one-shot Final. Preliminary Final countdowns remain excluded and still wait for the operator. The scheduled signal and the operator-only watchdog share the existing played-signal key, preventing duplicate START. Two-client browser regression tests cover repeat attempts, the complete ending, preliminary countdowns, Classic, and extreme per-client offsets. No clock estimator or state transition is changed by this hotfix.

Scheduled Classic and Festival starts automatically enter rotation 1 at the absolute target time. Final finishes its preliminary countdown in a waiting state and requires a separate Start. Stop followed by Start clears the scheduled-start label and immediately shows the correct rotation state.

Completed one-shot attempts render zero with the configured break background/text palette at the same display boundary, including local extrapolation before a server completion snapshot arrives. Modern uses `break-active` in its completion branch; Legacy selects break colors for `view.phase === "done"` without changing `view.isBreak` or list scheduling. Readiness, scheduled-start waiting, and repeating zero-break rotations retain their original colors. No extra render timers or geometry fitting are added. Completed route diamonds default to blue-purple `#48488c`; permanently stopped route crosses default to red.

## Start lists

The shared ES5 `FDVStartListDisplay.markerColors` normalizes the five `list_*_color` parameters (ready, active, done, paused, stopped) to six-digit HEX. Only #RGB/#RRGGBB is accepted; missing/invalid values independently fall back to defaults. Server config and generated offline config include the normalized palette. Modern applies separate `--list-*-color` variables only when different; Legacy uses a single validated stylesheet (including pseudo-elements) and skips unchanged palette keys, without CSS-variable/modern-API dependency. It changes marker fill colors only, not geometry, row highlights, controls or diagnostics; no new timers or fitting. Standalone/PWA/Android HTML embeds the same defaults/config during generation.

Up to four independent lists can be imported. They are informational and never drive timer duration. The server stores canonical sanitized data, incidents, exclusions, a revision that includes server-instance identity, and per-client display selections.

Modern clients retain the last complete payload for the matching revision. Unchanged state responses can omit large list arrays. Legacy requests send their known revision and receive full selected data only when data, server instance, or selection changes.

Route-count input is a local draft until native change (blur/Tab or spinner) or Enter. Clock synchronization must not assign even the same input value: that can reset native change tracking. Pending drafts survive snapshots; rapid committed values coalesce to the latest while one request is in flight. Acknowledgements cannot erase newer uncommitted input. Failed saves retain the draft with an explicit localized error and require retry. Replacing/deleting the participant list cancels its draft/queued save and ignores late acknowledgements. Reconciliation compares list identity only on canonical list changes, not timer ticks; no extra timers or geometry fitting are introduced.

The modern `startListRoutes` action carries `listIndex`, `routeCount` (integer 1–20), and `expectedStartListRevision`. It updates only that canonical list, retains other lists, and enforces primary-browser authority. A changed list revision returns 409 and fresh canonical state without applying the edit; the operator can confirm again. A no-op does not increment revision. Standalone uses the same editor with local sanitized list updates instead of network commands.

Each secondary display can select a different subset. With exactly two visible lists, it also stores a per-display stacked/parallel override. Turning the global Start lists switch off hides lists everywhere but preserves those selections.

Participant progression is derived from effective rotation order after exclusions and route incidents. A temporary route suspension has a start rotation and optional resume rotation; both planned boundaries must remain visible before either rotation occurs. Its persisted `blocksStartCycleWave` flag determines whether the whole concurrent wave is held from the suspension rotation, including participants who would otherwise start on upstream routes. The incident editor defaults this flag on when the selected start rotation moves into the future and off for a current or past rotation, but an explicit operator choice is authoritative. Missing flags in older saved state retain the pre-feature behavior. Editing incidents, seeking, and excluding/restoring rows must preserve unaffected list scroll positions.

Modern marker rendering, incident creation/previews, and Legacy marker rendering use shared ES5 `calculationIncidents` before evaluating attempts. It first rebases exclusions, then resolves whole-wave pause anchors chronologically against already resolved earlier incidents, with the current Classic/Final schedule. Thus an earlier suspension added later, changed, resumed, or removed cannot leave a later pause tied to a stale participant. Stored snapshots are not mutated: old saved anchors are corrected on read for calculation. Pauses without whole-wave hold keep their explicit participant anchors. An unresolved earlier pause without any schedulable participant retains the saved later anchor until the timeline becomes resolvable. Results are cached by incident contents, exclusions, participant count, and format parameters (at most eight entries); in-place edits invalidate the key. No new intervals, per-cell anchor searches, or geometry fitting are added.

Shared `stopSupersedingPause` identifies a same-route permanent stop with `stop.startCycle <= pause.startCycle`. Such a pause stays in saved data but is excluded from anchor resolution, attempt delays, future/current pause markers, active/editable pause lookup, pause-history highlighting, and upstream header states. The modern incident note explains that the pause does not apply. This also covers old zero-length stop-ended records saved by the previous editor at an equal start rotation. Removing the stop restores eligibility without deleting the pause. A stop strictly after the pause start preserves the existing suspension/stop-resolution behavior and accumulated delay. No extra render or geometry schedule is introduced.

The incident editor rewrites a pause as stop-ended only when the stop is strictly after its start. Sanitization uses the same strict boundary when inferring a stop resolution for an open-ended pause. A stop at or before the start therefore preserves the original `resumeCycle` and `resolution`, so cancellation restores a scheduled ending exactly (17 through 17 means resume 18), including after persistence/reload. Open-ended pauses stay open-ended. The existing cancellation behavior for a pause that already began before the stop is unchanged; old data whose ending was previously overwritten cannot reveal the original value.

Tables are read-only in screen mode, including after the primary browser enters its Screen view. Modern rendering separates structural rebuilds from dynamic cell updates and defers width fitting outside timer-critical display boundaries. Legacy builds stable tables and updates marker classes incrementally where possible.

Screens with visible lists retain a read-only rotation badge below the timer, including fullscreen and Legacy. Modern screens reuse the existing schedule chip and footer while progress/actions remain hidden. Legacy reserves a fixed 66-pixel footer for its badge only when lists are visible. Badge text/class updates reuse existing render boundaries; no new interval or recurring geometry fit is introduced. Optional server clocks and the badge occupy separate space. Without lists the original timer-only layout is preserved.

Disabled modern rotation inputs use textfield appearance to hide native number arrows in Firefox and Chromium/WebKit. Enabled primary inputs keep their native editing controls; the existing width reservation is retained. This is CSS only and introduces no timer or layout callbacks.

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

The server describes sound events; eligible remote modern browsers schedule playback against their synchronized timeline. Co-located modern clients on Windows, macOS and Linux can automatically delegate native PCM playback as described below. Primary and remote sound permissions are independent, and browsers on the primary computer are suppressed to prevent duplicate sound. User offsets are per client. Mobile autoplay rules require an explicit user gesture.

The ordinary mode keeps compact audio-clock progress and scheduler-health measurements. Extended performance diagnostics are opt-in and must not add continuous tracing to normal operation.

Audio schedule replacement evaluates actual page suspension when the response is applied, not when its request was sent. A merely hidden page schedules timed signals, including scheduled-start MINUTE/START, final warnings, phase transitions and authoritative state changes. A frozen/pagehidden or calibration-pending page does not. Timing-only calibration restores audio after authoritative state application. Returning from ordinary hiding does not force an audio reset based solely on elapsed hidden time.

Build423 samples scheduler health from the existing tick, at most once per second, and on audio-context/visibility lifecycle changes. Callback delay is elapsed performance time minus the nominal one-second health interval; a delay of at least3000ms rebuilds future plans while retaining submitted Web Audio nodes and their deduplication keys. Audio-clock progress is independently compared with performance time; a discrepancy over250ms replaces invalid audio targets. A suspended context's queued nodes are stopped before resume; one resume request may be pending, with rejected attempts limited to one per5s. A stopped/muted/frozen/uncalibrated client cannot be restarted by this recovery. Health recovery never seeks the timer, resets its clock/rate estimator, or reconstructs an elapsed minute warning. It requests current server state through the existing serialized coordinator. Natural node completion records a delayed start marker before discarding its JS timer, preserving deduplication when audio finishes while JS is delayed; cancelled nodes cannot report a late start.

Health checks detect a gap only when JS next runs. They cannot prevent OS suspension or guarantee delivery while a browser freezes the page. The existing buffer lookahead, audible signal lateness limits, user offsets, server clock, Secondary protocol and permissions remain unchanged. Build 425 adds the local Windows native route described below.

Ordinary hiding does not enter the mobile display-resume snap, which would block canonical phase planning while awaiting its display timeout. Actual pagehide/freeze, BFCache return and verified clock discontinuity retain their existing display recovery. Standalone iOS uses gesture-authorized HTML Audio: its intentionally idle Web Audio clock is excluded from audio-clock health decisions, while JS-gap checks still apply. Stop/mute clears a pending health rebuild so a later Start cannot inherit cancellation from the previous run.

Build 424 adds a short early prewarm 10s before the first countdown warning, minute warnings and a repeating scheduled start, retaining the close wakes. Short phases or late joins prepare immediately if their10s point is already past. Technical prewarm/warm have no age expiry while the run and phase remain valid; this avoids the former500/250ms expiry dropping both preparations under one-second hidden timer batching. Their callbacks and any pending resume completion validate the captured run anchor, generation, phase, running/calibrated/lifecycle state. Stopped, replaced and expired phases cannot be revived by a delayed technical wake. Competition signals keep their original targets and lateness limits. The existing no_sound_warm preference still mutes all quiet warm tones. No continuous keepalive, geometry loop or new polling interval is enabled.

## Windows 7/8 server packages

Windows 7/8 server packages are a separate build-time compatibility variant, not a timer-domain fork or a browser Legacy mode. `scripts/build-windows-legacy.js` bundles the same server for official Node12 with builtin-import normalization and scoped UUIDv4/Array.at shims. Static clients/audio/fonts are unchanged; no clock/audio math or normal Node24 path is changed. The CLR2/CLR4 GUI and no-PowerShell BAT avoid the old-OS launcher prerequisites. Runtime/OS EOL restricts these packages to trusted isolated LANs. See `docs/windows-legacy.md` for the checksummed build pipeline, limits and real-hardware checklist.

## Android client and standalone window

`MainActivity` offers a native server-address field and two explicit modes. It remembers the validated HTTP(S) server origin in private SharedPreferences; an omitted scheme defaults to HTTP. It rejects credentials, queries, fragments, non-web schemes and arbitrary page paths. `TimerActivity` is not exported; it revalidates its internal launch argument and loads either that origin or the existing bundled `file:///android_asset/timer.html`. The application ID/signing key remain unchanged. There is no Android-hosted server, native JavaScript bridge, duplicate clock or alternate sound scheduler. Network mode loads the server's unmodified modern page and uses its measured clocks, Web Audio, roles, diagnostics and Secondary server support; the embedded standalone page remains standalone. The legacy `android-standalone.apk` release filename is retained for asset compatibility, not as a statement that the app has only one mode. Older published APKs remain standalone-only until replaced by a new build.

The manifest permits INTERNET and explicitly allows cleartext so user-selected LAN HTTP origins work; HTTPS keeps normal certificate validation, with no SSL-error bypass or automatic downgrade. WebView cannot access arbitrary local files/content or navigate to non-web schemes in network mode. Initial main-document errors offer retry or explicit mode change; subresource errors do not replace the timer and there is no automatic launch of an independent standalone run. Normal API/SSE network outages remain entirely under the existing page recovery/Secondary server controller.

`FLAG_KEEP_SCREEN_ON` is set on the timer Activity, independent of HTTPS/browser Wake Lock. It prevents inactivity-based screen-off while the app is visible, not manual locking, app switching, force-stop, or power loss. There is no service, background audio claim, CPU wake lock, new JS interval or geometry loop. WebView onPause/onResume follows Activity visibility without reloading; onDestroy stops/releases it. Orientation/screen-size changes are handled without recreating the timer Activity, preserving the live page/AudioContext; Back requires confirmation before closing that client and returning to the launcher. Audio still requires the page's user gesture and server permission. The device should be powered during competition; physical WebView/audio/lock/rotation tests remain necessary. Both native screens have English/Russian resources.

Android 15+ enforces edge-to-edge for the current target SDK 35, so `TimerActivity` places the WebView in a full-size FrameLayout and applies visible `systemBars() | displayCutout()` insets as absolute container padding. The launcher uses the same policy on its ScrollView. Descendants receive the remaining inset rectangle, preventing duplicate system-bar reservation without dropping unrelated keyboard insets. Hidden bars add no fixed gap; gesture navigation uses its actual smaller bottom inset, and landscape bars/cutouts can reserve side space. Android 8–14 retain the original decor-fitted window with zero additional padding.

The listener runs only when Android dispatches window-inset changes. Identical padding is not written again; one initial `requestApplyInsets()` follows `setContentView`. There are no new JavaScript timers, polling, geometry-fitting loops, HTML/CSS changes, or AndroidX dependencies. `test/android-insets.test.js` compiles the actual activities/address validator against JVM API doubles and exercises old/new safe areas, navigation modes, repeated events, cutouts, keyboard insets, saved addresses, both launch modes, native screen-on, visibility lifecycle, Back confirmation, failed loads and TLS denial. This does not replace a real APK build or device/emulator visual check. The platform contracts are documented in [Android's edge-to-edge guide](https://developer.android.com/develop/ui/views/layout/edge-to-edge) and [native screen-on policy](https://developer.android.com/develop/background-work/background-tasks/awake/screen-on).

## Persistence

Server state is written atomically to `timer-state.json` through a temporary file. `lib/runtime-state-storage.js` chooses the location: portable packages keep `runtime-state/` beside the server; MSI, PKG, and DEB install `fdv-installed.marker` and select per-user state storage. Windows uses `%LOCALAPPDATA%/FDV Bouldering Timer/runtime-state`, macOS uses `~/Library/Application Support/FDV Bouldering Timer/runtime-state`, and Linux uses `${XDG_STATE_HOME:-~/.local/state}/fdv-bouldering-timer/runtime-state` (relative XDG paths are ignored). A one-time startup write probe also handles old unmarked installations: only `EACCES`, `EPERM`, or `EROFS` in the portable directory trigger fallback to the per-user directory. The selected directory is logged by the server and therefore visible in the launcher. No recurring directory probes are added.

If the selected snapshot does not exist, startup may restore the previous snapshot beside the application and then save it in the selected directory. The old file is retained. Once a new snapshot exists it takes precedence; invalid or expired new state must not fall back to an obsolete old file. Browser offline snapshots use compact change keys and a five-second safety checkpoint instead of serializing complete moving state on every render. Start-list data is revisioned and not embedded repeatedly when unchanged.

Schema changes require a version migration or explicit safe fallback. Integration tests cover active, paused, scheduled, Final, and restart recovery paths.

## Launcher networking

Desktop launchers start the server on the wildcard listener (`0.0.0.0`) so every active local interface can accept connections. They refresh parsed settings and displayed links whenever the server restarts, and refresh network links when the operating system reports an address change. Address discovery is local interface enumeration only: the macOS/Linux launcher must not initiate Bonjour browsing merely to trigger a Local Network permission prompt. Health probes are serialized and bounded so a stopped or changing server cannot accumulate connections.

The macOS PKG installs its payload at `/Applications/FDV Bouldering Timer`. Its component property list explicitly disables bundle relocation, preventing Installer from redirecting an upgrade to an older portable copy of `FDV Bouldering Timer.app` found elsewhere on disk. The release workflow expands every generated PKG and verifies that its relocation list is empty before publishing it.

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

## Limited controls and warning options (build 421)

`muteBreakWarnings` is shared timer state (default false), persisted and replicated through the existing snapshot/SSE/Secondary paths. From build422 the positive “Break sound / Звук в перерыве” checkbox is checked when `!muteBreakWarnings` (on by default), retaining the existing saved mute preference and API. Unchecking skips only break `warn` audio: all five visual flashes and boundary START remain. Changing it cancels future break warning nodes individually, including the usual imminent-node retention window; it neither changes the timer anchor nor force-stops other audio. Rotation warnings, ordinary minute warnings, audio warm-up and the scheduler timing/filter constants remain unchanged.

A pending scheduled start adds MINUTE at the canonical `serverStartedAt - 60000`, with the existing per-client audio offset, buffer/fallback, prewarm and minute lateness policy. Its distinct played key suppresses duplicates through state changes/recovery. Initial calibration and page visibility still gate scheduling. Final countdown-only uses the same path without adding a start sound or changing manual-start semantics. Cancel/retarget clears pending work; stale warnings are not replayed. No new polling/render loop is added.

`limitedControlClientIds` is a bounded, sanitized, persisted and replicated assignment list. Only the ordinary primary-authorized `clientControl` action changes it. Modern secondary browsers receive `limitedControl`; Legacy remains unavailable. Primary/standalone have their existing controls. Assigned browsers keep viewer/sound/list semantics and reveal only existing compact Start/Pause/Stop/Screen buttons. Screen is local; the four existing hotkeys work without changing input/modal guards or Ctrl+M/PIN takeover.

Server authorization whitelists only start/pause/reset/stopCountdown for delegates. It reconstructs settings, preset and elapsed from authoritative state, enforces manual Start and ignores payload attempts to seek/change settings or schedule. Existing command IDs, versions, clock-intended-time compensation, conflict handling and reverse RPC remain in use. Primary-only actions and PIN checks remain protected. Delegation or mute never changes clock math, rate fitting or timeline anchors. No additional geometry loop; CTRL uses CSS compact badges and the existing fit triggers. Tests: `limited-control.test.js`, extended `final-audio.test.js` and `visual/controls.spec.js`.

## Limited-control viewport correction (build 422)

Only viewer-mode + limited-control outside Screen uses a fixed dynamic viewport height: 100dvh with a 100vh fallback, min-height:0 on app/stage/stage-main, and a shrinkable timer row above the existing auto-sized action row. This removes the old viewer 100vh minimum extending behind mobile browser bars, including wide/unfolded devices whose document overflow is hidden by desktop media rules. The existing portrait list row stays between timer and buttons. Action padding reserves the safe-area bottom inset. No fixed positioning, JS viewport listener, periodic geometry fitting, clock or audio-policy changes. Existing ResizeObserver/resize fits the resized timer area.

Build422 only inverts the break checkbox presentation; timer state, persistence, replication and audio code are unchanged. New geometry tests simulate a 120px difference between large vh and dynamic visible viewport plus a 24px gesture inset, folding/unfolding/resizing with and without lists. These are Chromium emulations, not physical Fold8 hardware evidence.

The build422 background-audio investigation identified application-driven cancellation on visibilitychange, predating421. Build423 replaces that policy with background scheduling and scheduler/audio-clock health recovery described above. Samsung Internet unfolded/cover transitions receive no additional layout workaround, per the user's decision.

## Automatic local Windows audio (build 425)

### macOS/Linux extension (build436)

The same coordinator, deadlines, ten-millisecond anchor tolerance, per-browser
offsets, opt-out, handoff and watchdog now select a packaged helper on macOS
and Linux x64/ARM64. `native-audio/unix` compiles the existing C# PCM mixer with
Unix device/decoder/JSON adapters. No timer clock, Secondary protocol or browser
schedule has been forked. Windows keeps its existing PowerShell/NAudio path.

macOS uses AudioQueue/Core Audio; Linux uses ALSA's desktop `default` PCM.
Device progress, rather than an external media player's unmeasured buffer,
accounts for the three40ms output blocks. Stop flushes the device before its
acknowledgement. Profile preparation checks that the output clock advances
before offering the route. Device errors fail the route; browser fallback
retains the existing Stop acknowledgement / watchdog guard against duplication.

NLayer3.0.0 is an exact, hash-locked, managed MP3 dependency; WAV PCM/float and
mono/sample-rate conversion are decoded once outside the output callback.
Festival speech fallback uses installed macOS Samantha/Milena voices or Linux
espeak-ng/espeak. Missing speech/device prerequisites return the complete route
to the browser. Linux requires libasound.so.2 and a desktop user's audio session;
DEB declares the ALSA dependency and recommends espeak-ng. Self-contained
helpers require no system .NET installation. See native-audio/unix/README.md.

Release CI builds the helper with each Unix launcher and includes it under
lib/native-audio/{darwin|linux}-{x64|arm64}; packaging rejects missing helpers or
licenses. macOS CI ad-hoc signs the helper. The macOS preparation script also
restores its executable bit. Unix launcher headings/titles read the build from
the existing readiness response; health requests remain headers-only.

Device-free checks cover shared START/WARN PCM, duplicate suppression, quiet
priority, JSON conversion, selective cancellation, Stop, resampling and every
packaged WAV/MP3. Real Core Audio/ALSA/device/speech and hidden-tab operation
still require checks on the target OS; cross-compilation is not audio validation.

A direct socket address classified as a server-host interface or loopback permits native playback. Forwarded/proxy requests are rejected, and the registry role/Legacy gates remain authoritative. Same-origin requests and only explicitly paired Secondary origins are accepted. This recognizes direct LAN/loopback co-location, not arbitrary NAT/proxy topologies. A remote browser continues Web Audio. Native claims never enter persistence, exports or Secondary snapshots.

The browser first prepares a silent native reservation, stops its own submitted nodes, then activates a secret-token SSE lease. Only then can native cues start. One host output elects the primary eligible claim or the earliest local eligible claim; it retains that browser's saved offset and its unsaved audio-test correction. Test-everywhere uses one native output per host. Native cues use the same authoritative timer coordinate, offsets and lateness limits, without changing timer clocks, rates, rendering or network calibration.

The claimed coordinator runs every100ms and submits five seconds ahead. A persistent hidden PowerShell child compiles the C# PCM mixer and decodes selected WAV/MP3 assets once through pinned NAudio1.10.0 net35 (Ms-PL). WaveOutEvent mixes 44.1kHz stereo against QPC and the output playhead with120ms buffering (three40ms blocks; build426); startup primes silence before the browser relinquishes sound. Five minimum-RTT clock probes align Node performance time with QPC. Deadline projection uses the context's sampled performance instant, including a Secondary clock rate, so async preparation cannot move targets. Native Festival files or Windows speech fallback are preloaded.

Pause/Stop, seek/settings/offset/profile/run changes, authority fencing and owner changes cancel the obsolete generation. Sound checkboxes, break-warning mute and Festival announcements retain their existing meanings. Break/Festival selective cancellation can leave at most the already buffered120ms; full mute/lease release resets the device and ACKs only after cancellation. Natural Final completion preserves its submitted END. Async preparation revalidates the current state before starting any replacement. Past signals are never replayed on joining or recovery, except a newly issued manual START within its existing1500ms grace.

The SSE socket keeps a hidden/frozen browser's lease without JS heartbeats; pagehide explicitly releases it and socket close revokes it. Native input has an independent2200ms watchdog both in command processing and PCM reads; parent hang or pipe EOF silences output. Browser fallback releases the captured old endpoint and waits for cancellation before refreshing authoritative state and enabling future Web Audio. If release transport fails, closing the same-host TCP lease plus a2500ms fence covers the independent watchdog and hardware buffer. A restarted server has a different instance ID and no inherited claims. Ordinary page visibility alone does not revoke native sound.

Windows native output requires PowerShell3+ and .NET4+; missing prerequisites/output failures retain browser playback. Win7 may require these components; Node12 x86/x64 bundles still use the same scheduler. Build436 adds macOS/Linux native output described below. Direct standalone pages and Android keep browser audio. Server/OS suspension and physical device delay remain outside this mechanism. NAudio provenance, license and exact SHA256 are in lib/vendor; release verification checks the DLL pin and required native/client assets.

## Stable native audio anchor (build 427; 10ms tolerance from429)

While waiting for a calendar start, the server legitimately reprojects its wall target on every continuity sample. Date.now has integer-ms precision while performance.now has sub-ms precision; the raw projected anchor can therefore vary by less than1ms without a new run. The native coordinator previously treated every difference as a generation change, reset the PCM queue and repeatedly failed its async preparation guard. This could erase or cut the pending MINUTE; the old high-precision fake wall clock concealed it in integration tests.

The native coordinator retains its last accepted positive audio anchor for the same server instance while the raw anchor differs by at most10ms inclusive (requested in429;50ms in428, initially less than1ms in427). The retained value is not updated inside the tolerance, so drift cannot accumulate from consecutive samples. Stopping clears it; instance changes and anchor differences greater than10ms replace it. Stable audio context feeds signature checks, cue keys, async preparation and target planning consistently. Authoritative timer clocks/public projections, calendar targets, rate calibration, browser scheduler, offsets and native PCM output are untouched. This bounds audio projection tolerance to10ms inclusive and still follows real wall-clock/start changes.

Build429 also changes the browser technical warm/prewarm same-run guard from less than1ms to10ms inclusive. It compares against the captured preparation anchor and still requires the same calendar target, generation, phase and allowed lifecycle after any async resume. No clock-fitting/deadline arithmetic or audible-cue lateness windows change. Audit and validation: review/audio-tolerances-build429.md.

Windows launcher build display: the existing readiness GET /api/state supplies config.buildNumber to a separate muted header label and the window title. Restart clears stale values. Health probes remain headers-only; no extra polling or timer/audio changes. The same source builds modern and CLR2 launchers.

## Per-browser native audio opt-out (build431)

serverAudioDisabledClients is a persisted, replicated set keyed by the existing tab clientId. It is not pruned with the transient client registry. Absence means server audio allowed. serverAudioMode is a primary-only action; the native coordinator rechecks the preference before/after asynchronous preparation, at activation, owner election and reconciliation. browserAllowed remains independent: the client changes route availability, not sound permission, then waits for native Stop/release acknowledgement before browser fallback. The original offset map and all cue times remain unchanged. Active claims/reservations remain ephemeral. Missing old snapshot/SEC fields default to an empty set. New tabs have independent session IDs. The audio editor updates status/checkbox in place while preserving unsaved slider values.

## Speaker keep-awake (build432)

Shared persisted speakerKeepAwake defaults true. The speaker-keep-awake.js UMD planner uses timer-clock milliseconds to produce at most one short pulse after a configurable quiet interval; late callbacks never catch up in bursts. Known work/diagnostic spans defer it. Native output uses the elected browser route and a generated faded PCM asset; the mixer drops quiet cues/voices when work or diagnostic audio is active/imminent. Cancel flags remove quiet audio only, without changing native generation, anchor or work cue targets. Browser output uses a separate oscillator, never the work node list/dedup keys; buffer, HTML, synthetic, speech and gesture paths stop it and note busy spans. Global mute/route handover/page suspension stop it through the existing cancellation path. Standalone embeds planner/config and retains the switch in its snapshot. no_sound_warm still controls only the existing near-cue warmups. Technical periodic tones do not repair background JS suspension or guarantee speaker wakefulness. Previous diagnostic-vs-work overlap audit remains separate; this feature only gives priority over its own quiet pulses.

Build433 changes only the default speaker quiet interval to180 seconds, in params and the common server/browser fallback. Existing explicit params values still override the default. Tone duration, gain, frequency and priority guards are unchanged.

Build434 sound row uses an inline-size CSS container (300px full-label threshold (corrected in435)). Short captions are the safe fallback for clients without container queries. updateSoundLabel sets RU/EN full/short spans, full title and checkbox accessible name on role/language updates. A non-primary row gives the main label full width and the standard35px right slot; a primary uses a20px slot with10px caption gap. Audio and clock logic are unchanged.
