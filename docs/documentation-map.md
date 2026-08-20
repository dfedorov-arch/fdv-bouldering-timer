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

Release installers are assembled by `.github/workflows/release.yml`: MSI for Windows, PKG for macOS, DEB for Debian/Ubuntu Linux, and a signed Android APK. The Android asset is deliberately named `android-standalone`: it embeds a one-device timer and does not provide the local network server or synchronized displays.

Current application screenshots belong in `help-assets/`. A screenshot that shows removed controls, obsolete terminology, or the old diagnostic order must not be referenced; use a neutral layout until a current-build capture is available. Launcher icons and launcher-window images are replaced only when those launchers change.

## Website documentation

| File | Purpose |
| --- | --- |
| `docs/index.html` | GitHub Pages landing page; download buttons must use `releases/latest` rather than a hard-coded version |
| `docs/assets/overview-en.png` | Unreferenced historical application overview; replace before reusing |
| `docs/standalone.html` | Generated GitHub Pages standalone timer; never edit manually |

## Developer documentation

| File | Purpose |
| --- | --- |
| `docs/architecture.md` | Current server/client modules, state ownership, time, audio, persistence, and release invariants |
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
