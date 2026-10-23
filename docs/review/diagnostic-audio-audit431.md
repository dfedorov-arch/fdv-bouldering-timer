# Diagnostic sound isolation audit — build431

Audit only; no product changes or new build.

Diagnostic commands do not change timerState.version, the timer anchor, saved audio correction or native generation. During active rotation/break playback, the UI disables testing and the server/native coordinator also reject it. During scheduled-start waiting, testing remains permitted.

Confirmed gap: diagnostic previews have no exclusion window or priority separation from upcoming work cues. Both types enter the same native queue under distinct keys. In the browser, diagnostic buffers have an empty work signal key but can coexist with work nodes. Thus the canonical schedule is retained, yet diagnostic audio can overlap work audio. Native PCM sums voices and clamps output, so coincident signals can mask/distort each other; no physical recording was made.

Controlled reproduction uses the real native coordinator and extracted browser source functions with mocked audio nodes. Script: ../.codex-test-temp/audit-diagnostic-audio431.cjs relative to the repository. All four checks pass:

- Native pending start164000, now100000, correction-250: pending MINUTE remains at103750 and a diagnostic START can also be queued at103750. Generation and original cue objects/times remain unchanged; no Stop.
- Native pending start164000, now162200, standard diagnostic lead1800 and correction-250: work START and diagnostic START both target163750. Both may start before the nominal anchor due to correction; hiding the test buttons at the nominal start cannot prevent this collision.
- Native active rotation: diagnostic command ignored, existing queue unchanged.
- Browser playBuffer/beep/scheduleDiagnosticSound: work MINUTE and diagnostic START both produce nodes at the same audio-clock target; original node is not cancelled and audioScheduleGeneration stays unchanged.

Existing server-audio tests pass28/28. These checks demonstrate planning/mixing eligibility, not acoustic timing on physical devices. Previously scheduled tests can also outlast the moment the UI becomes disabled, particularly with long profile samples.

Proposed follow-up: explicitly identify diagnostic nodes/voices, reject tests whose playback span conflicts with a work cue (using actual profile durations and preview correction), and give work cues priority over already queued/playing diagnostics. Cancellation must target diagnostics only. Retain allowed testing during long scheduled-start waits and the current correction preview behavior.
