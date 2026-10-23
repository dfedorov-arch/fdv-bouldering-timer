# Sound row alignment and compact captions — build434

Without a primary, the sound checkbox uses the common35px right column and its label fills the row. With a primary, the checkbox remains beside the caption, now with10px spacing and a20px slot. Narrow/medium rows show “Звук в основном” / “Sound in primary”; rows at least321px wide use the full caption. The full caption is always available as the label tooltip and checkbox accessible name. The other-browser caption retains its full tooltip.

CSS inline-size container queries use actual option-row width, including desktop narrow sidebars and browser zoom. The compact caption is the fallback where container queries are unsupported. No work/technical audio, correction or timer-clock behavior changes. The180-second default is retained.

Validation: a native browser test checks RU/EN, no-primary and primary roles, option widths240/280/340/400, right-column alignment, at least9.5px caption spacing, single-line labels and contained checkbox geometry. The existing column test checks320/393/1024/1280 viewports. Offline single and Android HTML restore preferences; the existing speaker priority scenario passes. Five distinct Chromium scenarios and49 focused Node clock/audio/flash/diagnostic checks pass. Current captures were inspected. Standalone/offline generation and release-input verification pass.

![Compact row,240px](../../help-assets/sound-row-240.png)

![Full row,340px](../../help-assets/sound-row-340.png)

Windows previews reuse the430 launcher, reading434 dynamically. No live restart, commit or publication.
