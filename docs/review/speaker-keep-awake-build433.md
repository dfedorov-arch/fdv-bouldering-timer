# Speaker quiet interval default — build433

The default interval is now180 seconds instead of60, consistently in params.txt, server fallback and the shared browser/native planner. Explicit params values still take precedence. Current RU/EN guide and quick-start examples are updated. Tone gain/frequency/duration, quiet priority guards, timer clocks and correction are unchanged. UI is unchanged; build432 captures are retained.

Validation:33 focused planner/coordinator/server persistence tests pass, including180-second boundaries, quiet playback while paused, work priority and default config. Three Chromium cases pass: real browser quiet oscillator/work cancellation and offline single/Android HTML preference restoration. Standalone/offline assets are regenerated through the standard scripts; release-input checks pass. No live server restart or publication.
