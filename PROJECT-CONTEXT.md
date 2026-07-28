# FDV Bouldering Timer: project context

This file is a handoff document for a new AI/chat or a new developer session. Read it before changing the project. It describes the stable architecture, the release workflow, critical timing and audio invariants, and the repository state as of 2026-07-27.

## Quick orientation

- Project: network-synchronized timer for bouldering competitions.
- Repository: `https://github.com/dfedorov-arch/fdv-bouldering-timer`.
- Current public release: `v1.2.0`.
- Current application build on `develop`: `303`.
- Runtime: plain Node.js server plus a browser client implemented mainly in `index.html`.
- UI languages: Russian and English.
- Most important quality goals: identical time on all displays, deterministic phase transitions, stable and accurately timed sound, recovery after temporary network loss or device sleep.
- Current working branch for new development: `develop`.
- Do not start by rewriting the timer or audio architecture. First inspect the current code, tests, `git status`, and the relevant history.

## Local worktrees

The project normally uses two Git worktrees on the author's Windows computer:

- `E:\Documents_Win10\ФСМ\FDV-Bouldering-timer\VSCODE\fdv-bouldering-timer-develop` - branch `develop`, used for active development.
- `E:\Documents_Win10\ФСМ\FDV-Bouldering-timer\VSCODE\fdv-bouldering-timer` - branch `main`, used for GitHub Pages and releases.

Two branches can share Git history while exposing different versions of files because each worktree has its own directory. Always confirm the active branch and worktree before editing.

At the time of this snapshot:

- `develop` points to `99d2694` (`Add multi-list start protocol tracking`).
- `main` points to `742f31b` (`Publish standalone timer build 245`).
- `v1.2.0` points to the released `main` state.
- `main` may contain local untracked repair experiments named `clean-server*.js` and `fix-server*.js`. They are not part of the product and must not be committed unless the user explicitly requests it.
- `.continue/`, `.mimocode/`, `runtime-state/`, and generated `dist/` content are ignored by Git.

Always run `git status --short` before editing. Never discard unrelated local changes.

## Product modes

### Competition formats

1. Classic
   - Repeating rotation and break segments.
   - Default in `params.txt`: 5-minute rotation and 15-second break.
   - If break is zero, the next rotation starts immediately and no separate END signal is used.

2. Festival
   - Long round plus a break measured in minutes.
   - Default: 120-minute round and 30-minute break.
   - Optional announcements at 60, 30, 10, and 5 minutes remaining.
   - If a recorded festival announcement is missing, speech synthesis is attempted; if the required voice/language is unavailable, the minute sound is used as fallback.
   - A zero break follows the same immediate-next-round rule as Classic.

3. Final
   - One-shot rotation with no timer break; each attempt stops and waits for the next manual Start.
   - Default rotation: 4 minutes.
   - When a start protocol is used, `Old` completes every participant on route 1 before route 2; `New` inserts a configurable number of complete rest rotations (default 3) before the participant's next route. Thus a route-1 attempt in cycle 1 is ready for route 2 in cycle 4 and active there in cycle 5.
- Rotation time, Final schedule choice, and Final rest-rotation count remain editable during a scheduled-start countdown, then stay disabled throughout the actually started multi-attempt Final round. Stopping the countdown returns to the beginning of cycle 1 without advancing `startListFinalCycle`. Stopping the first actual attempt leaves the fields locked because that is the end of cycle 1, not its beginning. Manually seeking back to cycle 1 resets `startListFinalCycle` to zero and unlocks the fields and competition-format buttons without a confirmation-based reset action.
   - Localized labels, accessibility names, and tooltips receive an unconditional initial language pass. Do not rely on a server language change to initialize attributes that are absent from the static Russian markup.
   - The timer stops after the single sequence instead of cycling.
   - A transition signal is still required exactly at the end of the final rotation/sequence.
   - Scheduled start fields can run a countdown, but after that countdown the competition rotation waits for a separate manual Start.

### Browser roles

- With no primary browser selected, each browser shows the full UI and the global sound setting applies.
- When one browser is marked primary, it controls the timer. Other browsers become timer-only displays.
- Secondary browsers do not process normal keyboard controls. `Ctrl+M` (Russian layout: `Ctrl+Ь`) remains available to claim/recover the primary role.
- Optional settings can enable sound and fullscreen on other browsers.
- Browsers on the same physical computer as the primary browser are detected by connection address. Loopback (`127.0.0.1`) and the server computer's LAN address are treated as the same computer; only the primary browser should make sound there to prevent duplicates.
- Diagnostic role values crossing the network are language-neutral keys (`primary`, `screen`). Translation happens in the client.

### Start protocols and participant progress

Build 280 introduced optional start-protocol panels for Classic and Final; build 281 separates a normal route-pause resume from ending that pause by permanently stopping the route. Start protocols are informational and do not control or change timer timing.

- The `Start protocol` checkbox is off by default and is shown immediately after the primary-browser checkbox. It opens or hides the protocol area on the primary browser.
- Up to four independent protocols can be loaded. With exactly two protocols, a gray arrow on the second panel switches between vertical stacking and two parallel columns. Adding a third list removes that switch and uses the fixed two-column layout: lists 1–2 on the left and 3–4 on the right.
- Each list has its own compact controls: add another list, optional two-list layout switch, load/replace that numbered protocol, route count, and delete. Empty editors retain enough width for the upload label.
- Accepted imports are XLSX, CSV, TSV, TXT, and MXL. The browser file input lists only these explicit extensions; do not add MIME wildcards such as `application/octet-stream`, because Windows expands them into unrelated executable extensions and duplicates entries in the file picker. XLSX uses the first non-empty worksheet and is read by the vendored SheetJS CE 0.20.3 mini build. The reader is loaded only when an XLSX file is selected and is embedded into generated single-file standalone builds. A single-cell text row immediately above a multi-column heading row is treated as an optional protocol title and rendered across the whole table; otherwise the first row contains arbitrary column headings. The number and names of participant-data columns are not fixed. Columns that are blank in both the heading and every participant row are discarded, because XLSX used-range metadata can otherwise produce phantom `Column N` fields.
- If no imported column can unambiguously represent consecutive timer cycles, a generated first column named `#` is added. This cycle index, not a possibly sparse start-number column, drives participant progression.
- Route count is configured separately per list. Sanitization limits imported source data to 20 columns, 500 participant rows, 160 characters per cell, 20 routes, and 100 incident records; the generated `#` column can make 21 stored columns.
- Markers are: yellow triangle = preparing, green circle = climbing, red diamond = completed, gray pause symbol = the participant's affected attempt is suspended, and red cross = the route is permanently stopped for that attempt.
- Active and preparing rows receive subtle green/yellow highlighting. Protocol markers never use the timer's flashing effect.
- The protocol panel occupies the full screen height beside the timer. Timer progress and phase chips stay under the timer, not under the protocol.
- Width fitting expands the protocol area as needed before allowing horizontal scrolling and accounts for the browser's measured vertical-scrollbar width. Both tables and toolbars are measured at their intrinsic `max-content` width; measuring a toolbar's ordinary `scrollWidth` after its column has been widened creates a positive feedback loop that grows the panel on every cycle. Vertically stacked tables with the same number of columns synchronize every corresponding column to the widest natural value across the stack, keeping route columns aligned and preventing a shorter table from leaving a distracting unused strip on the right. Protocol tables otherwise retain their intrinsic width instead of stretching to fill a wider toolbar/panel. Do not replace the scrollbar measurement with a fixed platform-specific allowance.
- On portrait phone viewports (up to 560 CSS px), the timer is stacked above the protocol area instead of being narrowed beside it. Its row is deliberately compact (`clamp(150px, 26dvh, 190px)`) with a small responsive inset above and below the digits, leaving more height for protocols without crowding the timer. All protocol columns are stacked vertically at full viewport width. Each table viewport is capped to the span from its first to last active/ready row plus four surrounding rows (at least five rows total), while the existing automatic anchor keeps the completed/near-active context visible.
- Upload controls use a filled cyan background. Protocol buttons brighten their outline on hover. Route-incident actions are compact icon buttons (pause bars, resume triangle, stop square) with localized `title` and `aria-label` text.
- The protocol toolbar contains add, optional layout switch, upload, route count, and remove controls; it does not repeat the current cycle because the timer cycle chip is authoritative. The optional protocol title is above the incident menu, and the menu is directly above the table column headings. In the route-incident menu, the incident cycle field is grouped at the right with the pause/resume and stop actions and has a context-specific tooltip. The selected route button keeps a yellow outline while its menu is open. Clicking it again closes the menu; a short same-button click guard prevents a physical double-click from immediately reversing the first click.
- Countdown, warning, and break backgrounds are confined to `.timer-column`. The control panel keeps its neutral opaque background and must not inherit or show the timer phase color.
- During normal cycle-based operation the schedule row contains only the centered cycle chip. Its outline is green during rotation, yellow during break, and cyan while the stopped/paused cycle selector is editable; its tooltip names the active phase. The existing single preview/countdown chip remains unchanged when there is no cycle yet.

Each secondary browser can show a different subset of protocols. When start protocols are enabled, the primary browser's diagnostics show `PROTOCOL 1` through `PROTOCOL 4` chips for every secondary browser. A chip is unavailable/gray when its list is absent, cyan when available, and gains an orange outline when selected. Per-client selections are stored server-side in `startListDisplaySelections`; API responses expose only that client's language-neutral `startListIndexes` and derived `startListVisible`. The primary browser does not need a selection and can manage all lists. Empty protocol editors default to 4 routes in Final and 5 routes in Classic.

The primary `Start protocol` checkbox is synchronized through the server as `startListEnabled`. Turning it off suppresses protocols on every secondary screen while preserving each screen's `startListDisplaySelections`; turning it back on restores those selections. This prevents a locally unchecked editor from leaving a protocol visible on a phone or TV after a reload or server restart.

Cycle behavior:

- Classic derives the displayed cycle from the authoritative repeating rotation/break timeline.
- Final also exposes a cycle chip. A completed Final rotation advances `startListFinalCycle`; pressing Stop in Final completes the current attempt instead of rolling participant markers backward.
- While the timer is stopped or paused, the cycle chip is an editable numeric field with stepper arrows. Seeking changes participant progression without discarding incident history.
- A scheduled countdown is not a competition rotation. Loading a list initially shows participant 1 preparing; scheduling a later start clears that marker until the remaining countdown reaches one rotation duration.
- Starting a genuinely new round/reset clears all route incidents and their pause/cross markers. Seeking backward within the same round does not clear incidents.

Protocol auto-scroll keeps the first relevant unfinished participant near the top, with one fully completed row above when possible. If everyone is completed it anchors to the last row; paused participants remain valid anchors. Auto-positioning is reconsidered on every cycle/phase change, even when the numeric anchor is unchanged. Ordinary renders, incident actions, layout rebuilds, rapid consecutive SSE updates, parallel lists, and the same list on another screen must preserve each scroll container's vertical and horizontal position. Scroll coordinates are also saved in the current tab's `sessionStorage` and restored after a primary-browser reload only when the stored protocol identity still matches, so replacing a list never applies stale coordinates. This is operationally important because a remote display may be a television with no convenient input device.

On the first opening of the protocol panel after a page reload, the current cycle anchor is applied repeatedly for a few animation frames while the panel width and height settle. This prevents an initially unconstrained hidden table from clamping `scrollTop` to zero. Opening the panel intentionally chooses the current automatic anchor rather than restoring a stale hidden-panel position.

Route incident handling is per list and never affects another protocol:

1. Temporary pause
   - The operator opens a route-number button and records the cycle at which the incident starts.
   - The interrupted participant immediately gets one gray pause marker on the affected route.
   - From the following cycle, that route and all lower-numbered routes wait; higher routes continue normally.
   - On the resume cycle only the interrupted participant finishes the affected attempt. From the next cycle, all other delayed attempts continue, and their preparation markers appear appropriately.
   - Multiple pause intervals on one route are retained as separate history rows, each with its own delete control.
   - A pause stores whether it ended by normal resumption or by permanent route stop. A stop releases the delayed wave in that cycle without assigning a resumed climbing attempt to the injured participant; canceling that stop reopens the pause.
   - Active affected route headers are strongly yellow. Recorded history remains visible as a yellow outline, including when seeking before/after the interval. Tooltips and the incident menu show start/end cycles.

2. Permanent stop
   - The operator records the route and stop cycle.
   - Participant movement on other routes is unchanged. Attempts on the stopped route at or after that cycle display a red cross.
   - The active stopped route header is strongly red; its recorded state remains outlined when viewing an earlier cycle.
   - The menu and tooltip show the stop cycle. Removing the stop is explicit and does not remove unrelated pause history.

Incident actions require primary/standalone controls. Incident records are sanitized with each list, persisted in server/offline state, and removed only by their explicit delete/cancel action or by starting/resetting a new round.

### Legacy display

`legacy.html` is a deliberately simplified display for old or weak browsers/TVs. It has a much smaller rendering and JavaScript surface and may perform better on low-powered devices. Keep its favicon and fallback behavior intact.

### Standalone and offline operation

There are several related but distinct modes:

- Normal server mode: opened over HTTP/HTTPS and synchronized with Node.js.
- Offline continuation: a server-connected browser temporarily loses the server and extrapolates the last trusted state locally, then reconciles on reconnect.
- Local file mode: `index.html` opened with `file://`; supporting relative files are required.
- Single-file standalone: generated HTML containing scripts, configuration, fonts, and audio. It needs no Node.js and works as a single-browser timer on Windows, macOS, Linux, Android, and iOS subject to browser file restrictions.
- GitHub Pages standalone: `https://dfedorov-arch.github.io/fdv-bouldering-timer/standalone.html`.

Standalone state is persisted in browser storage so a reload can restore settings and a running timer. It does not synchronize multiple browsers.

## Architecture and ownership

### Server: `serve-bouldering-timer.js`

The Node.js server is the authoritative source of competition state and time in network mode. It owns:

- HTTP and optional HTTPS listeners;
- static files and sound profile discovery;
- `/api/state`, `/api/action`, `/api/events`, and `/api/diagnostics/events`;
- authoritative running/paused/completed state;
- primary-browser ownership and PIN protection;
- connected-client registration and diagnostics;
- SSE broadcasts;
- command deduplication and state-version conflict handling;
- server snapshots and restart restoration;
- authoritative `startLists`, per-client `startListDisplaySelections`, and `startListFinalCycle` state;
- generation of `lib/offline-audio.js`.

The server uses both wall time and monotonic time. `startedAt` is a portable wall-clock timestamp sent to browsers, while server-side elapsed time is protected by `performance.now()` through `timerStartedAtMono`.

### Domain module: `lib/timer-domain.js`

Pure validation and normalization of settings, bounded values, optional scheduled clock fields, and scheduled start calculations. Keep it free of I/O.

### State transitions: `lib/timer-transitions.js`

Pure runtime transitions for start, pause, reset, seek, scheduled countdown, completion, and settings behavior. A command produces a complete next state and explicit clock effects without mutating the old state.

### Client transport: `lib/client-action-transport.js`

Owns browser-to-server command delivery:

- unique command IDs;
- base state version;
- retries for network failures;
- one controlled retry after a version conflict;
- explicit rejection results when control is denied.

Do not reproduce this logic ad hoc in UI handlers.

### Start-list domain: `lib/start-list.js`

Pure start-protocol parsing, sanitization, route-attempt calculation, incident application, marker/row status, and scroll-anchor selection. It supports browser globals and CommonJS so the same rules are used by the client, server, standalone build, and Node tests. Keep route/cycle mathematics here instead of duplicating it in rendering or server handlers.

### Browser application: `index.html`

This is intentionally a large self-contained browser application. It owns:

- interface and translations;
- local draft settings;
- server clock estimation;
- rendering and responsive timer fitting;
- audio loading, unlocking, prewarming, and scheduling;
- fullscreen and mobile gestures;
- offline/standalone continuation;
- connected-browser diagnostics;
- start-protocol import, management, incident UI, per-screen selection, responsive sizing, and scroll preservation.

### Persistence

- Server snapshot: `runtime-state/timer-state.json`.
- Written atomically through a temporary file.
- Recent state can be restored after restarting the server.
- Browser offline snapshot is stored in local browser storage.
- Start protocols, per-list route counts/incidents, Final list cycle, and per-client display selections are part of the relevant server/offline state. There is intentionally no obsolete single-`startList` compatibility field.
- Snapshot schema changes require an explicit schema-version decision and tests.

## Time synchronization

This area is safety-critical.

### Source of truth

In network mode, the server is authoritative. Browsers do not decrement an independent counter as their primary model. They receive state plus server timestamps and continuously derive the current phase and remaining time from an estimated server clock.

### Browser server clock

The browser maintains a mapping from `performance.now()` to server time. Synchronization samples account for request round-trip time and reject unstable/outlier measurements. The implementation can estimate a stable clock rate, which matters on weak virtual machines where the local monotonic clock can run at a slightly different effective rate.

`Date.now()` is not the normal live timer clock. It is a recovery reference. The client compares wall-clock and monotonic-clock progress to detect device suspension or a stalled `performance.now()`. On wake it can re-anchor the monotonic mapping while preserving the accepted clock-rate estimate. When the server is reachable, fresh server samples remain authoritative.

### Rendering

- Digits are derived from synchronized server time.
- Rendering is scheduled near exact displayed-second boundaries rather than through a permanent 60 FPS loop.
- A watchdog/freshness path handles throttled, lost, or severely delayed callbacks.
- DOM text and schedule markup are only rewritten when their values change.
- Progress animation is lower frequency and compositor-friendly.
- Rendering performance must never become the source of timer or audio time.

### Network delivery

- SSE provides immediate state and diagnostics events.
- Periodic state/synchronization requests correct drift and recover missed events.
- Commands carry state versions and IDs, so retries do not apply a command twice.
- After a server restart, a changed server instance ID allows clients to accept the new version sequence and reconcile.

### Sleep and background tabs

Mobile browsers can suspend timers, `performance.now()`, audio contexts, and network connections. On `visibilitychange`, `pageshow`, focus, and continuity checks, the client must:

1. avoid rendering from a stale clock while a wake correction is pending;
2. compare wall and monotonic elapsed time;
3. repair/re-anchor the local clock if required;
4. request fresh server state when possible;
5. restore display scheduling and audio readiness.

Do not solve sleep recovery by switching the entire running timer to `Date.now()`.

## Audio architecture

Audio timing is as important as visual timing.

### Sound profiles

Each subdirectory of `beeps/` is a profile. Supported files are WAV or MP3 with conventional names:

- `START.wav` or `START.mp3` - start of a rotation/round;
- `END.*` - end/transition sound; if absent, START is reused;
- `MINUTE.*` - one-minute warning and fallback for unavailable festival speech;
- `WARNING.*` - each of the last five seconds;
- optional `FESTIVAL_60.*`, `FESTIVAL_30.*`, `FESTIVAL_10.*`, `FESTIVAL_5.*`.

Current included profiles:

- `FSR_2026` (default);
- `Boulder_JAPAN_CUP_2025`;
- `IFSC_INNSBRUCK_2025`;
- `IFSC_PRAGUE_2025`.

The profile selected in `params.txt` appears first in the UI; the rest are sorted alphabetically.

### Scheduling rules

- A manual first Start intentionally reacts directly to the user gesture, with a small server-provided lead/hold so remote displays can align without delaying the local sense of response.
- Signals during an already running timer are scheduled against absolute estimated server time.
- Phase transitions and the last-five sequence are not triggered by observing a changed DOM digit.
- Long silent periods use audio-context activation and prewarming before minute/last-five signals.
- iOS standalone mode keeps a gesture-authorized HTML audio element available because Web Audio contexts may suspend differently from Android/desktop browsers.
- Pending signal timers are cleared carefully; do not clear a transition source while it is starting or playing.
- A late signal outside its grace window is dropped rather than played in the wrong phase.

### Per-browser audio correction

The `AUDIO` diagnostic chip opens a `-500..+500 ms` user offset slider. The correction is specific to a browser/client and survives reconnects during the current server run. Negative means schedule earlier; positive means later. It is a user calibration, not automatic trust in `baseLatency`/`outputLatency`.

Audio latency reported by browser APIs is diagnostic only. It must not automatically alter scheduling.

## Diagnostics

The primary control panel lists connected browsers in stable order. When no primary is selected, the current browser is shown first. Compact chips include network, synchronization, audio, wake-lock, SSE, visibility, and Legacy status.

Important interpretations:

- `NET`: round-trip/network quality. Current warning/red thresholds are 100/200 ms.
- `SYNC`: estimated synchronization error. Current warning/red thresholds are 100/300 ms.
- `AUDIO`: whether sound is allowed/unlocked and any user-entered correction.
- `WAKE`: Wake Lock support and active state.
- `SSE`: real-time event channel support/connection.
- `TAB`: page visibility.
- Clock-offset detail is informational and shown in a tooltip; a large stable wall-clock offset does not by itself mean the timer differs.

Statuses and roles sent through APIs should be stable keys, not localized Russian/English text. Build 245 introduced `diagnosticRoleLabel()` and `diagnosticStatusLabel()` for client-side translation. Backward aliases exist for older textual values.

## Controls and interaction

Default keyboard controls:

- `Z` / Russian `Я`: Start or resume.
- `P` / Russian `З`: Stop/reset.
- `Ctrl+Q` / Russian `Ctrl+Й`: Pause.
- `Ctrl+F` / Russian `Ctrl+А`: screen/fullscreen mode.
- `Ctrl+M` / Russian `Ctrl+Ь`: toggle/claim primary browser.

Service keys are intentionally intercepted even when an input has focus. The scheduled-countdown Start/Stop control is separate and must not be triggered by `Z`.

On mobile, double-tapping the timer area enters/exits screen mode. The implementation first tries the Fullscreen API, then falls back to CSS screen mode. Button and gesture paths should share the same mechanism. A subtle exit control remains available on mobile fullscreen.

## Configuration: `params.txt`

Startup parameters include:

- HTTP/HTTPS ports;
- portable Node.js paths for Windows, macOS, and Linux;
- default language;
- Classic/Festival/Final durations;
- initial checkbox states;
- sound profile;
- timer font;
- countdown, rotation, last-five, and break colors.

New server-mode defaults belong in `params.txt`, server parsing/default config, startup payload, offline bundle generation, documentation, and tests as appropriate. Relative paths are preferred so a copied project does not depend on the original machine's directory structure.

## Build numbers

Application build numbers are independent from semantic release versions. A build change must stay synchronized in:

- `index.html`: `pageBuildNumber`;
- `serve-bouldering-timer.js`: `BUILD_NUMBER`;
- `sw.js`: `BUILD_NUMBER`;
- generated `lib/offline-audio.js`: `config.buildNumber`.

Run `node scripts/verify-release-inputs.js` to catch mismatches. Service Worker cache names include the build number, so forgetting `sw.js` can leave old assets cached.

## Standalone generation

Do not edit generated standalone HTML manually.

Generate the local artifact:

```bash
node serve-bouldering-timer.js --generate-offline-audio
node scripts/build-standalone-html.js dist/fdv-bouldering-timer-local-standalone.html
```

`scripts/build-standalone-html.js` embeds:

- `index.html`;
- `lib/offline-audio.js`;
- `lib/client-action-transport.js`;
- `lib/start-list.js`;
- selected font data;
- the PWA manifest and icon.

The publicly hosted file is `docs/standalone.html` on `main`. After merging `develop` into `main`, regenerate it explicitly:

```bash
node serve-bouldering-timer.js --generate-offline-audio
node scripts/build-standalone-html.js docs/standalone.html
```

GitHub Pages publishes `docs/`, `help.html`, and `help-assets/` through `.github/workflows/pages.yml`.

## Testing

Core commands:

```bash
node --check serve-bouldering-timer.js
node serve-bouldering-timer.js --generate-offline-audio
node scripts/verify-release-inputs.js
node --test test/*.test.js
```

Test files cover:

- client command conflicts and retries;
- flashing synchronization;
- release preflight behavior;
- render scheduling, mobile recovery, iOS audio, and diagnostics;
- full server integration and restart behavior;
- settings/domain validation;
- clock-rate and timeline logic;
- pure timer transitions;
- XLSX/CSV/TSV/TXT/MXL start-protocol parsing and sanitization;
- participant/route marker progression, multiple protocols, Final-cycle behavior, temporary pauses, permanent stops, per-client list selection, and scroll-preservation render contracts.

On Windows PowerShell, glob behavior and subprocess status can make `release-build-preflight.test.js` behave differently from Ubuntu. The GitHub Actions Ubuntu run is the release gate. Do not dismiss failures in timer, transport, rendering, audio, synchronization, or server integration tests.

For timing/audio changes, automated tests are necessary but not sufficient. Also smoke-test:

- one primary plus at least one remote browser;
- long rotation before minute and last-five signals;
- zero and nonzero breaks;
- pause/seek/resume without accidental start sound;
- phone sleep/wake with and without network;
- iOS standalone repeated Start/Stop/Start;
- a weak VM/old browser and Legacy comparison;
- Russian/English switching while Ready, Running, and Paused;
- one to four start protocols with different route counts;
- different PROTOCOL selections on several remote displays;
- incident pause/resume, permanent stop/cancel, backward/forward cycle seeking, and new-round cleanup;
- vertical/horizontal scroll preservation after incident actions on every display, including a no-input TV;
- auto-scroll when active/preparing participants exist, when remaining participants are paused, and after everyone has completed.

## Release workflow

Normal flow:

1. Work and test in `develop`.
2. Commit and push `develop`.
3. Merge `develop` into `main` without discarding main-only Pages history/files.
4. Regenerate and commit `docs/standalone.html` in `main`.
5. Push `main` and verify Pages.
6. Create and push an annotated semantic tag such as `v1.2.0` on the intended `main` commit.
7. `.github/workflows/release.yml` runs tests, builds Windows/macOS/Linux launchers, packages portable Node.js 24.17.0, creates the standalone asset, computes `SHA256SUMS.txt`, and publishes the GitHub Release.
8. Wait for the workflow and verify every release asset.

Expected release assets:

- Windows x64 ZIP;
- macOS ARM64 and x64 archives;
- Linux ARM64 and x64 archives;
- single-file standalone HTML;
- `SHA256SUMS.txt`.

Never create a public release from an incomplete local `--without-launchers` package.

## Important invariants for future changes

1. Server state/time remains authoritative in network mode.
2. Browser digits and scheduled audio derive from the same estimated server clock.
3. Audio must not depend on observing DOM changes.
4. Rendering optimization must not reduce timing or sound precision.
5. Parameters edited while a timer runs are drafts and apply only after reset/restart as designed.
6. A seek while paused must not replay a phase-start signal.
7. Reset must not make a sound.
8. The first manual Start must produce a complete start sound on every allowed output.
9. Transition sounds must remain complete and precisely aligned, including Final completion and zero-break immediate rotations.
10. Secondary browsers must not accept normal keyboard control.
11. Old/weak devices must retain Legacy and offline-continuation paths.
12. All visible strings and tooltips need Russian and English variants where applicable.
13. Network/API values should be language-neutral; translation belongs in the UI.
14. Do not commit certificates, `runtime-state`, `.continue/`, `.mimocode/`, generated `dist/`, or unrelated repair experiments.
15. Start protocols are display-only and must never alter timer state, phase timing, or audio scheduling.
16. A protocol's incidents affect only that protocol; do not share pause/stop calculations between lists.
17. Scheduled countdown, paused/stopped seeking, and a genuinely new round have distinct semantics: countdown is not a rotation, seeking preserves incidents, and a new round clears them.
18. Remote protocol screens must retain usable scroll position across unrelated state updates and redraws; cycle/phase changes must still perform intentional auto-positioning even when no participant is currently active.

## User priorities and collaboration notes

- The user tests carefully on Windows, macOS, Android, iOS, Bluetooth and speaker outputs, weak virtual machines, and multiple browsers.
- Small audio offsets and one-second visual discrepancies are considered important defects.
- Preserve working timing/audio behavior unless a change is clearly justified and tested.
- Before a risky timing/audio change, explain the mechanism and proposed plan.
- Keep the control panel compact, especially on phones, while keeping controls usable.
- Avoid adding diagnostic chips or visible complexity unless the information is operationally useful.
- Prefer conservative changes that fit existing modules and tests.
- When a release or GitHub update is requested, verify the remote result instead of stopping after a local command succeeds.

## First steps in a new chat

After loading this file, a new assistant should still perform a short freshness check:

```bash
git status --short
git branch -vv
git log --oneline -5
node scripts/verify-release-inputs.js
```

Then inspect only the files related to the requested change. This document is a map, not a substitute for checking the current code and newer commits.
