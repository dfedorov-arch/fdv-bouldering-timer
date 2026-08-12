"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

test("macOS server keeps loopback separate from local-network listeners", () => {
  const source = fs.readFileSync(path.join(projectRoot, "serve-bouldering-timer.js"), "utf8");
  assert.match(source, /process\.platform === "darwin"/);
  assert.match(source, /\["127\.0\.0\.1", \.\.\.localNetworkAddresses\(\)\]/);
  assert.match(source, /configuredHost[^\n]+return \[configuredHost\]/);
});

test("macOS launcher actively requests local-network access after loopback is ready", () => {
  const source = fs.readFileSync(path.join(projectRoot, "launcher", "unix", "Program.cs"), "utf8");
  assert.match(source, /_ = RequestLocalNetworkAccess\(\);/);
  assert.match(source, /favicon\.ico\?launcher-local-network-probe=1/);
  assert.match(source, /Server is running locally; local-network access is blocked/);
  assert.match(source, /Privacy & Security > Local Network/);
});
