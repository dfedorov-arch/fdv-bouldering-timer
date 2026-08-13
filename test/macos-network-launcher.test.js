"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

test("macOS server keeps the proven wildcard listener used by working releases", () => {
  const source = fs.readFileSync(path.join(projectRoot, "serve-bouldering-timer.js"), "utf8");
  assert.match(source, /return \["0\.0\.0\.0"\]/);
  assert.match(source, /configuredHost[^\n]+return \[configuredHost\]/);
  assert.doesNotMatch(source, /\["127\.0\.0\.1", \.\.\.localNetworkAddresses\(\)\]/);
});

test("macOS launcher requests local-network access before waiting for server readiness", () => {
  const source = fs.readFileSync(path.join(projectRoot, "launcher", "unix", "Program.cs"), "utf8");
  const buildSource = fs.readFileSync(path.join(projectRoot, "launcher", "unix", "build-launcher.sh"), "utf8");
  const requestIndex = source.indexOf("_ = RequestLocalNetworkAccess();");
  const processStartIndex = source.indexOf("_serverProcess.Start();");
  const readinessIndex = source.indexOf("private async void CheckServerReady");
  assert.ok(requestIndex >= 0);
  assert.ok(requestIndex < processStartIndex);
  assert.ok(requestIndex < readinessIndex);
  assert.match(source, /DNSServiceBrowse/);
  assert.match(source, /_fdv-bouldering-timer\._tcp/);
  assert.match(source, /favicon\.ico\?launcher-local-network-probe=1/);
  assert.match(source, /Server is running locally; local-network access is blocked/);
  assert.match(source, /Privacy & Security > Local Network/);
  assert.match(buildSource, /<key>NSBonjourServices<\/key>/);
  assert.match(buildSource, /_fdv-bouldering-timer\._tcp/);
});

test("macOS launcher removes quarantine only from its bundled Node.js runtime", () => {
  const source = fs.readFileSync(path.join(projectRoot, "launcher", "unix", "Program.cs"), "utf8");
  assert.match(source, /RemovePortableRuntimeQuarantine\(nodePath\)/);
  assert.match(source, /Path\.Combine\(_baseDirectory, "runtime", "mac"\)/);
  assert.match(source, /Path\.GetRelativePath\(runtimeRoot/);
  assert.match(source, /RemoveExtendedAttribute\(path, "com\.apple\.quarantine", 0\)/);
  assert.doesNotMatch(source, /xattr[^\n]+_baseDirectory/);
});

test("macOS release preparation script clears quarantine and restores executable files", () => {
  const scriptPath = path.join(projectRoot, "prepare-timer-mac.command");
  const source = fs.readFileSync(scriptPath, "utf8");
  const buildSource = fs.readFileSync(path.join(projectRoot, "scripts", "build-portable-releases.sh"), "utf8");
  assert.notEqual(fs.statSync(scriptPath).mode & 0o111, 0);
  assert.match(source, /SCRIPT_DIR=/);
  assert.match(source, /xattr -dr com\.apple\.quarantine "\$SCRIPT_DIR"/);
  assert.match(source, /chmod \+x "\$APP_EXECUTABLE" "\$PORTABLE_NODE"/);
  assert.match(source, /xattr -p com\.apple\.quarantine "\$target"/);
  assert.match(buildSource, /cp "\$ROOT_DIR\/prepare-timer-mac\.command" "\$package\/"/);
  assert.match(buildSource, /chmod \+x "\$package\/prepare-timer-mac\.command"/);
});

test("launcher reloads settings on restart and refreshes addresses on network changes", () => {
  const source = fs.readFileSync(path.join(projectRoot, "launcher", "unix", "Program.cs"), "utf8");
  const startServer = source.slice(
    source.indexOf("private void StartServer"),
    source.indexOf("private string NodeNotFoundMessage")
  );
  assert.match(startServer, /_settings = LauncherSettings\.Load\(_baseDirectory\)/);
  assert.match(startServer, /_hasHttps = HasHttpsCertificate\(\)/);
  assert.match(startServer, /PopulateAddresses\(\)/);
  assert.match(source, /NetworkChange\.NetworkAddressChanged \+= OnNetworkAddressChanged/);
  assert.match(source, /Interval = TimeSpan\.FromMilliseconds\(750\)/);
  assert.match(source, /NetworkChange\.NetworkAddressChanged -= OnNetworkAddressChanged/);
});
