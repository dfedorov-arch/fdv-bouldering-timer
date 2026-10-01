"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { INSTALL_MARKER, runtimeStateStoragePlan, prepareRuntimeStateStorage } = require("../lib/runtime-state-storage");

test("installed packages use per-user storage even in a custom installation directory", () => {
  const installedFiles = { existsSync: (file) => file.endsWith(INSTALL_MARKER) };
  const cases = [
    { platform: "win32", root: "D:\\Timer", homeDirectory: "C:\\Users\\Operator",
      environment: { LOCALAPPDATA: "C:\\Users\\Operator\\AppData\\Local" },
      expected: "C:\\Users\\Operator\\AppData\\Local\\FDV Bouldering Timer\\runtime-state" },
    { platform: "darwin", root: "/Applications/FDV Bouldering Timer", homeDirectory: "/Users/operator",
      environment: {}, expected: "/Users/operator/Library/Application Support/FDV Bouldering Timer/runtime-state" },
    { platform: "linux", root: "/opt/fdv-bouldering-timer", homeDirectory: "/home/operator",
      environment: { XDG_STATE_HOME: "/data/state" }, expected: "/data/state/fdv-bouldering-timer/runtime-state" }
  ];
  for (const { root, expected, ...options } of cases) {
    const plan = runtimeStateStoragePlan(root, { ...options, fileSystem: installedFiles });
    assert.equal(plan.installed, true);
    assert.equal(plan.directory, expected);
  }
});

test("a portable directory is not classified as installed by its name or location", () => {
  const plan = runtimeStateStoragePlan("C:\\Program Files\\FDV Bouldering Timer", {
    platform: "win32", environment: {}, homeDirectory: "C:\\Users\\Operator",
    fileSystem: { existsSync: () => false }
  });
  assert.equal(plan.installed, false);
  assert.equal(plan.directory, "C:\\Program Files\\FDV Bouldering Timer\\runtime-state");
  assert.equal(plan.userDirectory, "C:\\Users\\Operator\\AppData\\Local\\FDV Bouldering Timer\\runtime-state");
});

test("Linux ignores a relative XDG_STATE_HOME", () => {
  const plan = runtimeStateStoragePlan("/opt/timer", { platform: "linux", environment: { XDG_STATE_HOME: "relative" },
    homeDirectory: "/home/operator", fileSystem: { existsSync: () => true } });
  assert.equal(plan.directory, "/home/operator/.local/state/fdv-bouldering-timer/runtime-state");
});

test("portable write probes leave no files and snapshots remain beside the application", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-state-storage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plan = runtimeStateStoragePlan(root);
  const prepared = prepareRuntimeStateStorage(plan);
  assert.equal(prepared.directory, path.join(root, "runtime-state"));
  assert.equal(prepared.usedFallback, false);
  assert.deepEqual(fs.readdirSync(prepared.directory), []);
});

test("old unmarked or read-only packages fall back once on both mkdir and file-write permission failures", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-state-fallback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const code of ["EPERM", "EACCES", "EROFS"]) {
    for (const operation of ["mkdirSync", "openSync"]) {
      const plan = { installed: false, directory: path.join(root, "protected"), userDirectory: path.join(root, code, operation) };
      let deniedAttempts = 0;
      const fileSystem = Object.create(fs);
      fileSystem[operation] = (target, ...args) => {
        if (target === plan.directory || path.dirname(target) === plan.directory) {
          deniedAttempts += 1;
          throw Object.assign(new Error("Access denied"), { code });
        }
        return fs[operation](target, ...args);
      };
      const prepared = prepareRuntimeStateStorage(plan, fileSystem);
      assert.equal(prepared.directory, plan.userDirectory);
      assert.equal(prepared.usedFallback, true);
      assert.equal(prepared.installed, false);
      assert.equal(deniedAttempts, 1);
      assert.deepEqual(fs.readdirSync(prepared.directory), []);
    }
  }
});

test("other filesystem errors and unwritable user storage are not silently treated as portable", () => {
  const fail = (code) => ({ mkdirSync: () => { throw Object.assign(new Error("Cannot write"), { code }); } });
  const plan = { installed: false, directory: "/application/runtime-state", userDirectory: "/user/runtime-state" };
  assert.throws(() => prepareRuntimeStateStorage(plan, fail("ENOSPC")), { code: "ENOSPC" });
  assert.throws(() => prepareRuntimeStateStorage({ ...plan, installed: true }, fail("EACCES")), { code: "EACCES" });
});
