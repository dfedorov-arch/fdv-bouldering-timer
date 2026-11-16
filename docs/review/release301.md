# Stable release 3.0.1 — build455

Published on 16 November 2026 as stable
[Latest v3.0.1](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.0.1).
The tagged CI run completed successfully on its second attempt: all 15 required
jobs succeeded; the optional macOS preview was skipped.

Publication verification confirms 18 uploaded, nonempty assets: 16 payloads,
`SHA256SUMS.txt` and `update-info.json`. The checksum file matches every GitHub
asset digest; downloaded metadata files also match their server-side digests.
Update metadata is exactly version `v3.0.1`, build455. The bilingual description
matches `docs/releases/v3.0.1.md`, Latest points to this release, and the tag
resolves to the tested source. Windows7/8 x86/x64 MSI and ZIP are included.
Other payloads are modern Windows MSI/ZIP, Linux x64/ARM64 DEB/TAR.GZ,
macOS Intel/ARM64 PKG/TAR.GZ, Android APK and standalone HTML.

Release source is `d77eb6f3e9c737c2b565a4de8f85abfbff68a8f5`.
Develop first incorporated GitHub `91700ee` (settings editor and diagnostic
audio ownership), followed by `21d8dc4` (responsive launcher preparation) and
the build455/settings no-op change. Main fast-forwarded from `e0b2ce2`; no
remote changes or branch history were discarded. Tag `v3.0.1` is annotated.
The release notes follow the owner's RU/EN editorial rules.

Validation before publication:

- Full Linux Node24 source suite: 614 cases, 602 passed, 12 platform/opt-in
  skips, no failures. The temporary Linux snapshot used Linux esbuild and
  locally extracted unzip/zip, with shell line endings normalized for WSL.
  The original Windows checkout and its dependencies were preserved.
- Chromium controls suite: 26 passed, including diagnostic audio HTTP/SSE
  ordering, repeated cues, cancellation, ownership and HTML fallback checks.
  Two automatically regenerated help screenshots were restored to the
  reviewed versions; no screenshot changes are part of this release.
- Native modern Windows and CLR2-reference launcher suites passed, including
  unchanged, reverted and whitespace-only settings, byte/timestamp preservation,
  real saves, and startup timeout/retry/exit ownership. Linux headless settings
  RU/EN and startup/process/peer tests also passed in WSL.
- Release input consistency verifies build455 in the server, Modern/Legacy,
  service worker, offline bundle and generated standalone HTML.
- Two VM fixtures were updated to provide the diagnostic-audio cancellation
  hook now called by runtime controllers. Their state/timing assertions remain
  unchanged; production behavior was not weakened to satisfy the tests.

Release CI: [43870532875](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43870532875).
The duplicate develop build was cancelled in favor of the tagged run.
The first tagged attempt left macOS ARM unassigned in the runner queue for
over ten minutes. Cancelling that waiting attempt and rerunning only its ARM
job resumed execution immediately, preserving the successful platform results
and artifacts. The source and annotated tag were not changed.
Pages deployment for the release source:
[43870533805](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43870533805).

Local evidence: ignored `dist/release301`, including the full test logs,
browser log and publication-verification script. Existing operator servers
and the approved local build455 test instance were not restarted for release
publication. Platform CI does not replace a physical Windows7 or macOS
operator test, nor does it prove audible output on every device.
