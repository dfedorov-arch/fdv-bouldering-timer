# New Final start lists — Playbook 2026, build456

Reference: the owner's Operations Playbook: Boulder Final, INTERNAL V1,
February 2026, Appendix 1, PDF pages 11–13 (printed pages 9–11), and General,
printed page 2. The supplied guide's nine-starter illustration is labelled
Figure 4 despite being referenced as Figure 5 in the prose.

`lib/start-list-display.js` is the shared ES5 implementation used by Modern,
Legacy and Node. With four boulders and no DNS, eight starters have route
offsets 0/4/8/12 (20 rotations); nine have 0/4/9/13 (22 rotations). For ten or
more, the generalization uses alternate gaps floor(N/2) and ceil(N/2), so the
third route never overlaps the preceding two. The guide specifies the maximum
of two active athletes for these larger fields, without an explicit table for
every N. The implementation extends its nine-starter pattern accordingly.

DNS uses the existing persisted excluded-participant indexes, interpreted
only in New Final as original starting slots. Those rows display DNS. Other
participants are not compacted; incident anchors stay in physical row indexes.
Classic and Old Final retain their previous exclusion/rebasing behavior.

Nominal slots and actual rotations are distinct. Only completely unoccupied
nominal slots are removed from the stage, and remaining slots map to continuous
actual rotation numbers. DNS starter3 removes nominal rotation3: starter4 then
climbs on the third actual Start; nominal rotation5 is actual rotation4. The
DNS holes on subsequent boulders are retained while another athlete occupies
the FOP. DNS starter5 instead removes nominal rotation17; rotations5–16 keep
their original schedule. Both examples have 19 actual rotations. Multiple DNS
entries use the same occupancy rule and never add empty rotations.

The server publishes derived `startListFinalSkippedRotations` independently of
which lists a client receives. It is calculated from all canonical lists so a
slot occupied in another list is not removed. The metadata contains only slot
numbers, is content-cached and needs no new persistent/replication field.
Standalone computes the same mapping from its local canonical lists. No timer
anchor, audio identity, counter increment, manual Start/Stop or seek semantics
change: `startListFinalCycle` counts actual rotations as before. Incident menus,
previews and scrolling use the same physical participant indexes and schedule;
Legacy refreshes caches when the format or global mapping changes.

Rest is now automatic. The obsolete `final_rest_rotations` value remains in
params/snapshots for compatibility but is not applied to New Final or exposed
by the parameter editor. The browser rest input is hidden; its DOM/state
compatibility remains. Route count should be four, and the operator supplies
rows in the reverse ranking order specified by the guide. Rows are not silently
reversed: an imported list may already be in starting order. DNS describes a
non-starter on the first boulder; an athlete unable to climb a later boulder
remains in the schedule and can continue on the next one.

The change concerns start-list scheduling. Operational instructions about
gates, brushing, jury decisions and the end-of-rotation 20-second threshold
remain matters for the competition officials; this is not an automatic judging
or athlete-finish detection system. Technical incident overrides retain their
existing manual behavior.

Verification is recorded in ignored `dist/final-playbook-audit`. The new unit
suite compares all 32/36 entries of the eight/nine-starter tables, checks the
two DNS examples, all 255 nonempty subsets of an eight-person field and fields
8–100 for nonempty rotations/maximum two athletes. Server checks cover Start,
Stop, seek, persistence and unchanged clock anchors. Browser checks cover
Modern/Legacy DNS, restoration and nine starters, plus standalone reload.
No running owner server or installed release is updated automatically.

Validation on 18 November 2026:

- Full Node24 Linux suite: 621 cases, 609 passed, 12 platform/opt-in skips,
  no failures. A current isolated source snapshot used local Linux dependencies;
  the operator's source checkout, processes and user preferences were retained.
- Chromium: 28 passed across Playbook, Final format-switch and manual-start/audio
  suites, including partial-list metadata, restoration, continuous rotation3,
  no clock-anchor changes and standalone reload. Modern and Legacy screenshots
  of the DNS example were visually inspected.
- Native Windows/CLR2 launcher/update tests: 8 passed, none skipped. Linux
  headless settings RU/EN passed separately in WSL. The old rest parameter is
  preserved byte-for-byte on no-op saves and retained on real edits.
- Release-input/build consistency and Git whitespace checks passed. Source
  changes are local develop456, with no tag, push, package replacement or
  restart of the existing test455 instance.

Reference PDF SHA256:
`F4BF1B357FD2EC8C5D0A6F156E35510E335E74181114EF6C774DB8382D8F928B`.
