# Paired settings layout — build 450

Sound and signal settings use two equal columns with independent captions and aligned 20px checkbox slots. Long settings remain full width. Without a primary, the main sound option spans the row. RU/EN tooltips and accessible names retain the full sound descriptions. No command, delivery, timer, audio scheduling or persistence behavior changes.

Five existing Chromium scenarios pass: alignment without/with a primary across 240–400px panel widths, desktop/mobile layout in RU/EN (320–1920px viewports), positive break-sound alignment/toggle persistence, speaker keep-awake behavior, and break mute retaining its timer anchor/next-start target. Existing layout assertions were updated to the new design. Wide and 240px screenshots were visually inspected; the guide's sound-row, speaker-keep-awake and break-sound captures were refreshed. Sixty-three render-loop and standalone Node checks pass. Standalone HTML and Android HTML are regenerated; release inputs and whitespace checks pass.

The isolated dist/local-450 preview files are updated. No live timer was restarted; no installer/APK build, commit or push.
