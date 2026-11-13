# Windows7/8 MSI addition to 3.0.0

Two compatible installers were added to the existing stable
[v3.0.0 release](https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/tag/v3.0.0):
windows7-8-x64.msi (13,946,880 bytes) and windows7-8-x86.msi (12,517,376 bytes).
Release ID remains 444203028, stable Latest. Timer build remains 454.

The original 3.0.0 tag still resolves to
2e0d72b6b0d8c7d3bef6ca579aab4b1ac906e78f. All original payloads, including
the modern MSI, remain byte-identical. The new installers use the published
Legacy ZIPs after verifying their SHA-256 values. Every original payload file
is preserved: each Legacy MSI contains those 130 files plus the installed-mode
marker and ReadMe-MSI.txt. Packaging implementation is in commit
01b314ebc038a6ae18b86029f5cb598800c197b3.

## Installer behavior

The shared WiX4 project now has modern x64 and Legacy x86/x64 profiles. Modern
retains its existing name, folder and UpgradeCode. Legacy installs into its
own Program Files folder with distinguished product/shortcut names and separate
stable upgrade families. Windows Installer 5.0 and Win7 SP1-or-later conditions
are explicit. The Russian Legacy database/summary use codepage 1251; modern
keeps 65001. The existing shortcut-selection UI is shared. Setup does not launch
a timer, add a service or remove user data. Installed state/HTTPS storage uses
the existing per-user location. Portable-folder migration is explained in the
additional bilingual MSI readme.

`scripts/build-windows-msi.ps1` validates runtime/architecture/configuration,
builds in isolated temp directories and requires verification before returning.
The release workflow builds/uploads MSI alongside each Legacy ZIP. Scratch
profiles, generated WiX files and administrative images stay outside the
release-output directory; explicit WiX inputs exclude stale obj files.
Harvesting packages files without COM/registry registration.

## Validation

Local PowerShell5/Windows Installer checks passed on all three profiles:
Legacy x64, Legacy x86, and modern x64 (regression build only). They checked
MSI architecture/template, version 3.0.0, upgrade identities, component bitness,
Program Files root, codepage, exact Russian dialog text, shortcuts and Legacy
launch condition. Administrative extraction verified all original file hashes,
marker/MSI-readme hashes and no unexpected extra files. Every extracted server
started with its bundled runtime in an isolated profile, returned HTTP200 and
build 454 with a stopped timer. The Legacy preflight rejected a modern runtime
without creating output. Four installer-asset tests, release-input consistency
and guide QA (39 PNGs; RU/EN at 1440/390px) passed.

[CI43430573905](https://github.com/dfedorov-arch/fdv-bouldering-timer/actions/runs/43430573905)
successfully completed all 15 build/test jobs, including both Legacy MSI profiles
and the modern MSI. The current stable MSIs were built separately from the
already published 3.0.0 ZIPs, preserving their runtime content.

No product was installed on the operator's machine and no owner server was
stopped. Administrative extraction and modern Windows checks are not a Win7
OS installation test. A Win7 installation/uninstallation run remains device
validation for the owner. WiX emitted existing ICE60 language-metadata warnings
for bundled binaries; payload bytes were retained and all required checks passed.

## Publication verification

The two MSI digests are:

- x64: c005806782b439285e8b987285336c0287764a29a3fe3bae5ad2986ad14bda67
- x86: 5dd3de67d654328680b6865d2c161598ebf8e2a73b09d9cea52417632f7a2247

The release now has 18 assets and 16 payload checksums. Both MSI digests and all
existing payload digests match GitHub's asset digests. The downloaded checksum
file also matches its own asset digest. Update metadata stays v3.0.0/build 454,
and Latest still names this release. Only the package-availability sentence
changed in the RU/EN description. Evidence/reports/scripts are under ignored
dist/win7-msi300. The original release verification is in release300.md.
