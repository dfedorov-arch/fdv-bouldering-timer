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

The scenarios in `layout.spec.js` cover:

- a held Festival progress-bar drag while server synchronization continues;
- manual restart after a completed scheduled start;
- the LEGACY outline only on browsers that can use the normal interface;
- a `360×778` modern phone with two stacked start lists;
- parallel modern lists whose columns follow table width rather than toolbar width;
- per-screen switching of exactly two lists between one and two columns;
- the optional server clock on Legacy;
- an offline Legacy Classic countdown starting at the planned absolute time;
- separation of the server clock and main timer in the old-TV viewport;
- Legacy column headings after automatic scrolling;
- a Legacy transition from four lists to two followed by Stop;
- modern and Legacy `1000×1000` four-list containment.

The old television is represented by a `962×541` CSS viewport even though its physical panel is 1920×1080. That reported browser viewport is the compatibility target.

## Test data and artifacts

- The runner is `run-visual-tests.js`.
- The isolated server helper is `test/visual/test-server.js`.
- Screenshot baselines are under `test/visual/layout.spec.js-snapshots/`.
- Generated reports and transient results are ignored and are not product documentation.

User-guide screenshots live separately in `help-assets/`. Update them through a real browser after the interface and visual tests are stable; do not copy regression-test diffs into the manual.
