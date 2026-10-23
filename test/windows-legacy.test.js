"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { buildServer } = require("../scripts/build-windows-legacy");
const { fixture, clockOrigin } = require("./helpers/controlled-clock-server");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("legacy compatibility is opt-in and does not replace clock/audio or browser assets", async t => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-node12-build-"));
  t.after(() => fs.rmSync(destination, { recursive: true, force: true }));
  await buildServer(destination);
  const bundle = fs.readFileSync(path.join(destination, "serve-bouldering-timer.js"), "utf8");
  assert.doesNotMatch(bundle, /require\(["']node:/);
  assert.match(bundle, /Node\.js 12 is end-of-life/);
  assert.match(bundle, /assessClockContinuity/);
  assert.match(bundle, /createReplicaClock/);
  assert.equal(fs.existsSync(path.join(destination, "index.html")), false);
  assert.doesNotMatch(read("serve-bouldering-timer.js"), /windows-legacy\/runtime|end-of-life/);
  assert.doesNotMatch(read("compat/windows-legacy/start-timer-win.bat"), /powershell|Get-Net|Stop-Process|taskkill/i);
  assert.match(read("compat/windows-legacy/launcher.exe.config"), /v4\.0[\s\S]*v2\.0\.50727/);
  assert.match(read("launcher/windows/build-launcher.ps1"), /nostdlib\+[\s\S]*FDV_LEGACY_WINDOWS/);
  const workflow = read(".github/workflows/release.yml");
  assert.match(workflow, /windows-legacy:[\s\S]*arch: \[x86, x64\]/);
  assert.match(workflow, /FDV_LEGACY_NODE/);
  assert.match(workflow, /FDV_TEST_SERVER_NODE12/);
  assert.match(workflow, /pattern: "windows-legacy-\*"/);
  assert.match(read("ReadMe-windows-legacy.txt"), /изолированной[\s\S]*Не открывайте/);
});

test("Node12-only shims generate secure UUIDv4 and preserve Array.at semantics", () => {
  const context = vm.createContext({ require: name => {
    assert.equal(name, "crypto");
    return { randomBytes: require("node:crypto").randomBytes };
  }, console: { warn() {} } });
  vm.runInContext("Array.prototype.at = undefined;", context);
  vm.runInContext(read("compat/windows-legacy/runtime.cjs"), context);
  assert.match(vm.runInContext("crypto.randomUUID()", context), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(vm.runInContext("[10,20,30].at(-1)", context), 30);
  assert.equal(vm.runInContext("[10,20,30].at(1.9)", context), 20);
  assert.equal(vm.runInContext("[10,20,30].at(Infinity)", context), undefined);
  assert.equal(vm.runInContext("Array.prototype.at.call({0:'a',length:1},0)", context), "a");
  assert.equal(vm.runInContext("Object.keys(Array.prototype).includes('at')", context), false);
});

const runtime = process.env.FDV_LEGACY_NODE;
test("actual Node12 server preserves clocks, lists, snapshots and mixed-runtime SEC", { timeout: 30000 }, async t => {
  if (!runtime) return t.skip("Set FDV_LEGACY_NODE to an official Node12 executable; CI tests x86 and x64");
  const probe = spawnSync(runtime, ["-p", "process.versions.node"], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), "12.22.12");
  const legacy = await fixture(t, "win32", { legacyRuntime: runtime });
  await legacy.action({ type: "primary", primaryClientId: "clock-test" });
  await legacy.action({ type: "startLists", startLists: [{ headers: ["#", "ФИО"], rows: [["1", "Участник"]], routeCount: 5 }] });
  await legacy.start();
  legacy.frame(5000);
  const before = await legacy.state();
  assert.equal(before.running, true);
  assert.equal(before.startLists[0].rows[0][1], "Участник");
  legacy.frame(125000, 5000, 5000);
  const after = await legacy.state();
  assert.equal(after.timerClock.startedAt, before.timerClock.startedAt);
  assert.equal(after.version, before.version);
  assert.equal(after.timerClock.now, before.timerClock.now);
  await legacy.action({ type: "pause" });
  const paused = await legacy.state();
  await legacy.restart();
  const restored = await legacy.state();
  assert.equal(restored.running, false);
  assert.equal(restored.elapsedBeforePause, paused.elapsedBeforePause);
  assert.equal(restored.startLists[0].rows[0][1], "Участник");

  await legacy.action({ type: "reset" });
  await legacy.start({ activePreset: "final", settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true } });
  legacy.frame(190000, 70000, 70000);
  const completed = await legacy.state();
  assert.equal(completed.completed, true);
  assert.equal(completed.running, false);
  assert.equal(completed.elapsed, 60);

  const scheduled = await fixture(t, "win32", { legacyRuntime: runtime });
  const target = new Date(clockOrigin + 60000);
  const waiting = await scheduled.start({ startMode: "scheduled", startHours: target.getHours(), startMinutes: target.getMinutes() });
  assert.equal(waiting.startedAt, clockOrigin + 60000);
  scheduled.frame(30000);
  assert.equal((await scheduled.state()).elapsed, 0);
  scheduled.frame(65000);
  assert.equal((await scheduled.state()).elapsed, 5);

  const modern = await fixture(t, null);
  const setup = await fetch(legacy.baseUrl + "/api/sec/configure", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "clock-test", address: modern.baseUrl }) });
  assert.equal(setup.status, 200, await setup.clone().text());
  const deadline = Date.now() + 6000;
  let secondary;
  do {
    secondary = await modern.state();
    if (secondary.sec?.ready) break;
    await new Promise(resolve => setTimeout(resolve, 40));
  } while (Date.now() < deadline);
  assert.equal(secondary.sec.ready, true);
  assert.equal(secondary.startLists[0].rows[0][1], "Участник");
  const promote = await fetch(legacy.baseUrl + "/api/sec/switch", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "clock-test", targetClientId: "clock-test" }) });
  assert.equal(promote.status, 200, await promote.clone().text());
  assert.equal((await modern.state()).sec.switchAll, true);
});
