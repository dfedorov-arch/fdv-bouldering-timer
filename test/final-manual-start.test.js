"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = html.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

function harness({ oneShot = true, manual = true, hidden = false, pending = false,
  countdownOnly = false, running = true, future = true } = {}) {
  const plans = [];
  const segment = { cycle: 1, type: "rotation", start: 0, end: 240 };
  const context = vm.createContext({
    document: { hidden }, pageAudioSuspended: hidden, clockCalibrationPending: pending,
    state: { running, countdownOnly, serverStartedAt: future ? 100600 : 99000,
      manualStartDisplayHold: manual, activeSettings: { oneShot } },
    serverNow: () => 100000, performance: { now: () => 100000 },
    elapsedSeconds: () => future ? 0 : 1, getCurrentSegment: () => segment,
    isBeforeScheduledStart: () => future, clearSignalTimers() {}, clearStoppedTimerSignals() {},
    scheduleSegmentSignals() {}, schedulePendingStartMinute() {},
    scheduleRecentPhaseSignalAfterResume: () => false, recordPerformanceAudioClock() {},
    scheduleBufferedSignalAt: (current, target, kind) => plans.push({ current, target, kind })
  });
  const apply = source("applyServerState");
  const begin = apply.indexOf("if (options.replaceAudioSchedule) clearSignalTimers");
  const end = apply.indexOf("lastServerVersion =", begin);
  assert.ok(begin > 0 && end > begin);
  vm.runInContext(`
    let lastSegmentIndex = -1, signalsInvalidatedWhileHidden = false;
    function applyAudio() {
      const options = {rescheduleSignals:true,includePhaseSignal:false};
      const audioOffsetChanged = false, festivalAnnouncementsChanged = false, breakWarningsChanged = false;
      ${apply.slice(begin, end)}
    }
    ${source("rescheduleStandaloneSignals")}
  `, context);
  return { context, plans };
}

for (const mode of ["apply", "restore"]) {
  const run = h => mode === "apply" ? h.context.applyAudio() : h.context.rescheduleStandaloneSignals();
  test(`${mode}: manual Final start is planned on any client, without a local Start handler`, () => {
    const h = harness(); run(h);
    assert.equal(h.plans.length, 1);
    assert.equal(h.plans[0].kind, "start");
    assert.equal(h.plans[0].target, 100600);
  });
  test(`${mode}: scheduled Classic start retains its existing signal`, () => {
    const h = harness({ oneShot:false, manual:false }); run(h);
    assert.equal(h.plans.length, 1);
  });
  for (const options of [{ manual:false }, { countdownOnly:true }, { running:false },
    { hidden:true }, { pending:true }, { future:false }]) {
    test(`${mode}: Final does not synthesize a manual start for ${JSON.stringify(options)}`, () => {
      const h = harness(options); run(h);
      assert.equal(h.plans.length, 0);
    });
  }
}
