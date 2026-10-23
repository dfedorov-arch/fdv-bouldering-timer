# Documentation map

This file defines the documentation set and its source-of-truth boundaries. Product terminology in user-facing text is **start list / стартовый список** and **list / список**. Internal identifiers such as `startList*` and compatibility names such as `legacyProtocols` remain implementation details.

## User documentation

Build436 adds native Core Audio/ALSA server output on macOS/Linux x64/ARM64 and the build label in Unix launchers. Shared UI/preferences/keep-awake are included in all release targets. Prerequisites, packaging and validation limits: native-audio/unix/README.md and review/cross-platform-build436.md.

Build435 corrects the unreachable sound-label width threshold. Natural desktop viewports are covered in review/sound-row-build435.md; current RU/EN wide-panel captures show the full caption.

Build434 fixes sound-row alignment and responsive captions. Current RU/EN captures and review/sound-row-build434.md cover full/compact widths and role changes.

Build433 changes the default speaker quiet interval from60 to180 seconds. Current parameter examples are updated; UI and existing captures are unchanged.

Build432 compacts the sound checkbox row, adds the default-on speaker keep-awake switch and RU/EN tooltip/captures. Parameters and limitations are in quick starts and review/speaker-keep-awake-build432.md.

Build431 adds the per-browser server-audio checkbox, RU/EN tooltip and updated AUDIO captures. Preference persistence, SEC replication and safe handover are described in review/server-audio-build431.md.

Build430 adds the running server build beside the Windows launcher title. See launcher/windows/README.md and review/launcher-build430.md for native-render evidence and checks.

Build429 sets native audio-anchor and browser technical-preparation tolerances to10ms inclusive and audits all audio paths for smaller invalidation/lateness thresholds. UI/layout and existing guide captures remain unchanged. Audit: review/audio-tolerances-build429.md.

Build428 expands only the native audio-anchor tolerance to50ms inclusive at the user’s request. Current guides/audio technical notes explain the retained reference and unchanged browser path. No UI/layout change or new screenshot. Validation: review/server-audio-build428.md.

Build427 fixes native scheduled-start MINUTE cancellation caused by sub-ms wall/monotonic reprojection jitter. RU/EN guides, quick starts and audio technical notes describe the fix. Existing screenshots remain current because controls/layout are unchanged. Evidence: review/server-audio-build427.md.

Build426 fixes native refill robustness: three buffers/120ms, no synchronous JSON on the PCM thread, unchanged target/offset projection and refill counters. Existing RU/EN AUDIO captures remain current because this fix changes no controls or layout. See review/server-audio-build426.md for bounded load-test evidence and remaining limits.

Build 425 adds automatic Windows server audio for a directly co-located modern browser. The bilingual guide, README and quick starts describe preserved per-client correction, cancellation, browser fallback and platform prerequisites. `server-audio.png` / `server-audio-en.png` are real app-panel captures with a stubbed output device; they show the actual route indicator and correction UI, not acoustic timing evidence. Architecture/performance notes describe the two-phase handoff, PCM watchdog, ephemeral leases and validation limits.

Validation evidence and platform limits: [review/server-audio-build425.md](review/server-audio-build425.md).

Build 424 adds early technical preparation 10 seconds before the first warning/minute/scheduled-start signal and removes age-only expiry for current-phase warmups. Both guide languages and portable/Windows quick starts describe it; architecture/performance notes specify run/phase validation, async resume cancellation and unchanged competition-signal deadlines.

Build423 background audio is described in README, portable/Windows quick starts and both guide languages. Architecture and performance diagnostics define lifecycle gates, health thresholds, retained buffered audio and future-only recovery. Local Windows server audio is added in build 425. No additional Samsung viewport workaround is included.

Windows RU/EN launcher switching is described in both Windows quick starts,
the bilingual guide and launcher/windows/README.md. Native off-screen test
renders are ignored test artifacts, not physical Win7/Win8 captures. Language
preferences are remembered per user. From build420 the button additionally
changes the common server/display language via a narrowly authenticated local
command, including forwarding through a following reserve. It never rewrites
params or historical/Node.js logs. The previous native-only changes were419.

Build 419 adds Windows GUI certificate generation, including the Win7/Win8 CLR2
build: review names, explicit replacement, separate restart and no automatic
trust installation. Both quick-start languages/platform notes/guide document
managed private storage, public CER sharing and mutual Node.js trust. Native
RU/EN off-screen test renders under ignored dist validate layout; they are not
published as physical old-OS screenshots. See launcher/windows/README.md for
the opt-in native certificate test and docs/architecture.md for path precedence.

Build 418 adds HTTP loopback-to-route advertisement, reverse identity checking and current-registry disconnect errors. Both guide languages and quick starts describe HTTPS/NAT restrictions and explicit reconfiguration of old localhost pairs. `help-assets/secondary-disconnect-blocked.png` is captured from the actual paired browser test, not a mock; the same scenario verifies localized messages and protected clocks/audio.

| File | Audience | Purpose |
| --- | --- | --- |
| `README.md` | GitHub visitors | Product overview, quick start, essential features, development commands |
| `ReadMe.txt` | Portable-package users | Plain-text quick start in Russian and English |
| `help.html` | Operators | Complete bilingual guide for setup, competition operation, displays, lists, diagnostics, and troubleshooting |
| `ReadMe-windows.txt` | Windows package users | Platform launcher and first-run notes |
| `ReadMe-macos.txt` | macOS package users | App launch, Gatekeeper/quarantine, and fallback notes |
| `ReadMe-linux.txt` | Linux package users | Launcher, desktop integration, executable permissions, and fallback notes |
| `runtime/*/README.txt` | Custom package builders | Optional portable Node.js placement |

Release installers are assembled by `.github/workflows/release.yml`: MSI for Windows, PKG for macOS, DEB for Debian/Ubuntu Linux, and a signed Android APK. The same release assets can be installed through Komi Store on Windows, macOS, Linux, and Android. New Android builds offer a native mode/address chooser, a client of an existing server, and the existing embedded standalone timer. They do not host a server or provide background audio; native screen-on works while the timer is visible. Older published APKs remain standalone-only. The existing `android-standalone` asset suffix is retained for release-replacement compatibility.

The Android wrapper's server/standalone, foreground-only screen-on, TLS/navigation and safe-area contracts are described in `docs/architecture.md`. Tests compile real Java sources against JVM API doubles, not a WebView engine or actual Android navigation bar. Hardware verification must cover HTTP/HTTPS, initial audio unlock, extended idle playback, three-button/gesture navigation, rotation, lock/unlock and Secondary server support. APK-only Java changes do not require a cached HTML application-build increment. No new native screenshots are included until captured from an actual device/emulator; browser screenshots are not presented as APK evidence.

Desktop installers include `fdv-installed.marker` to select per-user server state storage. Portable archives omit that file; older unmarked or read-only directories have a startup permission fallback. State paths and transfer rules are documented in `help.html`, `ReadMe.txt`, and each desktop platform ReadMe.

Separate Windows 7 SP1/8/8.1 portable ZIPs (`windows7-8-x86`/`windows7-8-x64`) are built by the release workflow alongside modern packages. They contain official end-of-life Node12, a CLR2/CLR4 GUI launcher with its required .exe.config, and a foreground BAT fallback without PowerShell/.NET. `ReadMe-windows-legacy.txt` is their packaged ReadMe. They are for trusted isolated LANs, never Internet-facing servers; native Windows 7/8 hardware is not represented by a modern-host Node12 test. This server packaging variant is distinct from the browser's Legacy display mode. Cached HTML/build numbers and ordinary Node24 releases are unchanged. Build details and tests: `docs/windows-legacy.md`.

Current application screenshots belong in `help-assets/`. A screenshot that shows removed controls, obsolete terminology, or the old diagnostic order must not be referenced; use a neutral layout until a current-build capture is available. Launcher icons and launcher-window images are replaced only when those launchers change.

Build 416 uses LEG on all diagnostic cards and keeps the main badges on one row, apart from LIST and ordering buttons. Secondary server switching supports an explicit manual return to the current primary; persisted one-shot destination commands must not interfere with subsequent failover. Both guide languages and quick starts describe this distinction. The two-server screenshot is recaptured with LEG; browser tests measure containment at eight viewport sizes from 320 to 1920 pixels and verify modern/Legacy return plus group return without authority promotion.

`help-assets/secondary-server.png` is captured from the real two-server Secondary server setup dialog by `secondary.spec.js`. Current documentation describes setup, per-browser/group transfer, the 20-second threshold, merged diagnostics, automatic former-primary return as standby (not failback), bidirectional reachability/TLS trust, asynchronous replication and partition limitations. It covers authority epochs, changed operators and repeated takeovers. `lib/client-secondary-server.js` must load in Modern/Legacy, be cached by `sw.js`, and be embedded but disabled in standalone/Android HTML; release-input checks enforce these dependencies. Private pairing metadata and the role-reversal handshake are described in `docs/architecture.md`.

`help-assets/initial-clock-sync.png` shows build 413 waiting for its first measured server clock while SSE has already supplied a running timer. The isolated `clock.spec.js` test captures the real page and verifies no scheduled/consumed sounds before calibration and recovery afterwards. Both guide languages describe the independent modern timer coordinate, preserved calendar-based starts/recovery, and unchanged Legacy compatibility API.

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

The current modern recovery contract is in the Authority and clocks section of `docs/architecture.md`: measured HTTP timing is separate from state/SSE, retired server instances cannot return through late packets, and clock discontinuity requires server verification rather than a wall-clock jump. `README.md`, `ReadMe.txt`, and both `help.html` languages describe the pending-clock warning and suspended signals. The architecture also distinguishes unchanged Legacy wall-clock/XHR behavior and documents the regression matrix and limits of simulated sleep tests. Historical review material must not override that implementation contract.

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

Build 421 adds shared break-warning mute, a scheduled-start minute warning and modern CTRL limited controls. Both guide languages and quick references document the exact rights and warning scope. `help-assets/break-warning-option[-en].png` and `limited-control[-en].png` are real isolated browser captures from `controls.spec.js`. Diagnostics order now includes CTRL after LEG; no native launchers or device screenshots changed.

Build422 changes the label to the positive default-on Break sound / «Звук в перерыве», aligns its checkbox width with other rows, and constrains CTRL to the dynamic visible viewport. Existing option/CTRL screenshots are recaptured. `limited-control-fold.png` and `limited-control-cover.png` show test viewports with simulated browser bars/gesture inset, not photographs of Fold8. Background-audio visibility policy is investigated only and remains unchanged.
