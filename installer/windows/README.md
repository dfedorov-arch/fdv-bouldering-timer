# Windows MSI packaging

`scripts/build-windows-msi.ps1` builds and verifies the WiX4 installer. The
payload must be a portable package with its verified bundled Node runtime.

```powershell
scripts/build-windows-msi.ps1 -PayloadDirectory <legacy-x64-package> -OutputDirectory dist -Version 3.0.0 -Architecture x64 -Legacy
scripts/build-windows-msi.ps1 -PayloadDirectory <legacy-x86-package> -OutputDirectory dist -Version 3.0.0 -Architecture x86 -Legacy
scripts/build-windows-msi.ps1 -PayloadDirectory <modern-x64-package> -OutputDirectory dist -Version 3.0.0 -Architecture x64
```

Legacy MSI requires Node12.22.12 with matching architecture and the CLR2/CLR4
launcher configuration. Modern MSI remains x64 with its existing UpgradeCode,
name and folder. Legacy x64 and x86 have separate stable UpgradeCodes, explicit
Windows7-SP1-or-later launch conditions, distinguished shortcut/product names,
and `FDV Bouldering Timer Legacy` under the architecture's Program Files root.
No timer or server is launched by setup. User runtime-state and managed HTTPS
files use the existing per-user installed-mode storage and are not MSI-owned.
ReadMe-MSI.txt explains installed versus portable operation.

Windows Installer 5.0 is selected explicitly. The Russian Legacy database and
summary use Windows-1251, avoiding the limited UI support of UTF-8 MSI codepages.
See the [WiX package schema](https://docs.firegiant.com/wix/schema/wxs/package/),
[codepage guidance](https://docs.firegiant.com/wix/tools/codepage/), and
[Windows OS property values](https://learn.microsoft.com/en-us/windows/win32/msi/operating-system-property-values).

The build invokes `verify-windows-msi.ps1`. It reads the MSI through Windows
Installer COM, checks product/version/architecture/upgrade family, component
bitness, Program Files root, launch condition, codepage, Russian control text
and both shortcuts. It administratively extracts the embedded CAB, hashes
every original payload file and allows only the marker and Legacy MSI readme
as additions. The extracted server is then smoke-tested with its own runtime,
an isolated profile/free port and a stopped timer. No product installation or
GUI launch is performed. This is not a physical Windows7 installation test.

Scratch files, extraction and smoke profiles use a unique system-temp directory,
outside the release-output directory. Use a short TEMP path for Windows
Installer's path-length constraints. Only the verified MSI is written to the
release output. Explicit WiX source inputs keep previous obj files out of
subsequent architecture builds. Harvesting packages files without COM/registry
registration. The existing Russian shortcut-selection UI remains shared.

Release CI publishes Legacy MSI alongside each x86/x64 ZIP and includes both
in the final checksums. For the existing 3.0.0 release the two MSIs were built
from its already published, SHA-256-verified ZIPs, preserving all timer files.
The ordinary 3.0.0 MSI and existing release payloads are retained.
