# Additional New Final rotations (local develop456)

The operator requested a manual extra-rotation queue for technical incidents and
appeals. This is a judge-operated scheduling tool, not an automatic decision
about entitlements under the competition rules. Unlike the supplied guides'
single-athlete examples, the owner explicitly permits multiple athletes on
different routes in one extra rotation.

The + control sits immediately before the first route button, in the preceding
data header so table column indexes and sizing remain intact. It is available
only to the primary operator (or standalone), only in New Final. The dialog
supports independently saved/cancelled blocks, editable summaries, separate athlete times and
route assignments. Every start-signal flag defaults off. At most one athlete
occupies a route in a list and an athlete can use only one route in each block.
Assigned times use separate minutes/seconds spinners and must be positive and
no longer than the current ordinary round setting. Zero in
"after rotation" means before the first regular rotation. Otherwise the default
is the current ordinary rotation, or the last completed one while idle.

`lib/final-appeals.js` is an ES5 shared domain module for Node, Modern,
standalone and Legacy. The authoritative state stores the ordered queue,
active ID, ordinary settings saved during an extra attempt, and a resumed-cue
floor. These fields follow the existing snapshot and SEC state transfer.
New action `finalAppeals` has the existing primary authentication, runtime
version conflict protection and command-ID handling. Structural list changes
and DNS changes that invalidate pending assignments are rejected. Completed,
paused and unstarted attempts can be edited or removed. Only an actually running
A/R is protected from clock/audio changes; its Edit control remains available.
Changing a paused attempt restages it from zero, while changing another record
preserves the pause coordinate. Legacy has no editor.

Start and Stop use the existing timer transition, monotonic clock, scheduled
countdown and manual-start path. The A/R duration is the maximum assigned time;
all athletes finish together. A shorter attempt starts when that many seconds
remain. The ordinary rotation counter does not advance for A/R. On the next
Start (or Stop after an attempt) the next queued extra attempt at that anchor
is staged; otherwise ordinary settings and the next ordinary rotation resume.
Multiple extras at the same anchor follow dialog order. A newly staged attempt
does not start the clock automatically.

Audio integration is deliberately limited:

- Existing quiet warm-ups, 600 ms server manual-start lead, final waiting
  warm-up repetition, minute cue, last five seconds and finish scheduler remain
  shared with ordinary attempts. A silent start still warms the output.
- A/R gates the initial start cue on an explicitly selected offset-zero flag.
  Recovery, watchdog, phase-entry and future-start fallback paths use that gate.
- Optional later starts use the existing buffered scheduler and native plan.
  Equal offsets produce one cue. Each later cue uses the plan ID, offset and
  audio run ID, and a maximum 3-second late window. No thirty-second replay.
- A/R resume retains the run ID and suppresses all optional start offsets at
  or before the saved paused elapsed time. Later starts remain scheduled.
- Finish phase identity includes the extra rotation ID, preventing one extra
  attempt's finish marker from suppressing the next at the same ordinary anchor.
- Future queue edits are absent from the native audio configuration signature,
  so editing a future assignment does not reset or cut the current PCM queue.
- Existing playback permissions, explicit mute, native/browser selection,
  recovery, audio correction and authority fencing still apply. Optional starts
  may coincide with common warnings if the judge assigns those exact times.

During the preceding ordinary rotation, preparation markers select the first
queued A/R rather than the ordinary athletes it delays. Current climbing
markers remain. During an A/R, preparation selects the next queued extra or
ordinary rotation. Modern and Legacy show A/R instead of advancing the ordinary
number; assigned athletes become active at their individual offsets.
Legacy forces one full marker refresh when entering or leaving A/R, then
retains the existing fast path for ordinary rotations. Standalone embeds the
same modules and saves queue/progress across reload.

New Final route-pause creation/resumption is disabled with an explanatory
tooltip and rejected at the server boundary. Permanent stop/cancel-stop remain
available. New Final permanent stops persist across ordinary/extra starts and
stops until explicitly changed; obsolete pause records are cleared at start/reset.
Classic and Old Final retain their clearing
behavior. Global timer Pause remains available. Seeking a running or paused
A/R is disabled so configured athlete windows cannot diverge from the common
timer; a completed or unstarted staged A/R permits ordinary rotation selection.

The editor follow-up replaces the text plus with the same centered CSS cross
used by Add list, in the normal text color. Block titles, number inputs and
Remove buttons share a control height. Each block owns Save/Cancel; saved blocks
collapse into summaries with Edit/Remove, while empty new blocks disappear.
Only one block is edited at once, and Add rotation is hidden during editing.
The cap and error message follow the current ordinary draft rather than the
staged A/R duration or a fixed hour. Modern reads that draft from its live input
model; the server independently validates its normalized settings.

Completed records remain editable/removable. Seeking backwards re-arms future
extras, and loading an older snapshot reconciles obsolete completion flags
without changing clocks or an active attempt. An edited paused/completed A/R
is restaged from zero; editing a different block preserves its current pause
coordinate. A/R finish phase deduplication now includes the execution identity,
allowing the same saved record to be replayed with one finish per execution.

Verification covers domain/API validation, manual and scheduled countdowns,
counter transitions, edits and locking, persistence, SEC takeover, native
queue continuity, cue deduplication and deadlines. Chromium covers actual
Modern/Legacy state and markers, opt-in signals on two audible test contexts,
two consecutive extra attempts, pause/resume, common finish/warnings and an
offline standalone reload. The baseline Final/Classic/Festival audio and
prewarm regression suites are also run. Evidence is kept in ignored
`dist/final-playbook-audit`. No owner server is restarted, no packages replaced,
and no commit/push/release is performed by this change.

Final validation on 18 November 2026:

- Full Node24 Linux suite on the final isolated source copy: 634 cases,
  622 passed, 12 platform/opt-in skips, zero failures.
- Chromium: 35 distinct scenarios across additional rotations, Final format
  switching, manual-start/audio and Playbook lists passed. The seven A/R
  scenarios include scheduled waiting and offline standalone persistence;
  three final UI/return-to-ordinary smoke checks passed after the last changes.
- Actual Node12 Windows child servers: all 12 A/R cases passed. The five
  existing Windows Legacy compatibility cases, including both mixed-runtime
  encrypted SEC directions, also passed with the official Node12 x64 runtime.
- Existing VM regression harnesses load the real new domain dependency;
  132 targeted cases passed. They continue to exercise the original clock,
  warning, warm-up, resume and boundary functions.
- Russian and English dialog screenshots were visually inspected and copied
  into the guide. Standalone was regenerated. Release-input verification and
  Git whitespace checks passed; the application build remains456.

Editor follow-up validation, 18 November 2026:

- Final complete Linux Node suite: 640 cases, 628 passed, 12 platform/opt-in
  skips and zero failures. Actual Node12 Windows child servers: 18 A/R cases
  passed. Existing clock/display/audio VM regression checks: 102 passed.
- Chromium: 38 distinct scenarios passed across A/R, Playbook, Final format
  switching and manual audio/prewarm regression. The ten A/R scenarios include
  independent block save/cancel/empty removal, aligned controls, numeric spinner
  input, settings changed from three to five minutes, preparation at rotation10
  in Modern/Legacy, completed Edit/Remove, replayed finish identity and standalone
  persistence. Updated RU/EN dialog screenshots were visually inspected.
- Build remains456. Release-input and whitespace verification passed. Runtime
  deployment to the owner's separate test copy is recorded in the handoff.

The following header alignment correction replaces the floated + control with
a flex row containing the last data-column label and button. A Chromium geometry
check confirms that data-header text centers differ by less than1.5px; the
corresponding editor scenario and62 Node render checks pass. The test copy's HTML
was updated without restarting the timer server. Existing tabs need a reload.
