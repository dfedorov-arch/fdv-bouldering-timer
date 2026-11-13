# Secondary server behavior — build 454

Automatic cutover uses two deadlines: 2 seconds without primary contact to
begin using a calibrated reserve, and 20 seconds from the last primary contact
to allow automatic return. Successful reserve requests never extend that window.
XHR checks run every 500 ms, with the existing 1800 ms timeout. These deadlines
are thresholds; browser scheduling and network latency can add time.

When a reserve is available, the connection notice is yellow and distinguishes
switching from confirmed reserve contact. It expires at the original 20-second
deadline. A missing reserve retains the ordinary offline behavior. Modern and
Legacy displays use the same endpoint controller; Legacy remains silent.

An automatic promotion within the recovery window is provisional. The returning
primary is fenced while it imports the reserve's current clock, timer state,
browser sessions and applied command IDs through the authenticated encrypted
peer channel. The reserve validates a snapshot offer against the current state
version and session revision before acknowledging return. Intervening commands
cause a fresh offer. Lost commit acknowledgements are idempotent; a replay also
supplies the current reserve snapshot. An increasing returnSequence moves only
automatic failover clients back and survives a browser reload. Manual reserve
visits keep their existing behavior.

After 20 seconds, or for manual group takeover, the existing role reversal is
retained: the reserve keeps authority and the former primary rejoins as standby.
Monotonic provisional deadlines are not reused after a reserve process restart;
a promoted reserve retains authority in that case.

Only the SEC setup button beside PIN has green/red/yellow borders for pair
health and gray-white text that brightens on hover/focus like PIN. Browser diagnostics retain their previous
route colors: gray unavailable, dark green available, bright green connected
to the reserve. Tooltips describe routing actions.
Launcher state health headers include the effective role and peer address.
Windows, legacy Windows and Unix launchers reuse their existing health checks,
with RU/EN text; no new launcher polling loop is introduced.

Validation covers early and late return, two consecutive brief outages with a
running anchor, commands during an outage, stale recovery offers, lost commit
acknowledgement, session preservation and command deduplication. Chromium checks
cover modern and Legacy cutover, yellow warning expiry, SEC colors, retained
AudioContext, manual routing and diagnostics layout. Passive native Windows and
CLR 2.0 launcher checks cover role text, language changes and rendering. The
Unix launcher is cross-compiled for Linux x64.

Unix launcher layout: the PIN action now shares the same margins as its four
neighbors and has one click handler. The window starts at 920 px and has a
900 px minimum width so full Russian action labels fit on one row. Linux/WSL
headless renders check matching button heights, aligned row tops and 8 px gaps
in RU/EN at default and minimum size. macOS uses the same launcher source,
including the role and peer status text; a macOS desktop run was not performed.
