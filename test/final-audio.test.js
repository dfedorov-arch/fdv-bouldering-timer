"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = index.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
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
    audioSchedulerHealth: { needsReschedule: false },
    audioUserOffsetMs: offset, audioScheduleAheadSeconds: 2.8, audioPrewarmSeconds: 2,
    audioPrewarmBeforeBufferSeconds: 1, audioEarlyPrewarmSeconds: 10, serverTimerLookaheadSeconds: 1.25,
    staleSignalGraceMs: 500, signalLateGraceMs: { rotationBoundary: 1200, warn: 300, warm: 1000, prewarm: 1000 },
    suppressPhaseSignalsUntil: 0, performanceDiagnosticsLevel: 0,
    performanceAudioKeepaliveExperiment: false,
    soundBuffer: () => buffered ? { duration: 0.1 } : null,
    soundSource: () => "", syntheticWarningDurationMs: 100, warningSeparationGuardMs: 20,
    canPlaySound: () => true, flash: noop, signal: noop,
    stopSpeakerKeepAwake: noop,
    updateConnectionWarning: noop,
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
    let audioScheduleGeneration = 0, breakWarningMuteGeneration = 0, lastSegmentIndex = -1, lastPhaseSignalKey = "", scheduledFinalSignalKey = "";
    let clockCalibrationPending = false, pageAudioSuspended = false;
    let signalTimers = [], transitionSignalTimers = [], scheduledAudioNodes = [];
    let scheduledSignalKeys = new Set(), playedSignalKeys = new Set(), scheduledPhaseSignalKeys = new Set();
    ${["elapsedSeconds", "getCurrentSegment", "serverTimeForElapsed", "delayUntilServerTime", "isServerSignalCurrent",
      "shouldScheduleServerSignal", "lateGraceForSignal", "markSignalPlayed", "audioServerTime", "shouldTryBufferImmediately",
      "warningPlaybackDurationMs", "warningFallbackSuppressionReason", "fallbackPlaybackSuppressionReason",
      "scheduleSegmentTimeoutAt", "scheduleServerTimeoutAt", "scheduleBufferedSignalAt", "nextPhaseSignalKey",
      "transitionSoundKind", "schedulePhaseTransitionAt", "clearSignalTimers", "clearStoppedTimerSignals",
      "scheduleSegmentSignals", "schedulePendingStartMinute", "cancelBreakWarningAudio", "scheduleFinalWarnings"].map(source).join("\n")}
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

function recoveryAudioHarness({ initialElapsed = 238, buffered = false, realClockTiming = false } = {}) {
  const h = harness({ initialElapsed, buffered });
  const requests = [];
  const policies = [];
  const noop = () => {};
  Object.assign(h.context, {
    AbortController, URLSearchParams, console,
    performanceDiagnosticsEnabled: false,
    clientDiagnostics: () => ({ clientId: "final-recovery-test" }),
    performanceCount: noop, performanceStart: () => 0, performanceEnd: noop,
    updateConnectionWarning: noop, scheduleDisplayBoundary: noop, render: noop,
    markServerContact: noop, markServerFailure: noop,
    reportStateApplyError: error => { throw error; },
    reconcileServerStateIdentity: () => ({ stale: false, versionChanged: false, instanceChanged: false }),
    maybeBurstSync: noop, restartEventStream: noop, syncDiagnosticsStream: noop,
    reanchorServerClockModel: noop, holdClockRateForResume: noop,
    requestScreenWakeLock: noop, beginResumeSnapPending: () => false, clearResumeSnapPending: noop,
    isBeforeScheduledStart: () => false,
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url, options, resolve, reject });
      return promise;
    }
  });
  h.context.window.location = { protocol: "http:" };
  h.context.window.FDVClientActionTransport = require("../lib/client-action-transport");
  h.context.document.body = { classList: { add: noop, remove: noop } };
  const apply = source("applyServerState");
  const audioAt = apply.indexOf("if (options.replaceAudioSchedule) clearSignalTimers");
  const audioEnd = apply.indexOf("lastServerVersion =", audioAt);
  assert.ok(audioAt > 0 && audioEnd > audioAt);
  const normalize = apply.match(/if \(options\.replaceAudioSchedule\) \{\s*options = [\s\S]*?\n      \}/)?.[0] || "";
  const estimatorConstants = ["syncSampleWindowMs", "syncMaxSamples", "syncRateMinSpanMs", "syncRateLargeMin",
    "syncRateLargeMax", "syncRateNormalMin", "syncRateNormalMax", "syncRateStableMinSamples",
    "syncRateStableMaxResidualMs", "syncRateStableMaxHalfDiffPpm", "syncRateStableMaxOutlierShare",
    "syncRateConfirmationTolerancePpm", "syncRateConfirmationWindows", "syncRateLargeThresholdPpm",
    "syncRateDeadband", "syncRateSmoothing"]
    .map(name => index.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
  vm.runInContext(`
    ${estimatorConstants}
    let pendingClientRecovery = null, activeClientRecovery = null;
    let clientRecoveryTimer = null, clientRecoveryFollowupTimer = null;
    let syncRequestController = null, syncRequestInFlight = false, syncRequestGeneration = 0;
    let resumeSyncInProgress = false, lastResumeSyncAt = -Infinity;
    let signalsInvalidatedWhileHidden = false, pageHiddenAt = 0, resumeSnapPending = false;
    let lastServerVersion = 7, lastRemoteRunning = true, pendingServerState = null, offlineReloadMode = false;
    let lastServerInstanceId = "server-a";
    const retiredServerInstanceIds = new Set();
    let isPrimaryClient = true, lastStartListServerRevision = "", eventSource = { readyState: 1 };
    let eventSourceConnected = true, lastSseEventAt = 100000, syncSamples = [];
    let serverClockRate = 1, syncQuality = { error: 2, samples: 3 };
    let serverTimeAnchor = 100000, serverPerfAnchor = 100000, serverPerfOffset = 0, serverTimeOffset = 0;
    let serverClockRateHighConfidence = false, serverClockRateConfidence = "normal", serverClockRateGateReason = "normal";
    let pendingServerClockRatePpm = null, pendingServerClockRateCount = 0, serverAvailable = true;
    let lastMeasuredClockServerInstanceId = "server-a", serverClockRecoveryTimer = null, lastServerClockRecoveryAt = -Infinity;
    let clockContinuityWallAt = Date.now(), clockContinuityPerfAt = 100000;
    let trustedServerClockAnchor = null, lastTrustedClockAnchorAt = 0, lastDisplayTimeLabel = "00:02";
    const clockContinuityMismatchMs = 100, trustedClockAnchorIntervalMs = 60000;
    const serverClockRecoveryCooldownMs = 2000;
    const syncRequestTimeoutMs = 2000, sseSilentRestartMs = 25000;
    ${["recentPhaseSignalGraceMs", "scheduleRecentPhaseSignalAfterResume", "rescheduleStandaloneSignals",
      "renderCanonicalSegmentSignals", "cancelServerSyncForClockRecovery", "queueClientRecoverySync",
      "scheduleClientRecoverySync", "flushClientRecoverySync", "resumeClientSync", "syncFromServer"].map(source).join("\n")}
    ${realClockTiming ? ["serverNow", "clampFloat", "median", "percentile", "fitClockRate", "applyServerClockModel",
      "resetServerClockRateConfirmation", "invalidateServerClockCalibration", "browserClockIntervalMismatch", "repairServerClockAfterSuspension",
      "prepareServerClockMeasurement", "refreshTrustedClockAnchor", "requestMeasuredClockSync", "updateServerTiming"].map(source).join("\n") : ""}
    function applyActualRecoveryAudioPolicy(options) {
      const audioOffsetChanged = false, festivalAnnouncementsChanged = false;
      ${normalize}
      ${apply.slice(audioAt, audioEnd)}
      return options;
    }
  `, h.context);
  if (!realClockTiming) h.context.updateServerTiming = () => h.set("clockCalibrationPending = false;");
  h.context.applyServerState = (remote, options) => {
    h.context.updateServerTiming(remote, options.timing, options);
    policies.push(h.context.applyActualRecoveryAudioPolicy(options));
    const elapsed = h.context.elapsedSeconds();
    h.context.renderCanonicalSegmentSignals(h.context.getCurrentSegment(elapsed), elapsed);
  };
  h.context.applyServerRuntimeClockState = noop;
  async function settle() {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  }
  return {
    ...h, requests, policies, settle,
    async dispatch() { h.advance(h.context.serverNow()); await settle(); },
    async complete(request = 0) {
      requests[request].resolve({ ok: true, headers: { get: () => null }, json: async () => ({
        now: h.context.serverNow(), serverInstanceId: "server-a", version: 7, running: true
      }) });
      await settle();
      h.advance(h.context.serverNow());
      await settle();
    },
    async fail(request) {
      requests[request].reject(new Error("recovery network interrupted"));
      await settle();
    }
  };
}

test("ten-second preparation supplements the existing close wakes for warnings and minute signals", () => {
  const h = harness({initialElapsed:200,buffered:true});
  const calls=[];
  h.context.scheduleSignalAt=(segment,target,kind)=>calls.push({target,kind});
  h.plan();
  assert.ok(calls.some(c=>c.kind==="prewarm"&&c.target===125000),"10s before the first warning at135000");
  assert.ok(calls.some(c=>c.kind==="prewarm"&&c.target===133000),"retain the 2s close wake");
  const minute=harness({initialElapsed:160,buffered:true});
  const minuteCalls=[];
  minute.context.scheduleSignalAt=(segment,target,kind)=>minuteCalls.push({target,kind});
  minute.plan();
  assert.ok(minuteCalls.some(c=>c.kind==="prewarm"&&c.target===110000),"10s before minute at120000");
  assert.ok(minuteCalls.some(c=>c.kind==="prewarm"&&c.target===116200),"retain buffer prewarm");
  assert.ok(minuteCalls.some(c=>c.kind==="warm"&&c.target===119200),"retain final close wake");
});

test("pending-start MINUTE and repeating scheduled START each prepare ten seconds ahead", () => {
  const h=harness({initialElapsed:0,oneShot:false,buffered:true});
  const calls=[];
  h.context.state.serverStartedAt=180000;
  h.context.scheduleSignalAt=(segment,target,kind)=>calls.push({target,kind});
  h.plan();
  assert.ok(calls.some(c=>c.kind==="prewarm"&&c.target===110000),"MINUTE at120000");
  assert.ok(calls.some(c=>c.kind==="prewarm"&&c.target===170000),"START at180000");
});

test("hidden Final keeps every warning and one end, including a health rebuild retaining submitted buffers", () => {
  const h = recoveryAudioHarness({ initialElapsed: 234, buffered: true });
  h.context.document.hidden = true;
  h.plan();
  const submitted = h.get("scheduledAudioNodes").slice();
  assert.ok(submitted.length >= 5);
  h.advance(100500);
  h.context.rescheduleStandaloneSignals({ preserveBufferedAudio: true, futureOnly: true });
  assert.equal(h.get("audioScheduleGeneration"), 0);
  assert.ok(submitted.every(node => h.get("scheduledAudioNodes").includes(node) && !node.cancelled));
  h.advance(106200);
  assert.equal(h.sounds.filter(sound => sound.kind === "warn").length, 5);
  assert.equal(h.sounds.filter(sound => sound.kind === "end").length, 1);
  assert.equal(h.sounds.find(sound => sound.kind === "end").at, 106000);
});

test("health rebuild never catches up a just-missed minute warning or scheduled-start minute", () => {
  for (const countdownOnly of [false, true]) {
    const h = recoveryAudioHarness({ initialElapsed: 180.5, buffered: true });
    h.context.document.hidden = true;
    if (countdownOnly) {
      h.context.state.countdownOnly = true;
      h.context.state.serverStartedAt = h.context.serverNow() + 59500;
    }
    h.context.rescheduleStandaloneSignals({ preserveBufferedAudio: true, futureOnly: true });
    h.advance(101000);
    assert.equal(h.sounds.filter(sound => sound.kind === "minute").length, 0);
    assert.equal(h.events.filter(event => event.stage === "plan" && event.kind === "minute").length, 0);
  }
});

test("a forced response crossing visibility rebuilds Final end even if queued recovery fails", async () => {
  for (const buffered of [false, true]) {
    const h = recoveryAudioHarness({ buffered });
    h.context.document.hidden = true;
    h.set("signalsInvalidatedWhileHidden = true; clockCalibrationPending = true;");
    h.context.resumeClientSync({ clockRepaired: true, restorePage: false, signalsAlreadyRescheduled: true });
    await h.dispatch();
    assert.equal(h.requests.length, 1);
    h.context.document.hidden = false;
    h.context.resumeClientSync({ restorePage: true });
    h.context.queueClientRecoverySync({ reason: "concurrent-page-return" });
    await h.complete(0);
    assert.equal(h.policies[0].replaceAudioSchedule, true);
    assert.equal(h.policies[0].rescheduleSignals, true,
      "replacement must reflect visibility when applying the response, not when dispatching it");
    assert.equal(h.requests.length, 2);
    await h.fail(1);
    for (let now = 100000; now <= 102200; now += 20) {
      h.advance(now);
      const elapsed = h.context.elapsedSeconds();
      h.context.renderCanonicalSegmentSignals(h.context.getCurrentSegment(elapsed), elapsed);
      if (elapsed >= 240) h.stop(true);
    }
    assert.equal(h.sounds.filter(sound => sound.kind === "end").length, 1,
      `Final end must survive a queued recovery failure, buffered=${buffered}`);
  }
});

test("recent phase catch-up cannot sound from an uncalibrated monotonic timeline", () => {
  const h = recoveryAudioHarness({ initialElapsed: 0.5, buffered: true });
  h.context.signalLateGraceMs.start = 1500;
  h.set("clockCalibrationPending = true;");
  const segment = h.context.getCurrentSegment(h.context.elapsedSeconds());
  assert.equal(h.context.scheduleRecentPhaseSignalAfterResume(segment), false);
  h.advance(100000);
  assert.equal(h.sounds.length, 0);
});

test("timing-only calibration restores the complete Final end while the display snap still waits", async () => {
  for (const buffered of [false, true]) {
    const h = recoveryAudioHarness({ buffered, realClockTiming: true });
    h.set("clockCalibrationPending = true; resumeSnapPending = true;");
    const wall = Date.now();
    h.context.updateServerTiming({ now: 100000, serverReceivedAt: 100000, serverSentAt: 100000,
      version: 7, serverInstanceId: "server-a" }, {
      date0: wall, date1: wall, perf0: 100000, perf1: 100000
    });
    await h.dispatch();
    assert.equal(h.get("clockCalibrationPending"), false);
    assert.equal(h.get("resumeSnapPending"), true);
    assert.equal(h.get("lastSegmentIndex"), "1:rotation");
    assert.equal(h.requests.length, 0, "a timing-only action response must not need an extra GET to recover audio");
    for (let now = 100000; now <= 102200; now += 20) {
      h.advance(now);
      if (h.context.elapsedSeconds() >= 240) h.stop(true);
    }
    assert.equal(h.sounds.filter(sound => sound.kind === "end").length, 1, `buffered=${buffered}`);
  }
});

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
    ${["confirmStandaloneClockContinuity", "pauseStandaloneTimer", "scrubToPointer", "startStandaloneTimer"].map(source).join("\n")}`, h.context);
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

test("muting break warnings keeps all rotation warnings, flashes and the exact next-start boundary", () => {
  for (const buffered of [false, true]) {
    const h = harness({initialElapsed:249,oneShot:false,buffered});
    h.context.state.activeSettings.breakSeconds = 15;
    h.context.state.muteBreakWarnings = true;
    let flashes = 0; h.context.flash = () => flashes++;
    h.plan(); h.advance(106100);
    assert.deepEqual(h.sounds.map(s=>s.kind),["start"]);
    assert.equal(h.sounds[0].at,106000);
    assert.equal(flashes,6,"five visual warnings plus transition");
    const rotation = harness({oneShot:false,buffered});
    rotation.context.state.muteBreakWarnings = true;
    rotation.plan(); rotation.advance(106100);
    assert.deepEqual(rotation.sounds.map(s=>s.kind),["warn","warn","warn","warn","warn","start"]);
  }
});

test("turning mute on cancels an imminent break warning without moving or cancelling start", () => {
  const h = harness({initialElapsed:249,oneShot:false,buffered:true});
  h.context.state.activeSettings.breakSeconds = 15;
  h.plan(); h.advance(100850);
  const imminent = h.nodes.find(n=>n.kind==="warn");
  h.context.state.muteBreakWarnings = true;
  h.context.cancelBreakWarningAudio(); h.plan(); h.advance(106100);
  assert.equal(imminent.cancelled,true);
  assert.deepEqual(h.sounds.map(s=>s.kind),["start"]);
  assert.equal(h.sounds[0].at,106000);
});

test("pending scheduled start has one minute signal at its canonical target, including Final and offsets", () => {
  for (const buffered of [false,true]) for (const oneShot of [false,true]) for (const offset of [-500,0,500]) {
    const h = harness({buffered,oneShot,offset});
    h.context.state.serverStartedAt = 165000;
    h.context.state.countdownOnly = oneShot;
    h.context.schedulePendingStartMinute();
    h.advance(104000);
    h.context.clearSignalTimers(); h.context.schedulePendingStartMinute();
    h.advance(106000);
    assert.deepEqual(h.sounds.map(s=>s.kind),["minute"]);
    assert.equal(h.sounds[0].at,105000+offset);
    h.context.schedulePendingStartMinute(); h.advance(106500);
    assert.equal(h.sounds.length,1,"no duplicate on state/recovery");
  }
});

test("pending-start minute waits for calibration and never replays stale, cancelled or manual starts", () => {
  for (const buffered of [false,true]) {
    for (const mode of ["calibration","stale","stop","manual"]) {
      const h = harness({buffered});
      h.context.state.serverStartedAt = mode==="stale" ? 150000 : 165000;
      if (mode==="calibration") h.set("clockCalibrationPending = true;");
      if (mode==="manual") h.context.state.manualStartLeadMs = 300;
      h.context.schedulePendingStartMinute();
      if (mode==="stop") { h.context.state.running=false; h.context.clearSignalTimers(false,true); }
      h.advance(106000);
      assert.equal(h.sounds.length,0,mode);
    }
  }
});

test("scheduled-start warning is not replayed after a clock-coordinate or audio-offset correction", () => {
  const h = harness({buffered:true});
  h.context.state.serverStartedAt = 165000;
  h.context.state.serverStartedAtWall = 1791460800000;
  h.context.schedulePendingStartMinute(); h.advance(105100);
  h.context.clearSignalTimers();
  h.context.state.serverStartedAt += 1000;
  h.context.audioUserOffsetMs = 500;
  h.context.schedulePendingStartMinute(); h.advance(107000);
  assert.deepEqual(h.sounds.map(s=>s.kind),["minute"]);
});

test("an audio buffer loading across mute on/off cannot resurrect an old break-warning batch", async () => {
  const h = harness({initialElapsed:249,oneShot:false,buffered:true});
  h.context.state.activeSettings.breakSeconds=15;
  let loaded=false, resolve;
  const loading=new Promise(r=>{resolve=r;});
  h.context.soundBuffer=()=>loaded?{duration:0.1}:null;
  h.context.loadAudioBuffers=()=>loading;
  h.plan();
  h.context.state.muteBreakWarnings=true;
  h.context.cancelBreakWarningAudio(); h.plan();
  h.context.state.muteBreakWarnings=false; h.plan();
  loaded=true; resolve(); await Promise.resolve();
  h.advance(106100);
  assert.deepEqual(h.sounds.map(s=>s.kind),["warn","warn","warn","warn","warn","start"]);
});

test("an audio-only measured recovery preserves a warning already playing and the complete Final ending", () => {
  const h = harness({ buffered: true });
  h.plan();
  h.advance(101020);
  const firstWarning = h.nodes.find(node => node.kind === "warn" && node.started);
  assert.ok(firstWarning);
  const generation = h.get("audioScheduleGeneration");
  h.plan(); // Recovery response: rebuild future signals, without force-stop.
  assert.equal(Boolean(firstWarning.cancelled), false);
  assert.equal(h.get("audioScheduleGeneration"), generation);
  h.advance(106500);
  assert.deepEqual(h.sounds.map(sound => sound.kind), ["warn", "warn", "warn", "warn", "warn", "end"]);
});

test("an audio-only recovery immediately before the boundary retains exactly one imminent transition", () => {
  for (const oneShot of [false, true]) {
    for (const buffered of [false, true]) {
      const h = harness({ oneShot, buffered });
      h.plan();
      h.advance(105850);
      const transition = h.nodes.find(node => node.kind === (oneShot ? "end" : "start"));
      h.plan();
      if (buffered) assert.equal(Boolean(transition.cancelled), false);
      h.advance(106500);
      assert.equal(h.sounds.filter(sound => sound.kind === (oneShot ? "end" : "start")).length, 1,
        `oneShot=${oneShot}, buffered=${buffered}`);
    }
  }
});

test("forced wake calibration replaces a future transition buffered from an inaccurate provisional clock", () => {
  for (const oneShot of [false, true]) {
    for (const correction of [-1500, -500, 500]) {
      const h = harness({ oneShot, buffered: true });
      h.plan();
      h.advance(105850);
      const kind = oneShot ? "end" : "start";
      const oldBuffer = h.nodes.find(node => node.kind === kind);
      assert.ok(oldBuffer && !oldBuffer.started);
      h.context.serverNow = () => h.context.audioContext.currentTime * 1000 + correction;
      h.context.clearSignalTimers(false, true); // Measured clock-repair policy.
      if (oneShot && correction > 0) h.stop(true); // The measured Final is already complete.
      else h.plan();
      assert.equal(oldBuffer.cancelled, true, `oneShot=${oneShot}, correction=${correction}`);
      if (correction < 0) {
        h.advance(106001);
        assert.equal(h.sounds.filter(sound => sound.kind === kind).length, 0);
        h.advance(106000 - correction + 100);
        assert.equal(h.sounds.filter(sound => sound.kind === kind).length, 1);
        assert.equal(h.sounds.find(sound => sound.kind === kind).at, 106000 - correction);
      } else {
        h.advance(106100);
        // A passed one-shot ending may be recovered once within its grace
        // interval; never keep the obsolete, still-future provisional buffer.
        assert.ok(h.sounds.filter(sound => sound.kind === kind).length <= 1);
        assert.equal(oldBuffer.started, false);
      }
    }
  }
});
