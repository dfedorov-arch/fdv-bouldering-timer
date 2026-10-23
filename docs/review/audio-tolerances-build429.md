# Build429:10ms tolerances and sound-scheduler audit

At the user's request, both the native retained audio-anchor tolerance and browser technical warm/prewarm same-run tolerance are10ms inclusive. Native comparison stays relative to the retained anchor, so consecutive small samples cannot accumulate drift. Browser preparation compares with its captured anchor and also requires the same calendar target, generation, running phase and allowed lifecycle, including after async resume. Public timer clocks, correction values and PCM output remain unchanged.

Audit of production audio paths:

| Path | Temporal validation / result |
| --- | --- |
| Native generation/cue/preparation context |10ms inclusive; larger anchor change resets obsolete queue |
| Browser warm/prewarm |10ms inclusive for the same calendar target; no age-only expiration while current |
| Browser buffered WAV/MP3, synthetic fallback, HTMLAudio/gesture fallback and manual watchdog | Shared cue lateness windows:WARN300ms, MINUTE/Festival2000ms, boundary/END1200ms, START1500ms, default500ms; no smaller-than10ms lateness cutoff |
| Browser scheduler callbacks |35ms early rearm threshold;20ms warning-separation guard |
| Native PCM cues | Same300/1200/1500/2000ms lateness rules;120ms reserve,2200ms watchdog |
| Festival speech fallback |2000ms event lateness plus normal permission/generation checks |
| Browser perf4 keepalive experiment |35ms immediate-start window /1000ms lateness; phase/request identity gates |
| Browser audio-health recovery |250ms audio-clock discrepancy /3000ms JS-gap threshold |
| Joining/recovery with future-only planning | Strict future/past boundary: a new already-past cue is not replayed, even if only slightly past. This is the existing no-backlog policy, not a tolerance for cancelling an already-planned cue; unchanged |
| Standalone HTML and Android standalone | Generated from the same modern scheduler; no independent smaller tolerance |
| Legacy browser | Silent, no audio scheduler |

No additional jitter-based invalidation or already-planned cue lateness tolerance below10ms was found in these paths. Strict future-only planning and PCM buffer/sample boundaries remain as described above. Small values of other types remain intentionally unchanged:1ms rounding for event identities,5ms user-adjustment steps,6ms synthetic tone attack, gain coefficients,44.1kHz sample resolution, and exact discrete run/calendar/phase/generation identities. The8ms display-boundary guard and clock-rate estimator thresholds are not sound-event cancellation tolerances and were not changed. This audit does not assert that all timing/network/driver failures are excluded.

Validation on the current Windows host,2026-10-23:

-32 focused coordinator/prewarm cases passed. Native boundary cases exercise both directions,10ms inclusive,10.25ms rejection, cumulative drift and Stop reset. Browser cases exercise both directions,10ms inclusive,10.25ms rejection and a changed calendar identity.
-Windows-compatible Node suite:468 cases,463 passed,5 opt-in/platform skips, no failures. POSIX release-shell and macOS-launcher files are excluded on this host.
-Browser regressions cover early hidden preparation and scheduled-start MINUTE in browser Classic/Final and native Classic/Festival/Final, including saved correction and no duplicate event.

No controls/layout changed; existing guide captures remain current. No live server restart, Git commit or publication.
