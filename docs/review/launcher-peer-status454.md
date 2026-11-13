# Launcher peer availability — build454

The launcher previously displayed the configured role and URL without observing
whether the paired server was still reachable. A stopped standby therefore
continued to appear connected.

`GET /api/state` now supplies `X-FDV-Secondary-Available` from the existing
`sec.sourceConnected` contact threshold (2 seconds). The existing role and URL
headers retain their effective-role behavior during takeover. No peer network
requests, timer changes or extra launcher polling were added.

Windows (including CLR2/Win7) and the shared Linux/macOS launcher report the
unreachable peer with its URL and a yellow running-status line. The local server
remains running. Recovery restores healthy wording and green status. Pair
removal clears peer text. Standby launchers report an unavailable primary in the
same way. Older servers missing the header yield configured-standby wording,
without falsely asserting connectivity. RU and EN are covered.

## Validation

- `node --test test/windows-launcher.test.js test/secondary-server.test.js`:
  25 passed, none skipped. Native Windows and CLR2-reference harnesses checked
  both languages, warning/recovery colors, metadata removal and older metadata.
  They ran on Windows 10; physical Windows 7 was not tested.
- A real disposable primary/standby pair was configured, its standby stopped,
  restarted and unpaired. Modern and Legacy state responses reflected the loss;
  timer version and canonical start anchor stayed unchanged on peer loss.
- The Avalonia headless harness compiled for Linux x64 and ran in WSL in
  `peer-status` mode. It checked both languages, connected/lost/recovered peers,
  tray text, old metadata, pairing removal and unchanged launcher lifecycle.
  This exercises the shared Linux/macOS implementation, without a physical Mac.

Artifacts and logs from these checks are in `dist/peer-status454`. Working owner
servers were not restarted or modified. Build remains 454. Existing archives
have not been rebuilt for this follow-up; both server and launcher need the
updated source for availability reporting.
