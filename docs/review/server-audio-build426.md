# Build 426: native audio crackle investigation

The user reports intermittent crackle or interruptions within cues, more often START, in425;424 plays cleanly on the same computer/headphones. Native playback uses the separate C# Windows process, NAudio1.10 WaveOutEvent, 44.1kHz16-bit stereo PCM. The browser route is suppressed while delegated.

The425 output reserved only40ms in two20ms blocks on a normal ThreadPool callback. In an isolated silent hardware probe, injecting a45ms refill stall every30 callbacks produced9 drained-queue readings in6s. A three-buffer120ms trial produced0 under the same stall. A repeat against the final mixer also produced9 versus0; the new stream reported maximum refill gap90.63ms, maximum render time3.37ms and one active voice. These are real device-cursor/refill measurements with zero-valued PCM, not a recording of the user's audible fault or proof against every driver/load pattern.

Changes:

- Three40ms blocks reserve120ms. Cue placement still uses the queued-frame count and hardware playhead; canonical targets, clock-rate projection and per-browser correction are unchanged.
- PCM callbacks enqueue bounded diagnostic events. JSON serialization and pipe writes occur on the control thread outside the mixer lock, so a slow output reader cannot block PCM rendering.
- Existing keepalives collect refill counters for the opt-in server performance snapshot: buffer size/count, refill count, drained-queue count, maximum refill gap/render time and maximum actually simultaneous voices. No new polling loop.
- Full Stop/mute/release still resets the hardware queue before ACK. Selective break/Festival cancellation can retain at most120ms already submitted. The2500ms browser-fallback fence still exceeds the2200ms watchdog plus reserve.

Validation, current Windows host, 2026-10-23:

- Windows-compatible Node suite:464 cases,459 passed,5 opt-in/platform skips, no failures. POSIX release-shell and macOS launcher files were excluded on this Windows host; release-input verification runs separately.
-11 Chromium clock/native scenarios passed, including frozen-page playback, offset/mute/cancel and a new unlocked-visible-browser duplication test. The latter also passed in installed Brave: two native warning series completed, with no browser buffer, oscillator, HTMLAudio or speech submission and no local scheduled nodes.
- A device-free C# test invokes the actual PCM renderer and compares every START/WARN sample for both20ms and40ms blocks, including a cue inside a block and repeated submissions of the same key. Output is continuous and sample-exact, with one voice. The test opens no audio device.
- The opt-in silent Windows device test passed: deadline estimate within50ms, selective cancellation retaining START, full cancellation ACK, independent watchdog, and real MP3/WAV decoding without audible cues.
- Actual Node12.22.12 x64/x86 native smoke checks passed using zero-valued PCM plus real profile decoding.

The duplication and PCM tests did not reproduce overlapping browser/server playback. They do not inspect an existing user's open tabs or exclude another independently running timer. The evidence establishes a native buffer-starvation vulnerability and a tested remedy; audible confirmation on the user's output path remains necessary. No live server restart, release publication or Git commit was performed. Existing guide images remain current because there is no control/layout change.
