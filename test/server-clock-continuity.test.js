"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const clockOrigin = Date.UTC(2026, 9, 8, 12, 0, 0);

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function fixture(t, platform) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-clock-continuity-"));
  let child = null;
  t.after(async () => {
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
        child.once("exit", () => { clearTimeout(timeout); resolve(); });
        child.kill("SIGTERM");
      });
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const name of ["serve-bouldering-timer.js", "params.txt"]) {
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }
  for (const name of ["lib", "fonts", "beeps"]) {
    fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true });
  }
  const framePath = path.join(directory, "clock-frame.json");
  const frame = (wall, mono = wall, uptime = Math.floor(wall / 1000) * 1000) => {
    fs.writeFileSync(framePath, JSON.stringify({ wall, mono, uptime }));
  };
  frame(0);
  const preloadPath = path.join(directory, "controlled-clock.cjs");
  // Inject clocks into a disposable child process, never into the production
  // server or the test runner. Native timers and sockets continue to run normally.
  fs.writeFileSync(preloadPath, `
    const fs = require("node:fs");
    const os = require("node:os");
    const { performance } = require("node:perf_hooks");
    const storage = require(${JSON.stringify(path.join(directory, "lib", "runtime-state-storage.js"))});
    const hostPlatform = process.platform;
    const originalStoragePlan = storage.runtimeStateStoragePlan;
    storage.runtimeStateStoragePlan = (root, options = {}) => originalStoragePlan(root, { ...options, platform: hostPlatform });
    const frame = () => JSON.parse(fs.readFileSync(${JSON.stringify(framePath)}, "utf8"));
    Date.now = () => ${clockOrigin} + frame().wall;
    Object.defineProperty(performance, "now", { value: () => 10000 + frame().mono });
    os.uptime = () => 1000 + frame().uptime / 1000;
    Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
  `);
  const port = await freePort();
  const output = [];
  child = spawn(process.execPath, [...(platform ? ["--require", preloadPath] : []), path.join(directory, "serve-bouldering-timer.js")], {
    cwd: directory,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), HTTPS_PORT: String(await freePort()) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => output.push(data.toString()));
  child.stderr.on("data", (data) => output.push(data.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;
  const state = async () => {
    const response = await fetch(`${baseUrl}/api/state?diagnostics=1`, { signal: AbortSignal.timeout(1000) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const deadline = Date.now() + 5000;
  while (true) {
    try { await state(); break; } catch (error) {
      if (Date.now() >= deadline || child.exitCode !== null) throw new Error(`${error.message}\n${output.join("")}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  const action = async (body) => {
    const response = await fetch(`${baseUrl}/api/action`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "clock-test", ...body }), signal: AbortSignal.timeout(1000)
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const start = (options = {}) => action({ type: "start", startMode: "manual", startHours: "", startMinutes: "",
    activePreset: "classic", settings: { rotationSeconds: 60, breakSeconds: 15, oneShot: false }, ...options });
  const snapshot = () => JSON.parse(fs.readFileSync(path.join(directory, "runtime-state", "timer-state.json"), "utf8"));
  return { frame, state, action, start, snapshot, output, baseUrl };
}

test("native macOS clocks run without repairs on an isolated real server", { timeout: 15000 }, async (t) => {
  if (process.platform !== "darwin") return t.skip("Physical macOS clock check");
  const server = await fixture(t, null);
  const started = await server.start();
  const observedAt = performance.now();
  let maximumErrorMs = 0;
  for (let check = 0; check < 6; check += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const state = await server.state();
    const expected = started.elapsed + (performance.now() - observedAt) / 1000;
    maximumErrorMs = Math.max(maximumErrorMs, Math.abs(state.elapsed - expected) * 1000);
    assert.equal(state.version, started.version);
    assert.equal(state.clockDiagnostics.continuityAnomalyCount, 0);
    assert.equal(state.clockDiagnostics.current.status, "neutral");
  }
  assert.ok(maximumErrorMs < 250, `elapsed divergence ${maximumErrorMs.toFixed(3)} ms`);
  assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
  t.diagnostic(`native-clock elapsed divergence <= ${maximumErrorMs.toFixed(3)} ms`);
});

test("macOS integer uptime leaves elapsed and version unchanged during an ordinary run and sleep", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "darwin");
  const started = await server.start();
  let mono = 0;
  for (let check = 0; check < 40; check += 1) {
    mono += check % 2 ? 3650.25 : 2350.75;
    server.frame(mono);
    const state = await server.state();
    assert.ok(Math.abs(state.elapsed - mono / 1000) < 0.001);
    assert.equal(state.startedAt, started.startedAt);
    assert.equal(state.version, started.version);
    assert.equal(state.clockDiagnostics.continuityAnomalyCount, 0);
  }
  mono += 120000;
  server.frame(mono);
  const afterSleep = await server.state();
  assert.ok(Math.abs(afterSleep.elapsed - mono / 1000) < 0.001);
  assert.equal(afterSleep.version, started.version);
  assert.equal(afterSleep.clockDiagnostics.current.monotonicIncludesSleep, true);
  assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
});

test("a confirmed sleep advances across a rotation, broadcasts and saves exactly one correction", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "linux");
  const started = await server.start({ elapsedBeforePause: 58 });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${server.baseUrl}/api/events?clientId=clock-screen`, { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let events = "";
  const nextState = async () => {
    while (true) {
      const boundary = events.indexOf("\n\n");
      if (boundary >= 0) {
        const block = events.slice(0, boundary);
        events = events.slice(boundary + 2);
        if (block.startsWith("event: state")) return JSON.parse(block.split("\ndata: ")[1]);
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("SSE closed before the correction");
      events += decoder.decode(chunk.value, { stream: true });
    }
  };
  await nextState();
  server.frame(63240, 3240, 63000);
  const restored = await server.state();
  assert.equal(restored.elapsed, 121.24);
  assert.equal(Math.floor(restored.elapsed / 75) + 1, 2);
  assert.equal(restored.version, started.version + 1);
  assert.equal(restored.clockDiagnostics.current.reason, "suspension-repaired");
  assert.equal(restored.clockDiagnostics.history[0].correctionMs, 60000);
  assert.equal((await nextState()).elapsed, 121.24);
  controller.abort();
  const saved = server.snapshot();
  assert.equal(saved.runningElapsedAtSave, 121.24);
  assert.equal(saved.timerState.version, restored.version);
  server.frame(66480, 6480, 66000);
  const later = await server.state();
  assert.equal(later.elapsed, 124.48);
  assert.equal(later.version, restored.version);
  assert.equal(later.clockDiagnostics.continuityAnomalyCount, 1);
  assert.equal((server.output.join("").match(/FDV_SERVER_CLOCK_REPAIR /g) || []).length, 1);
  server.frame(96480, 36480, 96000);
  assert.equal((await server.state()).clockDiagnostics.current.status, "neutral");
});

test("system clock steps preserve elapsed and allow pause on macOS, Windows and Linux", { timeout: 20000 }, async (t) => {
  for (const platform of ["darwin", "win32", "linux"]) {
    for (const adjustment of [-120000, 120000]) {
      const server = await fixture(t, platform);
      const started = await server.start();
      // A wall-clock step must be handled even before the normal 3 s check.
      server.frame(500 + adjustment, 500, 0);
      const stepped = await server.state();
      assert.equal(stepped.elapsed, 0.5, platform);
      assert.equal(stepped.startedAt, clockOrigin + adjustment);
      assert.equal(stepped.clockDiagnostics.current.reason, "wall-clock-adjustment");
      assert.equal(stepped.clockDiagnostics.history[0].correctionMs, 0);
      assert.equal(stepped.version, started.version + 1);
      server.frame(6480 + adjustment, 6480, 6000);
      const paused = await server.action({ type: "pause" });
      assert.equal(paused.running, false);
      assert.equal(paused.elapsed, 6.48);
      assert.equal(server.output.join("").includes("FDV_SERVER_CLOCK_REPAIR"), false);
    }
  }
});

test("ambiguous sleep and system clock changes do not move the timer or latch SYNC", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "linux");
  const started = await server.start();
  server.frame(123240, 3240, 63000);
  const ambiguous = await server.state();
  assert.equal(ambiguous.elapsed, 3.24);
  assert.equal(ambiguous.version, started.version);
  assert.equal(ambiguous.clockDiagnostics.current.status, "bad");
  server.frame(126480, 6480, 66000);
  const stable = await server.state();
  assert.equal(stable.elapsed, 6.48);
  assert.equal(stable.clockDiagnostics.current.status, "neutral");
  assert.equal(stable.clockDiagnostics.continuityAnomalyCount, 1);
});

test("a confirmed sleep completes a one-shot timer and saves its final duration", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "win32");
  await server.start({ activePreset: "final", settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true } });
  server.frame(63240, 3240, 63000);
  const completed = await server.state();
  assert.equal(completed.running, false);
  assert.equal(completed.completed, true);
  assert.equal(completed.elapsed, 60);
  assert.equal((await server.state()).version, completed.version);
  assert.equal(server.snapshot().timerState.completed, true);
  assert.equal(server.snapshot().runningElapsedAtSave, 60);
});

test("future scheduled starts keep their wall target when system time changes", { timeout: 15000 }, async (t) => {
  const server = await fixture(t, "darwin");
  const scheduledTime = new Date(clockOrigin + 60000);
  const started = await server.start({ startMode: "scheduled",
    startHours: scheduledTime.getHours(), startMinutes: scheduledTime.getMinutes() });
  assert.equal(started.startedAt, clockOrigin + 60000);
  server.frame(30000);
  assert.equal((await server.state()).elapsed, 0);
  server.frame(-87000, 33000, 33000);
  const waiting = await server.state();
  assert.equal(waiting.startedAt, started.startedAt);
  assert.equal(waiting.elapsed, 0);
  server.frame(60000, 36000, 36000);
  assert.equal((await server.state()).elapsed, 0);
  server.frame(63240, 39240, 39000);
  const running = await server.state();
  assert.equal(running.elapsed, 3.24);
  assert.equal(running.startedAt, started.startedAt);
  assert.equal(running.version, started.version);
  assert.equal(running.clockDiagnostics.continuityAnomalyCount, 0);
});
