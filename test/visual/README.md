# Visual regression tests

Build 424 adds a hidden real-Web-Audio case checking the 10-second early target, a technical warm delayed over 500 ms by a real JS busy interval, unchanged canonical anchor/audible grace and paused-client suppression. Node tests use actual production scheduling/wake functions with one-second callback batching, long delays, positive/negative offsets, run/phase/lifecycle/calibration changes, async resume races and sub-ms projection of the same calendar start. No layout or continuous keepalive change is included.

Validation424: clock/controls/Secondary25/25 in one run; after the final sub-ms calendar-start predicate adjustment, the affected hidden prewarm and scheduled Classic/Final MINUTE cases3/3. Node440 total,436 pass,4 expected opt-in skips; Unix-only release preflight/macOS launcher tests excluded on Windows as before. Full78 visual cases were not rerun.

Build423 adds desktop/mobile real Chromium Web Audio checks with deterministic hidden visibility, a real4.4s JS busy interval, measured audio-clock-dependent preservation/replacement, canonical next-start planning, and remote Pause/Stop while hidden. Another scenario suspends/resumes the real AudioContext and dispatches freeze/resume lifecycle events. Hidden Classic/Final scheduled-start MINUTE cases retain their canonical anchor and deduplicate the cue. These are controlled browser checks, not claims about physical device sleep or every browser's background policy. Node tests independently control JS/audio progress, resume rejection/pending Stop, future-only recovery, warning/end deduplication, iOS HTML independence and unchanged clock recovery. Final clock/controls/Secondary:24/24; earlier full76:74 passed, with the two old language/LAN tests corrected to measure after actual audio-device startup and passing in the final24. All53 layout cases passed in that full run; current77 was not rerun as one final command.

The suite starts an isolated timer server, launches the pinned Playwright Chromium build, and verifies layout and interaction behavior. It never uses the production server or changes its runtime state.

## Setup and commands

```powershell
npm install
npm run test:visual:install
npm run test:visual
```

The read-only rotation badge also has a Firefox check. Install that test browser once with `npx playwright install firefox`, then run `npx playwright test --config test/visual/playwright.config.js --browser firefox --grep "Read-only rotation badge"`. It verifies hidden native number arrows on a display, and retained editing/keyboard arrows after making that browser primary.

On failure, open `playwright-report/index.html`. The report contains the expected image, actual image, trace, and pixel difference where applicable.

To approve an intentional visual change:

1. Run `npm run test:visual` and inspect every failure.
2. Confirm the result in the exact target viewport, including the old-TV viewport when Legacy CSS changed.
3. Run `npm run test:visual:update`.
4. Run the ordinary command again and commit the changed PNG files with the implementation.

Never update snapshots only to make a test pass. Prefer a numeric geometry assertion when the requirement is measurable.

## Current coverage

Build420 adds an authenticated launcher-language scenario with real Modern and
Legacy pages. Both languages propagate while the canonical monotonic start and
minute-signal key/target remain unchanged. As with the existing browser language
button, SSE version changes may rebuild future audio nodes; this is not an audio
scheduler rewrite. Node tests cover scoped token/body/origin authorization,
PIN/primary preservation, persistence, no public token leak and reserve forwarding.
Native Windows tests additionally click the actual launcher button, execute its
asynchronous HTTP worker against an isolated server and check CLR2 compatibility.

Build 418 adds live reserve disconnect failures in Russian/English, exact blocking-browser identification, return/expiry/success without clearing an explicitly tracked future audio node, and localized network-address errors. A real LAN-interface case opens both operator and reserve display through localhost aliases, pairs using the reserve LAN address, returns the display to the verified primary LAN origin with actual CORS, then unpairs while preserving the operator endpoint, AudioContext and schedule generation. These isolated servers listen on ephemeral ports; the operator's running server is never used. Node tests cover route-selected IPv4/IPv6 addresses, HTTPS/domain preservation, reverse identity rejection and current-registry removal, including new clients before a heartbeat and expiry. No physical NAT/VDS/TLS topology is simulated by the LAN test.

Build 417 protects URL/text fields, contenteditable elements and open dialogs from global timer hotkeys. The Secondary setup regression types uppercase HTTP/HTTPS and hostname letters P/Z as real keystrokes, checks both languages and unchanged running/start state, verifies full names in dialog/tooltips while compact buttons/badges retain SEC, and confirms ordinary P/Z/Ctrl+Q shortcuts outside editing still work. Pairing scenarios now type the address instead of assigning its value.

Build 416 adds Secondary→current-primary round trips on modern/Legacy displays and group return when the operator is on a following standby, without changing either server's authority epoch/start anchor. Diagnostic geometry checks cover 320, 360, 393, 768, 1024, 1280, 1600 and 1920 pixels, all eight main badges on one line with order-control clearance, LEG everywhere and a 320-pixel row without a Secondary server. LIST layout remains independent. Deterministic controller tests verify that consumed manual return commands survive reload and cannot bounce a later automatic failover back to a failed primary.

`secondary.spec.js` launches two isolated real Node servers, separate Modern operator/viewer contexts and a Legacy page. It pairs a Secondary server through the real dialog, preserves already scheduled Web Audio objects/generation, moves one display without navigation, combines registries and performs group takeover. It verifies automatic role reversal, moves one screen to the recovered reserve, then transfers the whole group a second time to the same process. It captures `help-assets/secondary-server.png`. A second scenario kills the primary, checks automatic cutover after the 20-second threshold and continuous elapsed/client identity, restarts the old primary and verifies its return as reserve without failback. It never stops the operator's server. Node tests additionally cover changed operator/PIN/lists, pending Final recovery, lost reversal acknowledgements, inaccessible return addresses and retired epochs. Real-device CORS/TLS/audio tests are still required.

`clock.spec.js` uses an isolated controlled-clock server and the actual modern page. It delays the initial measured HTTP response while allowing SSE and offsets the device clock by five seconds: the page must show synchronization, create no audio plans/nodes or played keys, and recover after measurement. It also steps the server calendar clock forward/backward by two minutes while monotonic time advances normally, asserting unchanged competition anchors/version, no sound-schedule clearing, preserved Web Audio nodes, and continuous elapsed time. The pending-state screenshot is captured as `help-assets/initial-clock-sync.png`.

The modern and Legacy route-resumption scenario verifies rotations 16 → 17 → 18: preparation for the held wave appears at rotation 17, all markers for that pause disappear, and the same participants climb at rotation 18. It uses an isolated server and saves screenshots in the test artifacts.

Before resumption, this scenario also checks that a pause on route 2 from rotation 17 to resumption at 18 marks exactly participants 15–16 on route 2 and participant 17 on route 1. Preparation counts only for later routes, not the first attempt; later starters have no pause icons.

The modern and Legacy first-route scenario checks a pause starting at 17 and resuming at 19: only participants 17–18 have pause icons (not participant 19 preparing for the first route). The modern route menu must say “с ротации 17 по ротацию 18” / “from rotation 17 through rotation 18”; the resume boundary and participant timetable are unchanged.

The modern and Legacy pause-order scenario first saves route 2 paused at 17, resuming at 18, then adds route 3 paused at 14, resuming at 16. At rotations 15–16, participants 13–14 on route 2 and participant 15 on route 1 retain the later pause markers. Reloading the stored stale anchors gives the same result. At rotation 17 no one climbs route 2; participant 13 prepares and starts at 18. This scenario captures the user-guide screenshot.

Modern and Legacy stop-before-pause scenarios cover route 2 paused at 17 and permanently stopped from either 16 or 17. All pause markers disappear, route 1 keeps its unshifted timetable, and route 2 shows stopped attempts, including after reload. The modern tests use the incident editor and verify the inactive-pause explanation in Russian and English.

The same modern scenarios then cancel the stop through the editor after reload and assert the exact original pause payload, Russian/English 17-through-17 description, restored three markers, preparation at 17, and climbing at 18. Legacy verifies the restored state from the primary. The restoration screenshot comes from the equal-start stop case. Unit tests also cover longer scheduled endings, zero-length and open-ended pauses through stop/save/reload/cancel.

The scenarios in `layout.spec.js` cover:

- Final completion: the first appearance of zero uses the default or custom break palette in Modern and Legacy, blue-purple completed route diamonds, and no retained completion colors after reset or in a repeating zero-break rotation;
- all five configurable marker colors, short HEX normalization, invalid-value fallback, pseudo-element fills, unchanged geometry and no repeated palette stylesheet writes in Modern/old-TV Legacy;
- a read-only rotation badge on modern/Legacy list screens at `360×778`, `962×541`, and `1000×1000`, including phase/language changes, Final rotation numbering and countdown, optional clocks, and global/per-screen list hiding;
- native fullscreen on the primary browser: the rotation remains visible and read-only, and becomes editable again after exit while paused;
- read-only rotation badges use textfield appearance without native number arrows, including Firefox, while primary editing retains normal number-input controls;
- a held Festival progress-bar drag while server synchronization continues;
- route-count drafts while running/paused across the ordinary two-second poll, blank/multi-digit input, Tab/Enter commits, rapid spinner changes during a delayed save, and visible save failure with explicit retry;
- route-count editing with network disabled in the generated single-file standalone HTML and Android HTML (browser test of embedded assets, not a native WebView/device test);
- manual restart after a completed scheduled start;
- the LEGACY outline only on browsers that can use the normal interface;
- a `360×778` modern phone with two stacked start lists;
- parallel modern lists whose columns follow table width rather than toolbar width;
- per-screen switching of exactly two lists between one and two columns;
- the optional server clock on Legacy;
- Legacy portrait intrinsic columns with one/two lists at 360 and 393 pixels, and four lists with long names/additional columns at 480 pixels: compact number/route cells, full text and contained markers, matching stacked columns, horizontal scroll access, and rotation to landscape and back;
- Legacy reclaiming the full viewport after global/per-screen list hiding, and restoring list geometry on re-enable, in landscape and portrait with the old TV's Chrome 29 user agent, no FontFace/ResizeObserver/visualViewport APIs, and no synthetic resize events;
- an offline Legacy Classic countdown starting at the planned absolute time;
- separation of the server clock and main timer in the old-TV viewport;
- Legacy column headings after automatic scrolling;
- a Legacy transition from four lists to two followed by Stop;
- modern and Legacy `1000×1000` four-list containment.

The old television is represented by a `962×541` CSS viewport even though its physical panel is 1920×1080. That reported browser viewport is the compatibility target.

These compatibility cases use modern Chromium with selected old-browser capabilities disabled, not an actual Chrome 29 engine. Final hardware confirmation still requires the television.

The new APK's server mode uses this same server page; it does not introduce an
alternate browser clock/audio implementation. Native mode selection, screen-on,
Back and safe-area contracts are tested separately by the JVM harness in
`test/android-insets.test.js`. Actual WebView/screen-off/speaker behavior is not
covered by desktop Playwright: follow the physical-device matrix in
`android/README.md` before competition use. Do not label these browser captures
as native APK screenshots.

## Test data and artifacts

- The runner is Playwright with `test/visual/playwright.config.js`.
- The isolated server helper is `test/visual/helpers.js`.
- Screenshot baselines are under `test/visual/snapshots/`.
- Generated reports and transient results are ignored and are not product documentation.

User-guide screenshots live separately in `help-assets/`. Update them through a real browser after the interface and visual tests are stable; do not copy regression-test diffs into the manual.

Build 421 `controls.spec.js` verifies CTRL assignment/revocation, hidden settings, buttons/hotkeys/Screen, gray Legacy availability, shared break mute with exact canonical start target, and one scheduled-start MINUTE in Classic/Final with real Web Audio. Unit coverage tests exact sound targets for buffered/fallback paths and offsets, initial calibration/stale/cancel guards, imminent break-node cancellation and preserved visual/rotation warnings. Server tests cover hostile runtime payloads, PIN/role isolation, persistence and reverse-RPC deduplication. The compact diagnostics matrix now measures nine badges with SEC.

Build422 adds RU/EN checkbox-column/default/persistence assertions and folded/unfolded/mobile viewport tests with and without lists. CSS viewport simulation makes large vh 120px taller than visible dvh and reserves a 24px gesture inset; all four buttons must fit without scrolling while viewport dimensions change. The real user device is not emulated at the browser-engine or hardware level.

Build425 native-audio.spec.js tests automatic local output handoff with a fake device, preserved browser offset, mute/re-enable/Pause, continued native scheduling while Chromium is frozen, remote Stop, page closure and locality/origin rejection. RU/EN documentation captures use the actual native-route correction panel. These are separate from the opt-in silent Windows output-device test and do not measure speaker synchronization.
