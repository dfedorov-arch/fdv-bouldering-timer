# Build428: requested50ms native anchor tolerance

The user explicitly requested a larger native audio-anchor tolerance. AUDIO_ANCHOR_TOLERANCE_MS is now50; deviations of50ms inclusive from the retained accepted anchor do not replace the native queue. The accepted reference is not moved by samples inside that range, so consecutive small steps cannot accumulate an unbounded shift. A deviation greater than50ms accepts a new anchor. Stop clears the reference as before. Timer clocks, browser implementation, offsets and other generation/cancellation gates are unchanged.

Validation on Windows,2026-10-23:

-31 focused coordinator/prewarm tests passed. New cases cover both directions, successive10/30/50ms samples, rejection at50.25ms measured from the accepted reference and fresh acceptance after Stop.
-5 browser scenarios passed: existing browser-audio Classic/Final scheduled MINUTE checks and native Classic/Festival/Final integer-wall-clock checks, including-300ms correction and no duplicate warning.
-Build428 offline bundle and standalone outputs are generated normally. Release-input checks and modern/Legacy preview packaging include the same tested native coordinator; launcher/runtime/native-library binaries are unchanged.

Browser distinction: pending MINUTE identity is based on the calendar start, with scheduled/played-key deduplication. The browser's separate technical-prewarm guard accepts a sub-ms reprojection for the same calendar target and can discard stale preparation; it is not the native whole-queue signature/reset mechanism. Its implementation remains unchanged. There is no claim that all possible browser audio failures are excluded.

No UI/layout change; existing screenshots remain current. No live server restart, commit or release publication.
