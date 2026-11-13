# Windows launcher appearance — build454

The Windows launcher now follows the Linux/macOS launcher palette, Arial
typography, spacing and button treatment. It retains WinForms and the CLR2
build used by Windows 7/8 packages. The application build remains 454.

LauncherTheme.cs supplies the common form font/colors and rounded flat Button
painting for the main window, PIN dialog and certificate dialog. Native Button
behavior and accessibility remain inherited. Hover, press, keyboard focus and
disabled appearance have explicit palettes; disabled certificate controls retain
their contrasting text. Both main action rows use the same height and 8px gaps.
The PIN layout uses a table to retain wrapping and control bounds after scaling.
Main-window addresses use padded owner-drawn rows; partially visible row text is
not painted. A footer explains hide-on-close and explicit exit, as on Linux.

The manifest declares system DPI awareness and forms use AutoScaleMode.Dpi,
following [Microsoft's manifest guidance](https://learn.microsoft.com/en-us/windows/win32/hidpi/setting-the-default-dpi-awareness-for-a-process)
and [WinForms scaling guidance](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/automatic-scaling-in-windows-forms).
This is system awareness, not per-monitor V2. Native window decorations and
scrollbars remain OS controls. Layout corrects native ListBox/Label double
scaling and keeps the build number aligned after automatic scaling.

## Validation

The 11 focused Windows-launcher, certificate and update-checker tests passed.
The passive native harness checked RU/EN on modern and CLR2-reference builds,
default/minimum bounds, button caption clearance, both action rows, address/PIN
overlap, footer/update-notice clearance, language persistence, and unchanged
server processes/timers. Main/PIN/certificate images were visually inspected.
The actual desktop GUI checks ran at this host's 150% scaling; Button painting
also checked normal/hover/pressed/disabled states on 96/120/144-DPI bitmaps.
Bitmap checks are not physical GUI runs on three display configurations.

Certificate tests generated only temporary fixtures and checked replacement,
restart consent, disabled rendering, key ACLs and absence of automatic trust
changes. The temporary executable cleanup uses asynchronous retries for delayed
Windows handle release. The native tests require explicit opt-in and CryptoAPI
access outside the restricted test context. They did not operate the owner's
running launcher or timer. CLR2-reference builds were run on Windows 10; a
physical Windows 7 system was not used here.

```powershell
$env:FDV_TEST_WINDOWS_CERTIFICATES='1'
$env:FDV_NET20_REFERENCES='<.NET 2.0 reference directory>'
node --test test/windows-launcher.test.js test/https-certificate.test.js test/launcher-updates.test.js
```

Current guide Windows images are passive captures of these controls, with test
addresses. Two updated portable test archives are in
dist/build-454-windows-theme/artifacts. Linux/macOS archives from the previous
autonomous-audio build remain applicable. Server/timer/audio scheduling code was
not changed by this visual follow-up.
