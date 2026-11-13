# Stable release 3.0.0 — 13 November 2026

Follow-up: [Windows7/8 MSI installers](windows-legacy-msi300.md) were subsequently
added to this same release. It now has18 assets; the original14 payloads and
tag are retained. The counts below record the initial publication.

Published [v3.0.0](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.0.0)
as stable Latest. Timer build remains 454. Russian and English notes describe
new functionality relative to 2.3.2 and follow the owner's release-note rules.

## Source and branch synchronization

The accumulated local develop changes were committed and pushed first as
`0c4ba95fe50d5f06e59e43a8c170ed33b3bca0d0`. Main was then merged into develop
(`40c0676`), retaining the newer develop implementation of Final start and
format changes. Main-only commits af158e1/da03969 already had develop equivalents
4801c85/2b2cce6. Both branches were advanced together before the tag was pushed.

The annotated tag resolves to release source
`2e0d72b6b0d8c7d3bef6ca579aab4b1ac906e78f`; tag object:
`4bd559fdd0068e6a9423edbfe8dde80bf2b09b3c`. Subsequent validation documentation
and the diagnostic-label test expectation do not change runtime sources or the
tagged packages. Local test EXEs, keys and runtime state were excluded from Git.

## Validation

- [Release CI 43424303738](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43424303738)
  succeeded: 15 successful jobs; the develop-only macOS preview was intentionally
  skipped. The server test job passed 603 of 614 cases with 11 platform/opt-in
  skips and zero failures. Dedicated jobs ran the native Windows/CLR2 and Unix
  certificate/launcher checks, actual Node12 compatibility, Chromium checks
  against Node12, Unix mixer/decoder checks and installer validation.
- Local Chromium covered 155 scenarios. The initial full run passed 153 and
  exposed two obsolete fixture expectations: a synthetic minute cue reused a
  production event identity, and a diagnostic-label list omitted the new ↓↑
  badge. The distinct test cue/explicit audio unlock and updated label list
  passed their two-case Node24 rerun. The clock and updated SEC tooltip also
  passed a two-case actual Node12 rerun. Product audio and timer code were not
  changed to satisfy these expectations.
- Guide QA passed in RU/EN at 1440px and 390px, with 39 referenced PNGs,
  no broken images/anchors and no page overflow. Automatically generated guide
  captures from the browser run were restored to the reviewed release images.
- Release-input/build consistency and Git whitespace checks passed.
- [GitHub Pages deployment 43424307907](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43424307907)
  succeeded for the release source.

## Published artifacts

GitHub release ID 444203028 has 16 uploaded, nonempty assets: 14 payloads,
SHA256SUMS.txt and update-info.json. The payloads are Windows x64 ZIP/MSI,
Windows7/8 x86/x64 ZIPs, Linux x64/ARM64 TAR.GZ/DEB, macOS x64/ARM64 TAR.GZ/PKG,
Android APK and standalone HTML.

All 14 package SHA-256 values in the downloaded checksum file match GitHub's
server-side asset digests. The two downloaded metadata files were independently
hashed and matched their asset digests. Update metadata is exactly
`{"version":"v3.0.0","buildNumber":454}`. The published description matches
docs/releases/v3.0.0.md, and the Latest API returns this same stable release.
Evidence and verification scripts are in ignored dist/release300/published.

Owner launcher/server processes were not restarted, replaced or installed over.
Compatibility checks on modern Windows with Node12/CLR2 references do not claim
a physical Windows7 test. macOS packages use ad-hoc signatures, not Apple
notarization. Automated scheduling/output-stub checks do not prove physical
sound on every device.
