# Documentation refresh — build454

Updated 2026-11-12 on develop. The application build remains **454**. This is a
local documentation refresh; it does not publish a release or rebuild archives.

## Current documentation

The RU/EN guide, README, plain-text quick reference and Windows, Windows 7/8,
Linux and macOS instructions describe the current launcher controls, update
notification, PIN, server-role status, paired settings grid, per-display digit
stretching, audio preparation/recovery and standby behavior. Current defaults:

```ini
timer_vertical_stretch=false
timer_vertical_stretch_max_percent=200
```

The guide distinguishes SEC setup-border health from browser-card routing,
documents 2-second cutover and the 20-second return window, and gives the actual
audio correction range, −750…+250 ms. Architecture and performance documentation
describe stable audio event identity and immediate browser fallback. Previous
build investigations and release history remain historical evidence.

## Screenshot sources

All 38 referenced UI screenshots were captured from the current source. The
launcher icon is retained. Three additional illustrations are now referenced:
Windows RU/EN and the English sound-profile selector. Old JPEG data stored under
PNG filenames in audio-offset, audio-test and sound-profile were replaced with
actual PNG captures.

| Assets in help-assets | Capture source |
| --- | --- |
| audio-offset[-en], audio-test[-en], sound-profile[-en], server-audio[-en] | native-audio.spec.js, “local native route retains…”; real Chromium controls, simulated native backend |
| limited-control[-en], break-warning-option[-en], sound-row-wide-ru/en, speaker-keep-awake-ru/en | controls.spec.js: limited controls, break mute, independent captions and speaker keep-awake |
| command-delivery[-en] | command-delivery.spec.js, operator receipt scenario |
| initial-clock-sync | clock.spec.js, initial SSE before measured calibration |
| secondary-server, secondary-disconnect-blocked | secondary.spec.js, isolated paired servers and a screen routed to standby |
| timer-stretch-ru/en | timer-stretch.spec.js, Modern per-screen stretching; the selected run also checks Legacy |
| final-completed, list-screen-cycle, first-route-pause, ordered-route-pauses, stop-supersedes-pause, restored-route-pause, bounded-route-pause, route-resume-preparation, legacy-phone-columns | layout.spec.js: completion, list display, route-incident and 393px Legacy scenarios |
| route-count-save-failed | layout.spec.js, retained input after a simulated save failure |
| server-launcher-unified-ru/en, server-launcher-linux | Unix passive headless render harness, build454; Linux image uses the same RU rendering |
| server-launcher-windows-ru/en | Windows passive harness; RU includes paired-primary status, EN shows the ordinary running state |

Browser tests write most guide captures directly. Nine layout attachments are
copied to the guide names listed above. Launcher captures use real controls with
test state and addresses; no operator timer is started, stopped or paired.
Linux/macOS share Avalonia source, but the headless image is not a photograph of
native macOS window decorations. The Windows harness exercises modern and CLR2
launchers on this Windows host, not a physical Windows 7 installation.

## Reproduction and validation

Use a writable disposable TEMP/TMP directory on Windows. Browser tests run with
the pinned Playwright Chromium from package-lock.json and isolated server copies:

```powershell
node node_modules/@playwright/test/cli.js test --config test/visual/playwright.config.js --grep 'CTRL exposes|break mute is shared|speaker keep-awake uses|sound row aligns|independent sound captions|operator shows clear receipts|local native route retains|Secondary disconnect reports|SEC pairs without|per-screen vertical stretch fills|new screen does not display|Route-count save failure'
node node_modules/@playwright/test/cli.js test --config test/visual/playwright.config.js layout.spec.js --grep 'Modern completed Final uses default|Modern list screen shows a read-only cycle at 962|Modern first-route pause|Modern stop at 17|Modern earlier planned pause|Modern prepares the paused wave|Legacy phone intrinsic columns: 393px, 1 lists'
```

The 20 selected browser scenarios passed, including reruns of the affected
native-audio and disconnect cases. The disconnect test uses distinct probe
identities when checking that independently queued test nodes survive language
changes; it does not bypass production event deduplication.

The opted-in native RU/EN Windows launcher test passed for both runtime variants.
The Unix harness checked aligned first/second button rows at default and minimum
width in both languages. The passive render build uses:

```powershell
dotnet publish test/helpers/unix-launcher/Harness.csproj -c Release -r linux-x64 --self-contained true -p:UsedAvaloniaProducts= -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

Run its `Harness render <isolated-root> <output.png> ru|en [min]` mode under Linux
or WSL. Keep its extraction/state directories separate from the operator's app.

All 39 referenced PNGs decode successfully, and both guide languages at desktop
1440px and mobile 390px have no broken images, missing section anchors or page
overflow. The project landing page also passes desktop/mobile width checks, and its RU/EN guide links resolve in the GitHub Pages layout. Contact sheets were visually reviewed. Mobile guide fixes keep tables
and shell examples scrollable, allow long inline names to wrap, and close two
previously unterminated application-name spans. These affect help.html only.

Generated standalone/Android HTML was refreshed, and release-input verification
passed for build454. Generated files are not manual documentation sources.
Browser/backend readiness assertions cannot establish physical speaker output.
