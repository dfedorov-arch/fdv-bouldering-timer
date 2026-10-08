# Visual regression tests

The suite starts an isolated timer server, launches the pinned Playwright Chromium build, and verifies layout and interaction behavior. It never uses the production server or changes its runtime state.

## Setup and commands

```powershell
npm install
npm run test:visual:install
npm run test:visual
```

On failure, open `playwright-report/index.html`. The report contains the expected image, actual image, trace, and pixel difference where applicable.

To approve an intentional visual change:

1. Run `npm run test:visual` and inspect every failure.
2. Confirm the result in the exact target viewport, including the old-TV viewport when Legacy CSS changed.
3. Run `npm run test:visual:update`.
4. Run the ordinary command again and commit the changed PNG files with the implementation.

Never update snapshots only to make a test pass. Prefer a numeric geometry assertion when the requirement is measurable.

## Current coverage

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

## Test data and artifacts

- The runner is Playwright with `test/visual/playwright.config.js`.
- The isolated server helper is `test/visual/helpers.js`.
- Screenshot baselines are under `test/visual/snapshots/`.
- Generated reports and transient results are ignored and are not product documentation.

User-guide screenshots live separately in `help-assets/`. Update them through a real browser after the interface and visual tests are stable; do not copy regression-test diffs into the manual.
