"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = index.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

function harness({ offset = 0, buffered = false, initialElapsed = 234, oneShot = true } = {}) {
  let now = 100000;
  let id = 0;
  const timers = new Map(), events = [], sounds = [], nodes = [];
  const noop = () => {};
  const context = vm.createContext({
    window: {
      setTimeout: (callback, ms) => {
        const timerId = ++id;
        timers.set(timerId, { callback, at: now + ms });
        return timerId;
      },
      clearTimeout: timerId => timers.delete(timerId)
    },
    document: { hidden: false }, performance: { now: () => now }, Date,
    state: { running: true, completed: false, countdownOnly: false, startListFinalCycle: 0,
      elapsedBeforePause: 0, serverStartedAt: now - initialElapsed * 1000,
      activeSettings: { rotationSeconds: 240, breakSeconds: 0, oneShot } },
    serverNow: () => now, activeSettings: () => context.state.activeSettings, t: key => key,
    standaloneMode: false, iosAudioWorkaroundEnabled: false,
    audioUserOffsetMs: offset, audioScheduleAheadSeconds: 2.8, audioPrewarmSeconds: 2,
    audioPrewarmBeforeBufferSeconds: 1, serverTimerLookaheadSeconds: 1.25,
    staleSignalGraceMs: 500, signalLateGraceMs: { rotationBoundary: 1200, warn: 300, warm: 1000, prewarm: 1000 },
    suppressPhaseSignalsUntil: 0, performanceDiagnosticsLevel: 0,
    performanceAudioKeepaliveExperiment: false,
    soundBuffer: () => buffered ? { duration: 0.1 } : null,
    soundSource: () => "", syntheticWarningDurationMs: 100, warningSeparationGuardMs: 20,
    canPlaySound: () => true, flash: noop, signal: noop,
    schedulePerformanceAudioKeepalive: noop, scheduleFestivalAnnouncements: noop,
    scheduleSignalAt: noop, loadAudioBuffers: () => null,
    recordPerformanceAudioSchedule: event => events.push(event),
    updatePerformancePendingAudioPlan: noop, recordPerformanceAudioClock: noop,
    finalizeClearedPerformanceAudioPlans: noop, finalizeClearedPerformancePrewarmPlans: noop,
    recordCancelledAudioNode: noop, stopActiveHtmlAudio: noop,
    beep: (kind, delay = 0, scheduled = false, signalKey = "", preserve = false, onStarted = null) => {
      if (!scheduled) { sounds.push({ kind, at: now }); return true; }
      if (!buffered) return false;
      const start = now / 1000 + delay;
      const item = { kind, start, signalKey, preserveOnTransition: preserve, started: false };
      item.node = { stop: () => { item.cancelled = true; timers.delete(item.playedTimer); } };
      item.playedTimer = context.window.setTimeout(() => {
        if (item.cancelled) return;
        item.started = true;
        context.markSignalPlayed(signalKey);
        sounds.push({ kind, at: now });
        onStarted?.();
      }, delay * 1000);
      nodes.push(item);
      vm.runInContext("scheduledAudioNodes", context).push(item);
      return true;
    }
  });
  Object.defineProperty(context, "audioContext", { get: () => buffered ? { state: "running", currentTime: now / 1000 } : null });
  vm.runInContext(`
    let audioScheduleGeneration = 0, lastSegmentIndex = -1, lastPhaseSignalKey = "", scheduledFinalSignalKey = "";
    let signalTimers = [], transitionSignalTimers = [], scheduledAudioNodes = [];
    let scheduledSignalKeys = new Set(), playedSignalKeys = new Set(), scheduledPhaseSignalKeys = new Set();
    ${["elapsedSeconds", "getCurrentSegment", "serverTimeForElapsed", "delayUntilServerTime", "isServerSignalCurrent",
      "shouldScheduleServerSignal", "lateGraceForSignal", "markSignalPlayed", "audioServerTime", "shouldTryBufferImmediately",
      "warningPlaybackDurationMs", "warningFallbackSuppressionReason", "fallbackPlaybackSuppressionReason",
      "scheduleSegmentTimeoutAt", "scheduleServerTimeoutAt", "scheduleBufferedSignalAt", "nextPhaseSignalKey",
      "transitionSoundKind", "schedulePhaseTransitionAt", "clearSignalTimers", "clearStoppedTimerSignals",
      "scheduleSegmentSignals", "scheduleFinalWarnings"].map(source).join("\n")}
  `, context);
  context.state.timeline = [1];
  function advance(at) {
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= at)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = at;
  }
  return { context, events, sounds, nodes, timers, advance,
    plan() {
      const elapsed = context.elapsedSeconds();
      const segment = context.getCurrentSegment(elapsed);
      context.scheduleSegmentSignals(segment, segment.end - elapsed, segment.end - segment.start, false);
    },
    stop(completed = false, reset = false) {
      const elapsed = context.elapsedSeconds();
      context.state.running = false;
      context.state.completed = completed;
      context.state.elapsedBeforePause = completed ? 240 : reset ? 0 : elapsed;
      context.state.serverStartedAt = 0;
      context.clearStoppedTimerSignals();
    },
    get: name => vm.runInContext(name, context),
    set: code => vm.runInContext(code, context)
  };
}

test("pause/seek/resume six seconds before Final end plays all five warnings and exactly one end fallback", () => {
  const h = harness();
  h.plan();
  h.advance(105999);
  assert.deepEqual(h.sounds.map(s => s.kind), ["warn", "warn", "warn", "warn", "warn"]);
  h.stop(true);
  h.context.clearStoppedTimerSignals(); // repeated completed-state response
  h.advance(106100);
  assert.deepEqual(h.sounds.map(s => s.kind), ["warn", "warn", "warn", "warn", "warn", "end"]);
  assert.equal(h.events.filter(e => e.stage === "fallback" && e.kind === "end").length, 1);
});

test("actual standalone pause and progress-track seek followed by resume retains the complete ending sequence", () => {
  const h = harness({ initialElapsed: 50 });
  Object.assign(h.context, {
    standaloneMode: true, syncButtons: () => {}, render: () => {}, saveOfflineSnapshot: () => {},
    buildTimeline: () => {}, clearStartListIncidentsForNewRound: () => {}, canScrub: () => true,
    els: { progressTrack: { getBoundingClientRect: () => ({ left: 0, width: 1000 }) } },
    seekEndGuardSeconds: 0.05
  });
  h.context.state.runtimePreset = h.context.state.activePreset = "final";
  vm.runInContext(`let scrubSegment = null, pendingSeekElapsed = null;
    ${["pauseStandaloneTimer", "scrubToPointer", "startStandaloneTimer"].map(source).join("\n")}`, h.context);
  h.context.pauseStandaloneTimer();
  h.context.scrubToPointer({ clientX: 975 });
  assert.equal(h.context.state.elapsedBeforePause, 234);
  h.context.startStandaloneTimer();
  assert.equal(h.context.state.running, true);
  h.plan(); h.advance(105999); h.stop(true); h.advance(106100);
  assert.deepEqual(h.sounds.map(s => s.kind), ["warn", "warn", "warn", "warn", "warn", "end"]);
});

test("new Final attempts sound even after the previous cycle-1 finish, without duplicate rescheduling", () => {
  const h = harness();
  h.plan(); h.advance(106100);
  assert.equal(h.sounds.filter(s => s.kind === "end").length, 1);
  h.context.state.startListFinalCycle = 1;
  h.context.state.serverStartedAt = 112100 - 240000;
  h.plan();
  h.context.schedulePhaseTransitionAt(h.context.getCurrentSegment(234), 112100.4, true);
  h.advance(112200);
  assert.equal(h.sounds.filter(s => s.kind === "end").length, 2);
  const plans = h.events.filter(e => e.stage === "plan" && e.kind === "end");
  assert.equal(plans.length, 2);
  assert.notEqual(plans[0].signalKey, plans[1].signalKey);
});

test("completion preserves the final buffer or fallback for negative, zero and positive calibration", () => {
  for (const buffered of [false, true]) {
    for (const offset of [-750, -100, 0, 250]) {
      const h = harness({ buffered, offset });
      h.plan(); h.advance(105999); h.stop(true);
      h.context.clearStoppedTimerSignals();
      h.advance(106500);
      assert.equal(h.sounds.filter(s => s.kind === "end").length, 1, `buffered=${buffered}, offset=${offset}`);
      assert.ok(Math.abs(h.sounds.find(s => s.kind === "end").at - (106000 + offset)) < 1e-6);
    }
  }
});

test("manual Final Pause/Stop cancels even an end node less than 200 ms in the future", () => {
  for (const buffered of [false, true]) {
    for (const reset of [false, true]) {
      const h = harness({ buffered });
      h.plan(); h.advance(105850); h.stop(false, reset); h.advance(106500);
      assert.equal(h.sounds.filter(s => s.kind === "end").length, 0);
      if (buffered) assert.equal(h.nodes.find(n => n.kind === "end").cancelled, true);
    }
  }
});

test("resume after cancelling an unplayed Final end schedules it again for the new anchor", () => {
  const h = harness({ buffered: true });
  h.plan(); h.advance(105850); h.stop(false);
  h.context.state.running = true;
  h.context.state.serverStartedAt = 111850 - 240000;
  h.plan(); h.advance(112000);
  assert.equal(h.sounds.filter(s => s.kind === "end").length, 1);
});

test("retained completion fallback still expires rather than replaying far beyond its lateness limit", () => {
  const h = harness();
  h.plan(); h.advance(105999); h.stop(true);
  // Invoke a frozen-page timeout at its actual delayed delivery time.
  const due = [...h.timers.values()].filter(t => t.at === 106000);
  h.timers.clear(); h.advance(108000);
  due.forEach(t => t.callback());
  assert.equal(h.sounds.filter(s => s.kind === "end").length, 0);
  assert.equal(h.events.some(e => e.kind === "end" && e.suppressionReason === "past-target"), true);
});

test("network completion uses the stopped-audio helper and standalone manual stops cancel pending nodes", () => {
  assert.match(source("applyServerState"), /if \(!state\.running\) \{\s*clearStoppedTimerSignals\(\);/);
  assert.match(source("pauseStandaloneTimer"), /clearStoppedTimerSignals\(\);/);
  assert.match(source("resetStandaloneTimer"), /clearSignalTimers\(false, stoppedOneShot\);/);
});

test("ordinary Classic/ Festival boundary keys and stop policy are unchanged", () => {
  const h = harness({ oneShot: false });
  h.plan(); h.advance(106100);
  assert.equal(h.sounds.filter(s => s.kind === "start").length, 1);
  assert.equal(h.events.find(e => e.stage === "plan" && e.kind === "start").signalKey,
    "rotationBoundary:2:rotation:106000");
  const generation = h.get("audioScheduleGeneration");
  h.stop(false);
  assert.equal(h.get("audioScheduleGeneration"), generation);
});
