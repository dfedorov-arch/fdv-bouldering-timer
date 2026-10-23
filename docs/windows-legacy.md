# Windows 7/8 compatibility packages

The release workflow builds separate x86/x64 ZIPs for Windows 7 SP1, 8 and 8.1.
Modern Windows MSI/ZIPs keep Node24. No separate competition/time/audio source
branch is maintained. Old-browser Legacy display mode is a different feature.

## Security and support boundary

The official Node12 platform table includes Windows 7 and later, but Node12 and
these operating systems are now **end-of-life**. This is a compatibility package,
not current upstream support. Do not expose it to the Internet. Use a trusted
isolated LAN; HTTPS is not a substitute for security patches. A public server
must use a modern OS/runtime. See [Node12 platform requirements](https://github.com/nodejs/node/blob/v12.22.12/BUILDING.md#supported-platforms)
and [Node EOL](https://nodejs.org/en/about/eol).

## Build isolation

`scripts/build-windows-legacy.js` runs on modern build Node with pinned esbuild
0.28.2. It bundles the existing server/domain modules into a package-root CommonJS
entry targeted at Node12.22, stripping `node:` from external builtin imports.
Only that generated entry loads two scoped compatibility shims: cryptographic
UUIDv4 using `crypto.randomBytes` and non-enumerable `Array.prototype.at`.
There is no alternate clock, estimator, sound policy, transition or Secondary server protocol.
All browser HTML, libraries, fonts and audio are copied unchanged. The root stays
the same for params/state/assets; build 416 and resource hashes remain compatible
with modern servers of the **same application build**. Do not pair different
application versions merely because their runtime versions differ.

The builder validates runtime version/architecture and required GUI/config/assets,
refuses to overwrite an existing package, and never deletes a shared dist tree.
Official Node ZIP and extracted binary SHA256 are checked against versioned
upstream sums by `scripts/get-windows-legacy-tools.ps1`. Microsoft .NET2 reference
assemblies 1.0.3 are build-only and checked against a pinned NuGet SHA512. Neither
esbuild, npm nor framework reference assemblies are required on the end device.

The GUI uses the same launcher source compiled with `FDV_LEGACY_WINDOWS` and CLR2
reference assemblies. A tiny build-only Dictionary-backed Add/Contains set
replaces its .NET3.5 HashSet dependency; UI invocation uses equivalent WinForms
MethodInvoker delegates. The .exe.config chooses installed CLR4 then CLR2 so
standard Windows 7 .NET3.5.1 and Windows 8 .NET4 installations need no modern .NET
download. If OS components are disabled/broken, the console BAT needs no .NET.
Legacy GUI never invokes NetTCPIP PowerShell cmdlets or kills another listener
by port; it stops its own tracked child. Port conflicts must be resolved explicitly.
The ordinary GUI keeps its existing behavior.

The GUI's **Create HTTPS certificate** button uses Windows CryptoAPI, not modern
PowerShell cmdlets or OpenSSL, and is compiled against CLR2 as well. Review IP/DNS
names, confirm replacement if needed, then separately accept or decline restart.
It creates a 365-day RSA2048/SHA256 self-signed certificate. `https/timer-cert.pfx`
is private; `timer-public.cer` is public for explicit device trust setup. A
read-only portable directory falls back to per-user LocalAppData storage. Managed
PFX takes priority over legacy root PEM/PFX. The modern BAT generator remains
omitted; console users can transfer suitable root certificates if no managed PFX
exists. No trust-store modification or TLS bypass is added. Secondary servers
also need explicit Node.js trust in both directions. See `launcher/windows/README.md`.

## Reproduce on a modern Windows build host

```powershell
npm ci
scripts/get-windows-legacy-tools.ps1 -OutputDirectory dist/legacy-tools -Architecture x64
launcher/windows/build-launcher.ps1 -OutputDirectory dist/legacy-launcher -LegacyReferenceDirectory dist/legacy-tools/net20/build/.NETFramework/v2.0
node scripts/build-standalone-html.js dist/legacy-standalone.html
node scripts/build-windows-legacy.js --version=local --arch=x64 --node-root=dist/legacy-tools/node-v12.22.12-win-x64 --launcher=dist/legacy-launcher/fdv-bouldering-timer.exe --standalone=dist/legacy-standalone.html --output=dist/legacy-packages
```

Repeat download/build for x86. Compress the complete package folder. Build tasks
in the release workflow publish both ZIPs in the ordinary release and include
them in SHA256SUMS; there is no Legacy MSI in this first implementation.

## Verification

Set `FDV_LEGACY_NODE` to the real official x86/x64 Node12 executable and run
`node --test test/windows-legacy.test.js` on the modern host. The test uses
isolated disposable fixtures, not the user's server. It verifies generated
syntax/runtime APIs, portable snapshot/list recovery, stable monotonic anchors
through calendar changes, and a mixed Node12/Node24 Secondary server pair with takeover.

Set `FDV_TEST_SERVER_NODE12` for Playwright `clock.spec.js secondary.spec.js`:
those six scenarios check initial measured-clock gating, preserved scheduled
Web Audio across wall-clock changes, per-screen/group transfer, role reversal,
the actual 20-second outage and rejoin without failback. Both native architectures
are tested by CI; the x64 matrix job also runs these browser cases.

This does **not** emulate Windows 7/8, its enabled CLR components, timer drivers,
firewall or speakers. Before competition use, test on real Win7 SP1/Win8/8.1:
GUI and console startup without installing modern .NET, short Cyrillic/ASCII
paths, occupied ports, LAN addresses, lists, scheduled starts/Final transitions,
pause/restart recovery, sustained multi-screen sound, HTTPS and mixed-runtime
Secondary server/rejoin. Inspect AUDIO/SYNC/NET and keep the server awake/powered.

Build425 optionally uses automatic native server audio for a modern browser on this computer. It needs PowerShell3+ and .NET Framework4+; the existing BAT/server can still run without them, retaining browser audio. Native asset decoding uses pinned NAudio1.10.0 net35. Compatibility smoke checks on Node12 x86/x64 under the current Windows host do not prove sound-device compatibility on physical Win7/Win8.
