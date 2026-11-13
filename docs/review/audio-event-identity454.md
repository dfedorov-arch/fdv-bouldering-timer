# Stable audio event identities (build 454)

The Win7 browser export 127.0.0.1-1794476022235.txt records repeat START
fallbacks about two seconds apart. Targets for one run changed from
1794476012075.372 through 1794476012078.017 to 1794476012111.701.
Timestamp-based keys and a ten-millisecond handled-target tolerance allowed
clock refinements to be mistaken for new cues. The 250 ms watchdog alone was
not the cause.

The server assigns audioRunId with a cryptographic UUID when a timer action
sets a new playback anchor. It is public, persisted with timer state and copied
by Secondary replication and early-return recovery. Old running snapshots get
an ID on restore. New starts/resumes/seeks have new playback identities; clock
measurements do not. No change to countdown timing or audio lead is introduced.

Browser START, minute, warning (including its remaining-second slot), boundary
and preliminary-minute keys use the stable identity. Standalone/older servers
retain a local anchor fallback. Scheduled keys reserve events; retained audio
nodes preserve the reservation during rescheduling. Playback start marks
the played ledger. Buffer retries reject both played and queued events, and
the manual watchdog leaves a queued source alone. Rejected fallback playback
releases its reservation without marking the event handled. Existing three-
second manual recovery and other cue-specific grace windows remain.

Native cue planning uses the same server playback identity, independently of
target time and offset. Native recent-start detection uses that identity too.
Independent hosts/channels retain the previously chosen sound-first fallback
policy; an unconfirmed native failure is not proof that a cue was heard.

Regression coverage includes 3 ms/40 ms browser clock refinements before and
after START, a subsequent legitimate start, native identity/offset refinement,
replication and early return, audio-offset edits and expired audio recovery.
