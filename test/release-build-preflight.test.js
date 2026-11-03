"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
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

function createMacLauncherFixture({
  includePdb = false,
  includeTrayIcon = true
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-mac-launcher-test-"));
  const app = path.join(root, "FDV Bouldering Timer.app");
  const macos = path.join(app, "Contents", "MacOS");
  fs.mkdirSync(macos, { recursive: true });
  fs.writeFileSync(path.join(macos, "fdv-bouldering-timer"), "launcher");
  const resources = path.join(app, "Contents", "Resources");
  fs.mkdirSync(resources, { recursive: true });
  if (includeTrayIcon) fs.writeFileSync(path.join(resources, "timer-launcher.png"), "icon");
  fs.mkdirSync(path.join(root, "native-audio"));
  fs.writeFileSync(path.join(root, "native-audio", "fdv-audio-player"), "native-player");
  fs.writeFileSync(path.join(root, "native-audio", "NLAYER-LICENSE.txt"), "license");
  fs.writeFileSync(path.join(root, "native-audio", "README.md"), "readme");
  if (includePdb) fs.writeFileSync(path.join(macos, "fdv-bouldering-timer.pdb"), "symbols");
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), [
    "<plist><dict>",
    "<key>CFBundleVersion</key><string>2.1.1</string>",
    "</dict></plist>"
  ].join(""));
  return { root, app };
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
  const fixture = createMacLauncherFixture();
  const environment = cleanLauncherEnvironment();
  environment.MACOS_LAUNCHER_ARM64 = fixture.app;
  try {
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
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("macOS packaging rejects a missing or empty menu-bar icon before downloads", () => {
  const fixture = createMacLauncherFixture({ includeTrayIcon: false });
  const environment = cleanLauncherEnvironment();
  environment.MACOS_LAUNCHER_ARM64 = fixture.app;
  try {
    for (const emptyIcon of [false, true]) {
      if (emptyIcon) fs.writeFileSync(path.join(fixture.app, "Contents", "Resources", "timer-launcher.png"), "");
      const result = spawnSync("bash", [buildScript, "test-build", "--target=macos-arm64", "--preflight-only"], {
        cwd: projectRoot, env: environment, encoding: "utf8"
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Required macOS menu-bar icon was not found/);
      assert.doesNotMatch(result.stdout + result.stderr, /Downloading node-/);
    }
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("macOS packaging rejects debug symbols without requiring local-network discovery declarations", () => {
  const fixture = createMacLauncherFixture({ includePdb: true });
  const environment = cleanLauncherEnvironment();
  environment.MACOS_LAUNCHER_ARM64 = fixture.app;
  try {
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
    assert.equal(result.status, 1);
    assert.match(result.stderr, /debug symbols/);
    assert.doesNotMatch(result.stderr, /local network|Bonjour/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
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

test("Unix release packaging rejects a launcher without its native audio helper", () => {
  const fixture = createMacLauncherFixture();
  const environment = cleanLauncherEnvironment();
  environment.MACOS_LAUNCHER_ARM64 = fixture.app;
  fs.unlinkSync(path.join(fixture.root, "native-audio", "fdv-audio-player"));
  try {
    const result = spawnSync("bash", [buildScript, "test-build", "--target=macos-arm64", "--preflight-only"], {
      cwd: projectRoot, env: environment, encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Required native audio player was not found/);
    assert.doesNotMatch(result.stdout + result.stderr, /Downloading node-/);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});


test("macOS app signature survives an ordinary ZIP transfer without resource xattrs", {
  skip: process.platform !== "darwin" || !process.env.FDV_TEST_MACOS_APP_PATH
}, t => {
  const app = path.resolve(process.env.FDV_TEST_MACOS_APP_PATH);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-mac-signature-transfer-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const archive = path.join(directory, "app.zip"), extracted = path.join(directory, "extracted");
  const zipped = spawnSync("zip", ["-q", "-r", "-X", archive, path.basename(app)], {
    cwd: path.dirname(app), env: { ...process.env, COPYFILE_DISABLE: "1" }, encoding: "utf8", timeout: 60000
  });
  assert.equal(zipped.status, 0, zipped.error?.message || zipped.stderr);
  const unpacked = spawnSync("unzip", ["-q", archive, "-d", extracted], { encoding: "utf8", timeout: 60000 });
  assert.equal(unpacked.status, 0, unpacked.error?.message || unpacked.stderr);
  const restored = path.join(extracted, path.basename(app));
  assert.ok(fs.statSync(path.join(restored, "Contents", "Resources", "timer-launcher.png")).size > 0);
  assert.equal(fs.existsSync(path.join(restored, "Contents", "MacOS", "timer-launcher.png")), false);
  const checked = spawnSync("codesign", ["--verify", "--deep", "--strict", restored], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.error?.message || checked.stderr);
});
