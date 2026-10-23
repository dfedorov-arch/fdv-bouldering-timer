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

async function fixture(t, platform, { liveClocks = false, legacyRuntime = process.env.FDV_TEST_SERVER_NODE12 || null, listenHost = "127.0.0.1", launcherToken = "", nativeAudioStub = false, nativeAudioDisabled = true, integerWallClock = false, nativeAudioCoordinatorSource = null } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-clock-continuity-"));
  let child = null;
  const stop = async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
        child.once("exit", () => { clearTimeout(timeout); resolve(); });
        child.kill("SIGTERM");
      });
    }
  };
  t.after(async () => { await stop(); fs.rmSync(directory, { recursive: true, force: true }); });
  for (const name of ["serve-bouldering-timer.js", "params.txt", "index.html", "legacy.html"]) {
    fs.copyFileSync(path.join(root, name), path.join(directory, name));
  }
  for (const name of ["lib", "fonts", "beeps"]) {
    fs.cpSync(path.join(root, name), path.join(directory, name), { recursive: true });
  }
  // Optional comparison source affects only this disposable test server.
  if(nativeAudioCoordinatorSource)fs.copyFileSync(nativeAudioCoordinatorSource,path.join(directory,"lib/server-audio.js"));
  // Browser-audio regression tests must not silently switch to a real Windows
  // device. Disable only the disposable copy, including bundled Node12 servers.
  if(nativeAudioDisabled && !nativeAudioStub){
    const nativePath=path.join(directory,"lib/server-audio-native.js");
    const original=fs.readFileSync(nativePath,"utf8");
    const disabled=original.replace('get supported(){return ', 'get supported(){return false && ');
    assert.notEqual(disabled,original);fs.writeFileSync(nativePath,disabled);
  }
  if (legacyRuntime) await require("../../scripts/build-windows-legacy").buildServer(directory);
  const framePath = path.join(directory, "clock-frame.json");
  const frame = (wall, mono = wall, uptime = Math.floor(wall / 1000) * 1000) => {
    const nextFramePath = path.join(directory, "clock-frame-next.json");
    fs.writeFileSync(nextFramePath, JSON.stringify({ wall, mono, uptime }));
    fs.renameSync(nextFramePath, framePath);
  };
  frame(0);
  const preloadPath = path.join(directory, "controlled-clock.cjs");
  const nativeAudioLog = path.join(directory,"native-audio.jsonl");
  // Inject clocks into a disposable child process, never into the production
  // server or the test runner. Native timers and sockets continue to run normally.
  fs.writeFileSync(preloadPath, `
    const fs = require("fs");
    const os = require("os");
    const { performance } = require("perf_hooks");
    ${legacyRuntime ? "" : `const storage = require(${JSON.stringify(path.join(directory, "lib", "runtime-state-storage.js"))});
    const hostPlatform = process.platform;
    const originalStoragePlan = storage.runtimeStateStoragePlan;
    storage.runtimeStateStoragePlan = (root, options = {}) => originalStoragePlan(root, { ...options, platform: hostPlatform });`}
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
    if (${Boolean(platform)}) {
      Date.now = () => ${clockOrigin} + (${integerWallClock} ? Math.floor(frame().wall) : frame().wall);
      Object.defineProperty(performance, "now", { value: () => 10000 + frame().mono });
      os.uptime = () => 1000 + frame().uptime / 1000;
    }
    ${nativeAudioStub ? `const record = value => fs.appendFileSync(${JSON.stringify(nativeAudioLog)},JSON.stringify(value)+"\\n");
    require(${JSON.stringify(path.join(directory,"lib/server-audio-native.js"))}).NativeAudio = class {
      constructor(){this.supported=true;this.timers=[];this.played=new Set();this.generation="";this.onEvent=()=>{};}
      async prepare(){record({stage:"prepare"});}
      async stop(){for(const timer of this.timers)clearTimeout(timer);this.timers=[];record({stage:"stop"});}
      async replace(cues,generation,now,rate=1){
        for(const timer of this.timers)clearTimeout(timer);this.timers=[];
        if(this.generation!==generation){this.played.clear();this.generation=generation;}
        record({stage:"plan",cues,generation,now});
        for(const cue of cues)if(!this.played.has(cue.key))this.timers.push(setTimeout(()=>{
          if(this.played.has(cue.key))return;this.played.add(cue.key);record({stage:"played",...cue});this.onEvent({stage:"played",key:cue.key,kind:cue.kind,lateness:0});
        },Math.max(0,(cue.at-now)/rate)));
      }
      async cancel(){} async keepalive(){} async close(){await this.stop();}
      fail(){this.supported=false;this.stop();if(this.onFailure)this.onFailure("stub-failure");}
    };` : ""}
    if (${Boolean(platform)}) Object.defineProperty(process, "platform", { value: ${JSON.stringify(platform)} });
  `);
  const port = await freePort();
  const output = [];
  function launch() {
  child = spawn(legacyRuntime || process.execPath, [...(platform || nativeAudioStub ? ["--require", preloadPath] : []), path.join(directory, "serve-bouldering-timer.js")], {
    cwd: directory,
    env: { ...process.env, HOST: listenHost, PORT: String(port), HTTPS_PORT: "0", FDV_LAUNCHER_LANGUAGE_TOKEN: launcherToken },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => output.push(data.toString()));
  child.stderr.on("data", (data) => output.push(data.toString()));
  }
  launch();
  const baseUrl = `http://127.0.0.1:${port}`;
  const state = async () => {
    const response = await fetch(`${baseUrl}/api/state?diagnostics=1`, { signal: AbortSignal.timeout(1000) });
    assert.equal(response.status, 200);
    return response.json();
  };
  async function ready() {
  const deadline = Date.now() + 5000;
  while (true) {
    try { await state(); break; } catch (error) {
      if (Date.now() >= deadline || child.exitCode !== null) throw new Error(`${error.message}\n${output.join("")}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  }
  await ready();
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
  return { frame, state, action, start, snapshot, output, baseUrl, stop,
    nativeEvents: () => fs.existsSync(nativeAudioLog) ? fs.readFileSync(nativeAudioLog,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)) : [],
    restart: async () => { await stop(); launch(); await ready(); } };
}


module.exports = { fixture, clockOrigin };

