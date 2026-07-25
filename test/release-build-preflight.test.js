"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const buildScript = path.join(projectRoot, "scripts", "build-portable-releases.sh");

function cleanLauncherEnvironment() {
  const environment = { ...process.env };
  for (const name of [
    "WINDOWS_LAUNCHER_EXE",
    "MACOS_LAUNCHER_ARM64",
    "MACOS_LAUNCHER_X64",
    "LINUX_LAUNCHER_ARM64",
    "LINUX_LAUNCHER_X64"
  ]) {
    delete environment[name];
  }
  return environment;
}

test("release packaging fails before downloads when GUI launchers are missing", () => {
  const result = spawnSync("bash", [buildScript, "test-build", "--preflight-only"], {
    cwd: projectRoot,
    env: cleanLauncherEnvironment(),
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required launcher variable is not set: WINDOWS_LAUNCHER_EXE/);
  assert.match(result.stderr, /Release packaging requires the GUI launcher for every selected target/);
  assert.doesNotMatch(result.stdout + result.stderr, /Downloading node-/);
});

test("incomplete local packaging requires an explicit option", () => {
  const result = spawnSync("bash", [
    buildScript,
    "test-build",
    "--without-launchers",
    "--preflight-only"
  ], {
    cwd: projectRoot,
    env: cleanLauncherEnvironment(),
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Launcher check skipped by explicit --without-launchers mode/);
  assert.match(result.stdout, /Portable release preflight passed/);
});

test("targeted packaging requires only the selected platform launcher", () => {
  const environment = cleanLauncherEnvironment();
  environment.MACOS_LAUNCHER_ARM64 = projectRoot;
  const result = spawnSync("bash", [
    buildScript,
    "test-build",
    "--target=macos-arm64",
    "--preflight-only"
  ], {
    cwd: projectRoot,
    env: environment,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Portable release preflight passed/);
  assert.doesNotMatch(result.stderr, /WINDOWS_LAUNCHER_EXE|MACOS_LAUNCHER_X64|LINUX_LAUNCHER/);
});

test("targeted packaging rejects an unknown platform", () => {
  const result = spawnSync("bash", [
    buildScript,
    "test-build",
    "--target=plan9-x64",
    "--preflight-only"
  ], {
    cwd: projectRoot,
    env: cleanLauncherEnvironment(),
    encoding: "utf8"
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown build target: plan9-x64/);
});
