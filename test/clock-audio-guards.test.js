"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const transport = require("../lib/client-action-transport");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = html.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

function audioHarness(pending = false) {
  const timers = [], played = new Set(), sounds = [];
  const context = vm.createContext({
    clockCalibrationPending: pending, audioScheduleGeneration: 0, pageAudioSuspended: false,
    document: { hidden: false }, state: { running: true }, signalsInvalidatedWhileHidden: false,
    playedSignalKeys: played, scheduledFinalSignalKey: "", manualStartWatchdogDelayMs: 250,
    canPlaySound: () => true, audioServerTime: value => value, serverNow: () => 100250,
    signalLateGraceMs: { start: 1500 }, performanceDiagnosticsLevel: 0,
    markSignalPlayed: key => played.add(key), beep: kind => sounds.push(kind), flash() {},
    recordPerformanceAudioSchedule() {},
    scheduleServerTimeoutAt: (target, callback, options) => timers.push({ target, callback, options }),
    scheduleBufferedSignalAt: () => { throw new Error("Pending clock must not schedule a warning"); },
    elapsedSeconds: () => 55, serverTimeForElapsed: value => value * 1000
  });
  vm.runInContext(["manualStartSignalKey", "scheduleManualStartWatchdog", "scheduleFinalWarnings"]
    .map(source).join("\n"), context);
  return { context, timers, played, sounds };
}

test("pending calibration neither arms manual-start watchdog nor consumes warning keys", () => {
  const h = audioHarness(true);
  h.context.scheduleManualStartWatchdog(100000);
  h.context.scheduleFinalWarnings({ cycle: 1, type: "rotation", start: 0, end: 60 });
  assert.equal(h.timers.length, 0);
  assert.equal(h.played.size, 0);
  assert.equal(h.context.scheduledFinalSignalKey, "");
});

test("an already armed watchdog cannot sound or consume a key while calibration is pending", () => {
  const h = audioHarness();
  h.context.scheduleManualStartWatchdog(100000);
  assert.equal(h.timers.length, 1);
  h.context.clockCalibrationPending = true;
  h.timers[0].callback();
  h.timers[0].options.onStale();
  assert.deepEqual(h.sounds, []);
  assert.equal(h.played.size, 0);
  h.context.clockCalibrationPending = false;
  h.timers[0].callback();
  assert.deepEqual(h.sounds, ["start"]);
});

test("timing-only responses adopt new server state but discard retired instances", () => {
  const applies = [], timings = [];
  const context = vm.createContext({
    window: { FDVClientActionTransport: transport },
    lastServerInstanceId: "server-b", lastServerVersion: 3,
    retiredServerInstanceIds: new Set(["server-a"]),
    applyServerState: (remote, options) => applies.push({ remote, options }),
    updateServerTiming: (remote, timing) => timings.push({ remote, timing })
  });
  vm.runInContext(source("applyServerTimingResponse"), context);
  const timing = { date0: 1, date1: 2, perf0: 1, perf1: 2 };
  context.applyServerTimingResponse({ serverInstanceId: "server-a", version: 99 }, timing);
  assert.equal(applies.length, 0);
  assert.equal(timings.length, 0);
  context.applyServerTimingResponse({ serverInstanceId: "server-b", version: 3 }, timing);
  assert.equal(timings.length, 1);
  context.applyServerTimingResponse({ serverInstanceId: "server-c", version: 1 }, timing);
  assert.equal(applies.length, 1);
  assert.equal(applies[0].remote.serverInstanceId, "server-c");
  assert.equal(applies[0].options.timing, timing);
  assert.equal(applies[0].options.rescheduleSignals, true);
});

test("new server identity invalidates calibration before audio can use the previous run's clock", () => {
  const invalidations = [];
  const context = vm.createContext({
    window: { FDVClientActionTransport: transport },
    lastServerInstanceId: "server-a", lastServerVersion: 7,
    retiredServerInstanceIds: new Set(), lastRemoteRunning: true,
    trustedServerClockAnchor: { serverAt: 100000 }, lastTrustedClockAnchorAt: 100000,
    performanceDiagnosticsEnabled: false,
    invalidateServerClockCalibration: reason => invalidations.push(reason)
  });
  vm.runInContext(source("reconcileServerStateIdentity"), context);
  context.reconcileServerStateIdentity({ serverInstanceId: "server-b", version: 1 });
  assert.deepEqual(invalidations, ["server-instance-change"]);
  assert.equal(context.lastServerInstanceId, "server-b");
  assert.equal(context.lastServerVersion, 0);
  assert.equal(context.retiredServerInstanceIds.has("server-a"), true);
  const old = context.reconcileServerStateIdentity({ serverInstanceId: "server-a", version: 999 });
  assert.equal(old.retired, true);
  assert.equal(context.lastServerInstanceId, "server-b");
  assert.equal(invalidations.length, 1);
});
