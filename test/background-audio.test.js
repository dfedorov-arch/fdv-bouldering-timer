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

// Exercise production health decisions with independent JS and audio clocks.
function harness() {
  let perf = 10000, audio = 10, resolveResume, rejectResume;
  const effects = { clears: [], schedules: [], sync: [], logs: [], resumes: 0 };
  const context = vm.createContext({
    performance: { now: () => perf }, document: { hidden: true },
    audioHealthIntervalMs: 1000, audioHealthGapMs: 3000, audioHealthClockToleranceMs: 250,
    audioSchedulerHealth: { sample: null, needsReschedule: false, resumePending: false,
      nextResumeAt: 0, checks: 0, recoveries: 0 },
    pageAudioSuspended: false, clockCalibrationPending: false, standaloneMode: false, iosAudioWorkaroundEnabled: false,
    state: { running: true }, scheduledAudioNodes: [], lastSegmentIndex: "1:rotation",
    canPlaySound: () => true,
    clearSignalTimers: (...args) => { effects.clears.push(args); context.scheduledAudioNodes = []; },
    rescheduleStandaloneSignals: options => effects.schedules.push(options),
    queueClientRecoverySync: options => effects.sync.push(options),
    recordPerformanceAudioClock: (...args) => effects.logs.push(args),
    audioContext: {
      state: "running", get currentTime() { return audio; },
      resume() {
        effects.resumes += 1;
        return new Promise((resolve, reject) => { resolveResume = resolve; rejectResume = reject; });
      }
    }
  });
  vm.runInContext(source("checkAudioSchedulerHealth"), context);
  return { context, effects,
    advance(ms, audioMs = ms) { perf += ms; audio += audioMs / 1000; },
    check(force = false) { context.checkAudioSchedulerHealth(force); },
    async resume() { context.audioContext.state = "running"; resolveResume(); await Promise.resolve(); },
    async reject() { rejectResume(new Error("autoplay denied")); await Promise.resolve(); await Promise.resolve(); }
  };
}

test("ordinary hidden checks and short callback delays leave submitted audio untouched", () => {
  const h = harness();
  h.check();
  for (let i = 0; i < 15; i += 1) { h.advance(1250); h.check(); }
  assert.equal(h.context.audioSchedulerHealth.checks, 16);
  assert.equal(h.context.audioSchedulerHealth.callbackDelayMs, 250);
  assert.equal(h.context.audioSchedulerHealth.audioClockErrorMs, 0);
  assert.equal(h.effects.clears.length, 0);
  assert.equal(h.effects.schedules.length, 0);
});

test("a long JS gap with a healthy audio clock rebuilds only future plans and retains buffered nodes", () => {
  const h = harness();
  h.check(); h.advance(12000); h.check();
  const options = h.effects.schedules[0];
  assert.equal(options.forceStopAudio, false);
  assert.equal(options.preserveBufferedAudio, true);
  assert.equal(options.futureOnly, true);
  assert.equal(h.effects.clears.length, 0);
  assert.equal(h.effects.sync.length, 1);
  h.check(); h.advance(1000); h.check();
  assert.equal(h.effects.schedules.length, 1, "one gap cannot cause a repeated reset");
});

test("a stalled running audio clock replaces invalid targets without changing timer time", () => {
  const h = harness();
  h.check(); h.advance(1500, 100); h.check();
  assert.equal(h.context.audioSchedulerHealth.audioClockErrorMs, -1400);
  assert.equal(h.effects.schedules[0].forceStopAudio, true);
  assert.equal(h.effects.schedules[0].preserveBufferedAudio, false);
  assert.equal(h.effects.schedules[0].futureOnly, true);
  assert.equal(h.effects.sync[0].forceClockCorrection, undefined);
});

test("suspended audio cancels old nodes before resume, serializes retries, then rebuilds future cues", async () => {
  const h = harness();
  h.check();
  h.context.audioContext.state = "suspended";
  h.context.scheduledAudioNodes.push({ start: 20 });
  h.advance(1000, 0); h.check();
  assert.deepEqual(h.effects.clears, [[false, true]]);
  assert.equal(h.effects.resumes, 1);
  h.advance(6000, 0); h.check();
  assert.equal(h.effects.resumes, 1, "a pending resume must not multiply requests");
  assert.equal(h.effects.schedules.length, 0);
  await h.resume();
  assert.equal(h.effects.schedules.length, 1);
  assert.equal(h.effects.schedules[0].forceStopAudio, true);
  assert.equal(h.effects.schedules[0].futureOnly, true);
});

test("autoplay rejection is bounded and a Stop during pending resume cannot restart signals", async () => {
  const h = harness();
  h.context.audioContext.state = "suspended"; h.check(); await h.reject();
  h.advance(1000, 0); h.check();
  assert.equal(h.effects.resumes, 1);
  h.advance(5000, 0); h.check();
  assert.equal(h.effects.resumes, 2);
  h.context.state.running = false;
  await h.resume();
  assert.equal(h.effects.schedules.length, 0);
  assert.equal(h.context.audioSchedulerHealth.needsReschedule, false);
  h.context.state.running = true;
  h.advance(1000); h.check();
  assert.equal(h.effects.schedules.length, 0, "a later Start must not inherit the stopped run's recovery");
});

test("frozen, uncalibrated and muted clients cannot recover or resume audio", () => {
  for (const block of [h => { h.context.pageAudioSuspended = true; },
    h => { h.context.clockCalibrationPending = true; },
    h => { h.context.canPlaySound = () => false; }]) {
    const h = harness(); h.check(); block(h);
    h.context.audioContext.state = "suspended"; h.advance(12000, 0); h.check();
    assert.equal(h.effects.schedules.length, 0);
    assert.equal(h.effects.resumes, 0);
  }
});

test("iOS standalone HTML playback is independent of a suspended Web Audio clock", () => {
  const h = harness();
  h.context.standaloneMode = true;
  h.context.iosAudioWorkaroundEnabled = true;
  h.context.audioContext.state = "suspended";
  h.check(); h.advance(1000, 0); h.check();
  assert.equal(h.effects.clears.length, 0);
  assert.equal(h.effects.resumes, 0);
  h.advance(12000, 0); h.check();
  assert.equal(h.effects.schedules.length, 1);
  assert.equal(h.effects.schedules[0].preserveBufferedAudio, true);
  assert.equal(h.effects.schedules[0].forceStopAudio, false);
  assert.equal(h.effects.sync.length, 0);
});

test("a completed timer cancels nodes on a stalled context without automatically resuming it", () => {
  const h = harness();
  h.context.state.running = false;
  h.context.audioContext.state = "suspended";
  h.context.scheduledAudioNodes.push({start:20});
  h.check();
  assert.deepEqual(h.effects.clears, [[false,true]]);
  assert.equal(h.effects.resumes, 0);
  assert.equal(h.effects.schedules.length, 0);
});
