# Additional and empty rotations in all three formats

18 November 2026, develop, build456. This extends the existing New Final A/R
implementation; no version bump, commit, push or release was requested.

## Behavior

- Old Final disables individual route Pause and allows exactly one athlete in
  each extra rotation. Permanent route Stop and global timer Pause remain.
- Classic defaults to shared flow. Each block chooses a front-of-flow slot or
  an immediate repeat on the assigned boulder after its specified rotation.
  The actual repeat cycle is shown for every athlete in the saved summary.
- Classic's separate **Only one athlete climbs** checkbox defaults off. When
  enabled, the authoritative server stops the ordinary flow at the selected
  boundary and stages an exclusive attempt. Start runs it; the following Start
  restores the saved ordinary coordinate, duration and break settings.
- Empty rotations work in Classic, Old Final and New Final. The selected list
  receives a virtual numbered row, data-column dashes and route dash shapes
  using the pause-marker color. Canonical athletes, indexes and list rows are
  not changed. Classic gaps propagate through the flow; Final gaps use a separate
  ordinary-duration one-shot attempt without advancing the ordinary counter.
- Save/Cancel remain per block; completed records can be edited or removed.
  Rewind re-arms future exclusive attempts; forward Classic seeks skip earlier
  ones. Editing an old exclusive record cannot move a running clock backwards.

## Timing and display

`lib/rotation-slots.js` is an ES5 projection shared by Modern and Legacy.
`attemptCycles` supplies shifted ordinary schedules without modifying canonical
athlete references. Virtual rows are separate from normal exclusion controls.
Different selected start cues at the same actual coordinate are grouped; zero
offset uses the ordinary rotation-start cue. Delayed starts use the existing
three-second deadline and a saved resume floor. Common minute/five-second/finish
cues and quiet warm-ups stay in the existing planners.

The server stages exclusive Classic attempts independently of browsers. Its
boundary timer is re-armed when the queue changes. Pending regular starts beyond
the stop boundary are omitted. An already submitted boundary END is preserved
through native staging. Snapshots, SEC and standalone carry the ordinary resume
coordinate; standalone also saves natural A/R completion before page reload.
Ordinary Classic runs with no extra slots retain the prior render invalidation
behavior. New slot markers invalidate only when their preparation/start state
changes, alongside ordinary cycle/phase changes.

## Verification

- Complete Linux Node suite in WSL: **654 cases, 642 passed, 12 platform/opt-in
  skips, zero failures**.
- Chromium on Windows: **46 distinct scenarios passed** across New Final A/R,
  Classic/Old Final/empty slots, manual-start audio, quiet prewarm, round changes,
  Playbook scheduling and standalone. Two dialog scenarios were rechecked after
  the final layout adjustment; RU/EN screenshots were inspected and refreshed.
- Actual bundled Windows Node12 child servers: **31 A/R and slot cases passed**,
  including persistence and Classic SEC takeover with a nonzero resume coordinate.
- Targeted native-audio/slot suite: **67 passed**, including preserving the
  submitted regular boundary END and independent SEC placement/resume fields.
- Standalone regenerated; release-input verification and whitespace checks pass.

Evidence logs and additional screenshots are local under
`dist/final-playbook-audit/slots-*`. The separate owner test launcher was not
restarted or updated during this change. Published packages remain unchanged.
