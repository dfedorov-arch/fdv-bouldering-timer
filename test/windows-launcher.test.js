"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

test("Windows launcher reloads settings and links on every server restart", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "launcher", "windows", "FdvBoulderingTimerLauncher.cs"),
    "utf8"
  );
  const startServer = source.slice(
    source.indexOf("private void StartServer"),
    source.indexOf("private void CheckServerReady")
  );
  assert.match(startServer, /_settings = LauncherSettings\.Load\(_baseDirectory\)/);
  assert.match(startServer, /_hasHttps = HasHttpsCertificate\(\)/);
  assert.match(startServer, /PopulateAddresses\(\)/);
});

test("Windows launcher refreshes network links from debounced system events", () => {
  const source = fs.readFileSync(
    path.join(projectRoot, "launcher", "windows", "FdvBoulderingTimerLauncher.cs"),
    "utf8"
  );
  assert.match(source, /NetworkChange\.NetworkAddressChanged \+= OnNetworkAddressChanged/);
  assert.match(source, /_networkRefreshTimer\.Interval = 750/);
  assert.match(source, /_networkRefreshTimer\.Tick \+= RefreshNetworkAddresses/);
  assert.match(source, /NetworkChange\.NetworkAddressChanged -= OnNetworkAddressChanged/);
});
