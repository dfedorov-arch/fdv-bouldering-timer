"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
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

async function fixture(t, platform, { liveClocks = false } = {}) {
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
  for (const name of ["serve-bouldering-timer.js", "params.txt", "index.html", "legacy.html"]) {
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }
  for (const name of ["lib", "fonts", "beeps"]) {
    fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true });
  }
  const framePath = path.join(directory, "clock-frame.json");
  const frame = (wall, mono = wall, uptime = Math.floor(wall / 1000) * 1000) => {
    const nextFramePath = path.join(directory, "clock-frame-next.json");
    fs.writeFileSync(nextFramePath, JSON.stringify({ wall, mono, uptime }));
    fs.renameSync(nextFramePath, framePath);
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
    const nativeNow = performance.now.bind(performance);
    const origin = nativeNow();
    let currentFrame = null;
    const frame = () => {
      // All clock sources in one synchronous server turn see the same frame.
      // Parent updates must not manufacture mixed-frame continuity anomalies.
      if (!currentFrame) {
        currentFrame = JSON.parse(fs.readFileSync(${JSON.stringify(framePath)}, "utf8"));
        queueMicrotask(() => { currentFrame = null; });
      }
      const value = currentFrame;
      const elapsed = ${JSON.stringify(liveClocks)} ? nativeNow() - origin : 0;
      return { wall: value.wall + elapsed, mono: value.mono + elapsed, uptime: value.uptime + elapsed };
    };
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


module.exports = { fixture, clockOrigin };

