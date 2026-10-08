# Documentation map

This file defines the documentation set and its source-of-truth boundaries. Product terminology in user-facing text is **start list / стартовый список** and **list / список**. Internal identifiers such as `startList*` and compatibility names such as `legacyProtocols` remain implementation details.

## User documentation

| File | Audience | Purpose |
| --- | --- | --- |
| `README.md` | GitHub visitors | Product overview, quick start, essential features, development commands |
| `ReadMe.txt` | Portable-package users | Plain-text quick start in Russian and English |
| `help.html` | Operators | Complete bilingual guide for setup, competition operation, displays, lists, diagnostics, and troubleshooting |
| `ReadMe-windows.txt` | Windows package users | Platform launcher and first-run notes |
| `ReadMe-macos.txt` | macOS package users | App launch, Gatekeeper/quarantine, and fallback notes |
| `ReadMe-linux.txt` | Linux package users | Launcher, desktop integration, executable permissions, and fallback notes |
| `runtime/*/README.txt` | Custom package builders | Optional portable Node.js placement |

Release installers are assembled by `.github/workflows/release.yml`: MSI for Windows, PKG for macOS, DEB for Debian/Ubuntu Linux, and a signed Android APK. The same release assets can be installed through Komi Store on Windows, macOS, Linux, and Android. The Android asset is deliberately named `android-standalone`: it embeds a one-device timer and does not provide the local network server or synchronized displays.

The Android wrapper's safe-area contract and host-side regression tests are described in `docs/architecture.md`. Window-inset tests use JVM API doubles, not screenshots of an actual Android system navigation bar; hardware verification must cover both three-button and gesture navigation, hidden bars, and rotation. APK-only Java changes do not require a cached HTML application-build increment.

Desktop installers include `fdv-installed.marker` to select per-user server state storage. Portable archives omit that file; older unmarked or read-only directories have a startup permission fallback. State paths and transfer rules are documented in `help.html`, `ReadMe.txt`, and each desktop platform ReadMe.

Current application screenshots belong in `help-assets/`. A screenshot that shows removed controls, obsolete terminology, or the old diagnostic order must not be referenced; use a neutral layout until a current-build capture is available. Launcher icons and launcher-window images are replaced only when those launchers change.

`help-assets/route-count-save-failed.png` is a real build 403 browser capture from the isolated route-count failure/retry test: the draft stays at 4 while the canonical table still has 5 routes. The regression matrix covers running/paused synchronization, rapid pending commits, failure recovery, and offline HTML/Android-generated pages. Existing display geometry and the build 402 diamond palette are unchanged.

`help-assets/final-completed.png` shows completed Final zero on the default red break background and a blue-purple completed route diamond. It is captured by the isolated modern completion visual test; Modern and Legacy tests also cover a custom break palette, the first zero mutation, reset, and repeating zero-break rotations. Current list screenshots use the build 404 `#48488c` diamond palette. The five `list_*_color` parameters and HEX fallback rules are documented in both manual languages; browser tests cover custom palettes, invalid-value reset, pseudo-elements, unchanged geometry and skipped repeated style writes, including old-TV compatibility.

`help-assets/route-resume-preparation.png` shows the held wave preparing at rotation 17 before route 2 resumes at rotation 18; it is captured by the isolated modern route-resumption visual test.

`help-assets/bounded-route-pause.png` shows the same planned pause before resumption, with exactly three pause icons: participants 15–16 on route 2 and participant 17 on route 1. Preparation for the first route has no pause icon; it comes from that isolated test.

`help-assets/first-route-pause.png` shows a first-route pause starting at 17 and resuming at 19: the description ends at 18 and exactly participants 17–18 have pause icons. The modern first-route visual test captures it and verifies the description in Russian and English; the Legacy test verifies the same marker selection.

`help-assets/ordered-route-pauses.png` shows rotation 15 with preparation before route 3 resumes and the three retained markers of the later route 2 pause. The isolated pause-order test verifies initial creation order, reload from stale saved anchors, preparation at 17, and climbing at 18 in Modern and Legacy.

`help-assets/stop-supersedes-pause.png` shows the incident menu explanation for a route 2 permanent stop at its planned pause start (rotation 17), with no upstream pause markers. The isolated modern stop-before-pause test captures it, verifies both languages, and has equivalent Legacy and earlier-stop (16) cases.

`help-assets/restored-route-pause.png` shows the same route 2 pause restored with its original ending (17 through 17, resume 18) after cancelling the equal-start permanent stop. The isolated modern test captures it after a page reload and verifies the exact original saved payload and both languages.

`help-assets/list-screen-cycle.png` shows the current-rotation badge and optional clock on a modern secondary display with start lists; it is captured on an isolated visual-test server.

`help-assets/legacy-phone-columns.png` is an isolated 393-pixel Legacy portrait capture with compact number/route columns and full participant names. The geometry tests also cover one/two lists at 360/393 pixels, four wide-data lists at 480 pixels, three-digit numbers, synchronized column widths, horizontal scroll access, and orientation changes. These run in modern Chromium with compatibility capabilities disabled; actual old-browser hardware still needs operator confirmation.

## Website documentation

| File | Purpose |
| --- | --- |
| `docs/index.html` | GitHub Pages landing page; download buttons must use `releases/latest` rather than a hard-coded version |
| `docs/assets/overview-en.png` | Unreferenced historical application overview; replace before reusing |
| `docs/standalone.html` | Generated GitHub Pages standalone timer; never edit manually |

## Developer documentation

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Current server/client modules, state ownership, time, audio, start-list incident semantics, launcher networking, persistence, and release invariants |
| `docs/performance-diagnostics.md` | Opt-in diagnostic modes, counters, traces, baseline harness, and interpretation |
| `test/visual/README.md` | Playwright visual-regression workflow and current viewport matrix |
| `launcher/*/README.md` | Building and packaging native launchers |
| `android/` | Native Android WebView shell and release-signing configuration contract; generated signing keys and `keystore.properties` must never enter Git |
| `docs/review/*` | Maintained architecture review: current system overview, synchronization analysis, remaining risks, and improvement plan |

Project-level files outside the worktree:

- `../PROJECT-CONTEXT.md` is the handoff map for future development sessions.
- `../PERFORMANCE-ANALYSIS.md` records the completed performance audit and the status of its optimizations.
- `../help.docx` is an editable operator-manual artifact. Its content must agree with `help.html`; every meaningful edit requires DOCX render and page-by-page visual QA.

## Not product documentation

Third-party license and font-license files are legal notices and are not rewritten as product documentation. Files under `beeps/`, `fonts/OFL-*`, and `lib/vendor/` must retain their upstream wording. `fonts/README.txt` is maintained because it documents the timer's bundled font choices.

## Update checklist

When behavior or visible terminology changes:

1. Update Russian and English strings together.
2. Update `README.md`, `ReadMe.txt`, and the relevant `help.html` sections.
3. Update architecture, diagnostics, visual-test, or platform documentation when their contracts change.
4. Replace affected screenshots and verify their references and alternative text.
5. Update `PROJECT-CONTEXT.md` and the current application build where cached product assets changed.
6. Run link/asset checks, `npm test`, and the relevant visual tests.
7. Regenerate `lib/offline-audio.js` and run `scripts/verify-release-inputs.js` when the application build changes.
