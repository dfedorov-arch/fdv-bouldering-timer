"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name) {
  const match = html.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}

// Recovery policy is exercised using the actual page functions. Browser transport,
// sound output and the independently tested clock estimator are deterministic seams.
function harness({ realClockTiming = false } = {}) {
  let perf = 2000;
  let wall = 102000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const streams = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.closed = false;
      this.listeners = new Map();
      streams.push(this);
    }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    close() { this.readyState = 2; this.closed = true; }
    open() { this.readyState = 1; this.onopen?.(); }
    fail() { this.readyState = 0; this.onerror?.(); }
    dispatch(name, value = {}) { this.listeners.get(name)?.({ data: JSON.stringify(value) }); }
  }
  const effects = {
    restart: 0, diagnostics: 0, audio: [], clearedAudio: 0, recentSignals: 0,
    timing: [], state: [], failures: 0, contact: 0, render: [], wake: 0, localList: 0
  };
  const context = vm.createContext({
    performance: { now: () => perf }, Date: { now: () => wall },
    AbortController, URLSearchParams, console, EventSource: FakeEventSource,
    window: {
      location: { protocol: "http:" }, EventSource: FakeEventSource,
      FDVClientActionTransport: require("../lib/client-action-transport"),
      setTimeout(callback, delay = 0) {
        const id = ++nextTimer;
        timers.set(id, { callback, at: perf + delay });
        return id;
      },
      clearTimeout: id => timers.delete(id)
    },
    document: {
      hidden: false, visibilityState: "visible",
      body: { classList: { add() {}, remove() {} } }
    },
    state: { running: true, completed: false, countdownOnly: false, primaryClientId: "primary" },
    performanceDiagnosticsEnabled: false,
    performanceCount() {}, performanceStart: () => perf, performanceEnd() {},
    clientDiagnostics: () => ({ clientId: "recovery-test" }),
    markServerContact: () => { effects.contact += 1; },
    markServerFailure: () => { effects.failures += 1; },
    reportStateApplyError: error => { throw error; },
    reconcileServerStateIdentity: remote => ({ stale: Boolean(remote.stale),
      versionChanged: Boolean(remote.changed), instanceChanged: Boolean(remote.newInstance) }),
    maybeBurstSync() {}, renderBrowserList() {}, updatePrimaryComputerFlag() {},
    syncBrowserNumberDisplay() {}, updateConnectionWarning() {}, handleAudioTest() {}, wakeAudioOutput() {},
    scheduleDisplayBoundary() {}, refreshTrustedClockAnchor() {},
    requestScreenWakeLock: () => { effects.wake += 1; },
    shouldKeepDisplayFresh: () => true,
    recordPerformanceAudioClock() {},
    render: reason => effects.render.push(reason),
    elapsedSeconds: () => 20,
    getCurrentSegment: () => ({ cycle: 1, type: "rotation", start: 0, end: 60 }),
    scheduleRecentPhaseSignalAfterResume: () => { effects.recentSignals += 1; return true; },
    rescheduleStandaloneSignals: options => effects.audio.push(options || {}),
    clearSignalTimers: () => { effects.clearedAudio += 1; },
    refreshStandaloneBrowserList: () => { effects.localList += 1; },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url, options, resolve, reject, promise });
      return promise;
    }
  });
  const seedSamples = [0, 500, 1000].map(perfTime => ({
    at: perfTime, latency: 4, networkLatency: 4, perfTime,
    serverTime: 100000 + perfTime, clockOffset: 0, perfOffset: 100000
  }));
  const estimatorConstants = ["syncSampleWindowMs", "syncMaxSamples", "syncRateMinSpanMs", "syncRateNormalMin",
    "syncRateNormalMax", "syncRateStableMinSamples", "syncRateStableMaxResidualMs", "syncRateStableMaxHalfDiffPpm",
    "syncRateStableMaxOutlierShare", "syncRateConfirmationTolerancePpm", "syncRateConfirmationWindows",
    "syncRateLargeThresholdPpm", "syncRateDeadband", "syncRateSmoothing"]
    .map(name => html.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
  vm.runInContext(`
    ${estimatorConstants}
    let standaloneMode = false, offlineReloadMode = false, serverAvailable = true;
    let clockCalibrationPending = false, pageAudioSuspended = false;
    let serverTimeAnchor = 100000, serverPerfAnchor = 0, serverClockRate = 1;
    let serverPerfOffset = 100000, serverTimeOffset = 0;
    let serverClockRateHighConfidence = true, serverClockRateConfidence = "normal";
    let serverClockRateGateReason = "normal", pendingServerClockRatePpm = null, pendingServerClockRateCount = 0;
    let syncSamples = ${JSON.stringify(seedSamples)};
    let syncQuality = { error: 2, latency: 4, jitter: 0, samples: 3, rate: 1 };
    let lastMeasuredClockServerInstanceId = "server-a", serverClockRecoveryTimer = null;
    let lastServerClockRecoveryAt = -Infinity;
    const serverClockRecoveryCooldownMs = 2000, trustedClockAnchorIntervalMs = 60000;
    let syncRequestInFlight = false, syncRequestGeneration = 0, syncRequestController = null;
    let pendingClientRecovery = null, activeClientRecovery = null;
    let clientRecoveryTimer = null, clientRecoveryFollowupTimer = null;
    let lastResumeSyncAt = -Infinity, resumeSyncInProgress = false;
    let pageHiddenAt = 0, signalsInvalidatedWhileHidden = false, suppressPhaseSignalsUntil = 0;
    let audioScheduleGeneration = 5;
    let resumeSnapPending = false, resumeSnapStartedAt = 0, resumeSnapTimer = null;
    let lastDisplayTimeLabel = "00:40", lastSegmentIndex = "1:rotation";
    let clockContinuityWallAt = 102000, clockContinuityPerfAt = 2000;
    let trustedServerClockAnchor = { wallAt: 100000, perfAt: 0, serverAt: 100000, serverInstanceId: "server-a" };
    let lastTrustedClockAnchorAt = 100000;
    let lastServerInstanceId = "server-a", lastServerVersion = 7, lastRemoteRunning = true;
    const retiredServerInstanceIds = new Set();
    let pendingServerState = null, lastStartListServerRevision = "lists-a";
    let isPrimaryClient = false, eventSource = { readyState: 1 }, eventSourceConnected = true;
    let eventStreamGeneration = 3, lastSseEventAt = 2000, sseRestarts = 0;
    let diagnosticsEventSource = null, diagnosticsStreamGeneration = 0;
    const clientId = "recovery-test";
    let mobileResumeSyncEnabled = false;
    const syncRequestTimeoutMs = 2000, staleResumeAfterMs = 3000, resumeSnapMaxWaitMs = 2600;
    const clockContinuityMismatchMs = 100;
    const offlineSnapshotMaxAgeMs = 86400000, sseSilentRestartMs = 25000;
    const syncRateLargeMin = 0.95, syncRateLargeMax = 1.05;
    ${["serverNow", "clampFloat", "applyServerClockModel", "reanchorServerClockModel",
      "resetServerClockRateConfirmation", "invalidateServerClockCalibration", "browserClockIntervalMismatch",
      "repairServerClockAfterSuspension", "holdClockRateForResume",
      "clearResumeSnapPending", "beginResumeSnapPending", "shouldResetSignalsOnResume",
      "isLocalStandalonePage", "resumeLocalPageAfterSuspension", "cancelServerSyncForClockRecovery",
      "queueClientRecoverySync", "scheduleClientRecoverySync", "flushClientRecoverySync",
      "resumeClientSync", "handleClientRecoveryEvent", "syncFromServer", "checkSseHeartbeat",
      "markSseEvent", "startEventStream", "restartEventStream", "startDiagnosticsStream",
      "stopDiagnosticsStream"].map(source).join("\n")}
    ${realClockTiming ? ["median", "percentile", "fitClockRate", "refreshTrustedClockAnchor",
      "prepareServerClockMeasurement", "requestMeasuredClockSync", "updateServerTiming"].map(source).join("\n") : ""}
  `, context);
  const get = expression => vm.runInContext(expression, context);
  const set = expression => vm.runInContext(expression, context);
  const restartEventStream = context.restartEventStream;
  context.restartEventStream = () => {
    effects.restart += 1;
    restartEventStream();
  };
  context.syncDiagnosticsStream = () => { effects.diagnostics += 1; };
  const actualUpdateServerTiming = realClockTiming ? context.updateServerTiming : null;
  context.updateServerTiming = (remote, timing, options = {}) => {
    effects.timing.push({ remote, timing, options: { ...options } });
    if (actualUpdateServerTiming) return actualUpdateServerTiming(remote, timing, options);
    if (options.resetClockSamples) set("syncSamples = [];");
    if (timing) {
      set("clockCalibrationPending = false;");
      set(`syncSamples.push({perfTime: ${perf}, serverTime: ${Number(remote.now)}});`);
      if (options.forceClockCorrection) context.applyServerClockModel(Number(remote.now), get("serverClockRate"), true);
    }
  };
  context.applyServerState = (remote, options = {}) => {
    effects.state.push({ remote, options: { ...options } });
    context.updateServerTiming(remote, options.timing, options);
    context.state.running = remote.running !== false;
    if (options.replaceAudioSchedule) effects.clearedAudio += 1;
    if (options.rescheduleSignals) effects.audio.push({ server: true, ...options });
  };
  context.applyServerRuntimeClockState = remote => { effects.state.push({ remote, runtime: true }); };

  async function settle() {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  }
  async function due() {
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const next = [...timers].filter(([, timer]) => timer.at <= perf)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      timers.delete(next[0]);
      next[1].callback();
      await settle();
    }
    await settle();
  }
  return {
    context, requests, effects, timers, streams, get, set, settle, due,
    advance(wallDelta, perfDelta = wallDelta) { wall += wallDelta; perf += perfDelta; },
    event(type, extra = {}) { return context.handleClientRecoveryEvent({ type, ...extra }); },
    async complete(index = requests.length - 1, extra = {}) {
      const remote = { now: 100000 + perf, version: 7, serverInstanceId: "server-a", running: true, ...extra };
      requests[index].resolve({ ok: true, headers: { get: () => null }, json: async () => remote });
      await settle();
      await due();
    },
    async receiveHeaders(index = requests.length - 1, extra = {}) {
      let finishBody;
      const body = new Promise(resolve => { finishBody = resolve; });
      const remote = { now: 100000 + perf, version: 7, serverInstanceId: "server-a", running: true, ...extra };
      requests[index].resolve({ ok: true, headers: { get: () => null }, json: () => body });
      await settle();
      return async () => { finishBody(remote); await settle(); await due(); };
    },
    async fail(index = requests.length - 1) {
      requests[index].reject(new Error("test network interruption"));
      await settle();
      await due();
    }
  };
}

function assertLightRequest(options) {
  assert.equal(Boolean(options.forceClockCorrection), false);
  assert.equal(Boolean(options.resetClockSamples), false);
  assert.equal(Boolean(options.replaceAudioSchedule), false);
  assert.equal(Boolean(options.resumeAudioSchedule), false);
}

test("online with a healthy localhost stream preserves calibrated clocks, audio and the stream", async () => {
  const h = harness();
  const samples = h.get("JSON.stringify(syncSamples)");
  const quality = h.get("JSON.stringify(syncQuality)");
  h.event("online");
  await h.due();
  assert.equal(h.requests.length, 1);
  assert.equal(h.effects.restart, 0);
  assert.equal(h.effects.audio.length, 0);
  assert.equal(h.get("syncRequestGeneration"), 0);
  assert.equal(h.get("JSON.stringify(syncSamples)"), samples);
  assert.equal(h.get("JSON.stringify(syncQuality)"), quality);
  await h.complete();
  assertLightRequest(h.effects.timing.at(-1).options);
  assert.equal(h.get("syncSamples.length"), 4);
  assert.equal(h.get("clientRecoveryFollowupTimer"), null);
});

test("network recovery restores a missing, failed or stale stream without resetting clocks", async () => {
  for (const condition of ["eventSource = null", "eventSourceConnected = false; eventSource.readyState = 0",
    "eventSourceConnected = false; eventSource.readyState = 2", "lastSseEventAt = -30000"]) {
    const h = harness();
    h.set(condition);
    h.event("online");
    await h.due();
    assert.equal(h.effects.restart, 1, condition);
    assert.equal(h.get("syncSamples.length"), 3);
    await h.complete();
    assertLightRequest(h.effects.timing.at(-1).options);
    assert.equal(h.get("syncSamples.length"), 4);
  }
});

test("ordinary focus preserves measured history and has no forced follow-up", async () => {
  const h = harness();
  h.event("focus");
  await h.due();
  assert.equal(h.effects.restart, 0);
  assert.equal(h.effects.audio.length, 0);
  await h.complete();
  assertLightRequest(h.effects.timing.at(-1).options);
  assert.equal(h.get("syncSamples.length"), 4);
  h.advance(600);
  await h.due();
  assert.equal(h.requests.length, 1);
});

test("a long ordinary tab return retains valid audio and continuous clock samples", async () => {
  const h = harness();
  h.set("pageHiddenAt = 102000;");
  h.advance(30000);
  h.event("visibilitychange");
  assert.equal(h.effects.audio.length, 0);
  assert.equal(h.get("audioScheduleGeneration"), 5);
  assert.equal(h.get("syncSamples.length"), 3);
  await h.due(); await h.complete();
  assert.equal(h.effects.audio.length, 0);
  assert.equal(h.effects.timing.at(-1).options.rescheduleSignals, false);
});

test("long suspended-page recovery rebuilds audio without treating continuous clocks as suspended", async () => {
  const h = harness();
  h.set("pageHiddenAt = 102000; signalsInvalidatedWhileHidden = true;");
  h.advance(30000);
  h.event("visibilitychange");
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("syncSamples.length"), 3);
  assert.equal(h.get("serverNow()"), 132000);
  await h.due();
  await h.complete();
  const options = h.effects.timing.at(-1).options;
  assert.equal(Boolean(options.forceClockCorrection), false);
  assert.equal(Boolean(options.resetClockSamples), false);
  assert.equal(Boolean(options.replaceAudioSchedule), false,
    "the measured response must not cancel a cue already restored locally");
  assert.equal(options.rescheduleSignals, true);
  assert.equal(h.get("syncSamples.length"), 4);
  assert.equal(h.get("signalsInvalidatedWhileHidden"), false);
});

test("brief hiding also restores invalidated audio while keeping trusted clocks", async () => {
  const h = harness();
  h.set("pageHiddenAt = 102000; signalsInvalidatedWhileHidden = true;");
  h.advance(200);
  h.event("focus");
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("syncSamples.length"), 3);
  await h.due();
  await h.complete();
  assert.equal(Boolean(h.effects.timing.at(-1).options.forceClockCorrection), false);
  assert.equal(h.get("syncSamples.length"), 4);
});

test("online while hidden does not consume page history or rebuild hidden audio", async () => {
  const h = harness();
  h.context.document.hidden = true;
  h.context.document.visibilityState = "hidden";
  h.set("pageHiddenAt = 101000; signalsInvalidatedWhileHidden = true;");
  h.event("online");
  await h.due();
  assert.equal(h.effects.audio.length, 0);
  assert.equal(h.get("pageHiddenAt"), 101000);
  assert.equal(h.get("signalsInvalidatedWhileHidden"), true);
  await h.complete();
  h.context.document.hidden = false;
  h.context.document.visibilityState = "visible";
  h.event("visibilitychange");
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("signalsInvalidatedWhileHidden"), false);
});

test("actual clock suspension repairs local time and requests a new forced measured calibration", async () => {
  const h = harness();
  h.set("signalsInvalidatedWhileHidden = true;");
  h.advance(30000, 100);
  h.event("focus");
  assert.equal(h.get("serverNow()"), 102100,
    "wall time must not move the server clock before measured calibration");
  assert.equal(h.get("syncSamples.length"), 0);
  assert.equal(h.get("syncRequestGeneration"), 1);
  assert.equal(h.effects.audio.length, 0, "uncalibrated local time must not plan provisional sound");
  await h.due();
  assert.equal(h.requests.length, 1);
  await h.complete(0, { now: 132000 });
  const options = h.effects.timing.at(-1).options;
  assert.equal(options.forceClockCorrection, true);
  assert.equal(options.resetClockSamples, true);
  assert.equal(options.preserveClockRate, true);
  assert.equal(options.replaceAudioSchedule, true,
    "measured clock repair must replace a provisional wall-clock audio plan");
  assert.equal(h.get("syncSamples.length"), 1);
  h.advance(600);
  await h.due();
  assert.equal(h.requests.length, 2);
  await h.complete(1, { now: 132600 });
  assertLightRequest(h.effects.timing.at(-1).options);
});

test("coincident online, focus and visibility restoration coalesce into one measurement", async () => {
  const h = harness();
  h.set("signalsInvalidatedWhileHidden = true; eventSourceConnected = false;");
  h.event("online");
  h.event("focus");
  h.event("visibilitychange");
  assert.equal(h.effects.audio.length, 1);
  await h.due();
  assert.equal(h.requests.length, 1);
  assert.equal(h.effects.restart, 1);
  await h.complete();
  assert.equal(h.requests.length, 1);
  assert.equal(h.get("resumeSyncInProgress"), false);
});

test("a queued weak recovery is upgraded when a clock repair arrives before dispatch", async () => {
  const h = harness();
  h.event("online");
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 1);
  await h.complete(0, { now: 132000 });
  assert.equal(h.effects.timing.at(-1).options.forceClockCorrection, true);
  assert.equal(h.get("syncRequestGeneration"), 1);
});

test("light recovery retains an in-flight request and drains only after that response is applied", async () => {
  const h = harness();
  const ordinary = h.context.syncFromServer();
  assert.equal(h.requests.length, 1);
  h.event("online");
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.signal.aborted, false);
  assert.equal(h.get("syncRequestGeneration"), 0);
  assert.equal(h.get("syncRequestInFlight"), true);
  await h.complete(0);
  assert.equal(await ordinary, true);
  assert.equal(h.effects.timing.length, 1);
  assert.equal(h.requests.length, 2);
  await h.complete(1);
  assertLightRequest(h.effects.timing.at(-1).options);
  assert.equal(h.get("syncSamples.length"), 5);
});

test("clock recovery aborts pre-repair timing and late success cannot clear a newer request", async () => {
  const h = harness();
  const old = h.context.syncFromServer();
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].options.signal.aborted, true);
  await h.complete(0, { now: 102000 });
  assert.equal(await old, false);
  assert.equal(h.effects.timing.length, 0);
  assert.equal(h.get("syncRequestInFlight"), true);
  await h.complete(1, { now: 132000 });
  assert.equal(h.effects.timing.length, 1);
  assert.equal(h.get("syncRequestInFlight"), false);
});

test("obsolete pre-repair failures do not mark the current connection unavailable", async () => {
  const h = harness();
  const old = h.context.syncFromServer();
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  await h.fail(0);
  assert.equal(await old, false);
  assert.equal(h.effects.failures, 0);
  assert.equal(h.get("syncRequestInFlight"), true);
  await h.complete(1, { now: 132000 });
});

test("failed recovery releases the coordinator and permits another measured attempt", async () => {
  const h = harness();
  h.event("online");
  await h.due();
  await h.fail(0);
  assert.equal(h.effects.failures, 1);
  assert.equal(h.get("resumeSyncInProgress"), false);
  assert.equal(h.get("syncRequestInFlight"), false);
  h.advance(1200);
  h.event("online");
  await h.due();
  assert.equal(h.requests.length, 2);
  await h.complete(1);
});

test("main-stream heartbeat recovery remains a transport operation, not a forced clock reset", async () => {
  const h = harness();
  h.set("lastSseEventAt = -30000;");
  h.context.checkSseHeartbeat();
  await h.due();
  assert.equal(h.effects.restart, 1);
  assert.equal(h.get("syncSamples.length"), 3);
  assert.equal(h.get("syncRequestGeneration"), 0);
  await h.complete();
  assertLightRequest(h.effects.timing.at(-1).options);
});

test("standalone file-page visibility restores audio locally without HTTP or stream restart", async () => {
  const h = harness();
  h.context.window.location.protocol = "file:";
  h.set("standaloneMode = true; signalsInvalidatedWhileHidden = true;");
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 0);
  assert.equal(h.effects.restart, 0);
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("syncSamples.length"), 3);
  assert.equal(h.effects.localList, 1);
});

test("clock continuity repair detects 100 ms mismatch even within a short observation interval", () => {
  for (const [wallDelta, perfDelta, repaired] of [
    [99, 0, false], [100, 0, true], [2000, 1901, false], [2000, 1900, true],
    [3000, 2901, false], [3000, 2900, true], [3000, 3100, true]
  ]) {
    const h = harness();
    h.advance(wallDelta, perfDelta);
    assert.equal(h.context.repairServerClockAfterSuspension(), repaired, `${wallDelta}/${perfDelta}`);
    assert.equal(h.get("syncSamples.length"), repaired ? 0 : 3);
  }
});

test("persisted pageshow can rebuild stale audio without a discontinuity in measured time", async () => {
  const h = harness();
  h.event("pageshow", { persisted: true });
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("syncSamples.length"), 3);
  await h.due();
  await h.complete();
  const options = h.effects.timing.at(-1).options;
  assert.equal(Boolean(options.forceClockCorrection), false);
  assert.equal(Boolean(options.resetClockSamples), false);
  assert.equal(Boolean(options.replaceAudioSchedule), false);
  assert.equal(options.rescheduleSignals, true);
});

test("lightweight event throttling uses the monotonic clock and does not create a request storm", async () => {
  const h = harness();
  h.event("online");
  await h.due();
  for (let i = 0; i < 20; i += 1) h.event(i % 2 ? "online" : "focus");
  await h.due();
  assert.equal(h.requests.length, 1);
  await h.complete();
  h.advance(1199);
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 1);
  h.advance(-1000, 1);
  h.event("online");
  await h.due();
  assert.equal(h.requests.length, 2, "wall-clock rollback must not extend the throttle");
  await h.complete();
});

test("clock repair during coordinator work waits for old cancellation and retains the stronger intent", async () => {
  const h = harness();
  h.event("online");
  await h.due();
  assert.equal(h.get("resumeSyncInProgress"), true);
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  assert.equal(h.requests.length, 1, "the coordinator must remain serialized");
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.equal(h.get("syncRequestGeneration"), 1);
  await h.fail(0);
  assert.equal(h.effects.failures, 0);
  assert.equal(h.requests.length, 2);
  assert.equal(h.get("resumeSyncInProgress"), true);
  assert.equal(h.get("syncRequestInFlight"), true);
  await h.complete(1, { now: 132000 });
  assert.equal(h.effects.timing.at(-1).options.forceClockCorrection, true);
  assert.equal(h.effects.timing.at(-1).options.resetClockSamples, true);
  assert.equal(h.effects.timing.at(-1).options.replaceAudioSchedule, true);
  assert.equal(h.get("resumeSyncInProgress"), false);
});

test("a second repaired-clock episode cancels its predecessor's scheduled follow-up", async () => {
  const h = harness();
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  await h.complete(0, { now: 132000 });
  const oldFollowup = h.get("clientRecoveryFollowupTimer");
  assert.notEqual(oldFollowup, null);
  h.set("trustedServerClockAnchor = {wallAt: 132000, perfAt: 2100, serverAt: 132000};");
  h.advance(30000, 100);
  h.event("focus");
  assert.equal(h.timers.has(oldFollowup), false);
  await h.due();
  assert.equal(h.requests.length, 2);
  await h.complete(1, { now: 162000 });
  h.advance(600);
  await h.due();
  assert.equal(h.requests.length, 3);
  await h.complete(2, { now: 162600 });
  assertLightRequest(h.effects.timing.at(-1).options);
});

test("recovery follow-up waits behind a periodic request without discarding that measurement", async () => {
  const h = harness();
  h.advance(30000, 100);
  h.event("focus");
  await h.due();
  await h.complete(0, { now: 132000 });
  h.advance(600);
  const ordinary = h.context.syncFromServer();
  await h.due();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.signal.aborted, false);
  await h.complete(1, { now: 132600 });
  assert.equal(await ordinary, true);
  assert.equal(h.requests.length, 3);
  await h.complete(2, { now: 132600 });
  assertLightRequest(h.effects.timing.at(-1).options);
  assert.equal(h.get("syncSamples.length"), 3);
});

test("network failure cannot leave a mobile resume snap permanently hiding the countdown", async () => {
  const h = harness();
  h.set("mobileResumeSyncEnabled = true; signalsInvalidatedWhileHidden = true;");
  h.advance(30000, 100);
  h.event("focus");
  assert.equal(h.get("resumeSnapPending"), true);
  await h.due();
  h.advance(2600);
  await h.due();
  assert.equal(h.get("resumeSnapPending"), false);
  assert.equal(h.requests[0].options.signal.aborted, true);
  assert.ok(h.effects.render.includes("resume"));
  await h.fail();
  assert.equal(h.get("resumeSyncInProgress"), false);
  assert.equal(h.get("syncRequestInFlight"), false);
});

test("becoming hidden before the measured response still restores timed sound", async () => {
  const h = harness();
  h.set("signalsInvalidatedWhileHidden = true;");
  h.event("focus");
  assert.equal(h.effects.audio.length, 1);
  h.context.document.hidden = true;
  h.context.document.visibilityState = "hidden";
  await h.due();
  await h.complete();
  const options = h.effects.timing.at(-1).options;
  assert.equal(options.rescheduleSignals, true);
  assert.equal(options.includeRecentPhaseSignal, true);
  assert.equal(Boolean(options.replaceAudioSchedule), false);
  assert.equal(h.effects.audio.length, 2);
});

test("a hidden standalone page ignores online without consuming its audio recovery state", async () => {
  const h = harness();
  h.context.window.location.protocol = "file:";
  h.context.document.hidden = true;
  h.set("standaloneMode = true; signalsInvalidatedWhileHidden = true; pageHiddenAt = 101000;");
  h.event("online");
  await h.due();
  assert.equal(h.requests.length, 0);
  assert.equal(h.effects.audio.length, 0);
  assert.equal(h.get("signalsInvalidatedWhileHidden"), true);
  assert.equal(h.get("pageHiddenAt"), 101000);
});

test("callbacks queued on a replaced EventSource cannot change contact, availability or timer state", async () => {
  const h = harness();
  h.set("eventSource = null; eventSourceConnected = false;");
  h.context.startEventStream();
  const old = h.streams[0];
  old.open();
  old.dispatch("state", { now: 102000, version: 7, running: true });
  assert.equal(h.effects.state.length, 1);
  old.fail();
  h.event("online");
  await h.due();
  assert.equal(h.streams.length, 2);
  assert.equal(old.closed, true);
  const before = { state: h.effects.state.length, contact: h.effects.contact, failures: h.effects.failures };
  old.open();
  old.dispatch("state", { now: 99000, version: 8, running: false });
  old.dispatch("ping");
  old.fail();
  assert.deepEqual({ state: h.effects.state.length, contact: h.effects.contact, failures: h.effects.failures }, before);
  assert.equal(h.get("eventSourceConnected"), false);
  h.streams[1].open();
  h.streams[1].dispatch("state", { now: 102000, version: 7, running: true });
  assert.equal(h.effects.state.length, 2);
  assert.equal(h.get("eventSourceConnected"), true);
  await h.complete();
});

test("diagnostics contact cannot mask a silent main state stream", async () => {
  const h = harness();
  h.set("lastSseEventAt = -30000;");
  h.context.startDiagnosticsStream();
  const diagnostics = h.streams[0];
  diagnostics.open();
  diagnostics.dispatch("ping");
  diagnostics.dispatch("diagnostics", { clients: [] });
  assert.equal(h.effects.contact, 3);
  assert.equal(h.get("lastSseEventAt"), -30000);
  h.context.checkSseHeartbeat();
  await h.due();
  assert.equal(h.effects.restart, 1);
  await h.complete();
  assertLightRequest(h.effects.timing.at(-1).options);
});

test("manual HTTP standalone restores page audio locally, not through server recovery", async () => {
  const h = harness();
  assert.equal(h.context.window.location.protocol, "http:");
  h.set("standaloneMode = true; signalsInvalidatedWhileHidden = true;");
  h.event("focus");
  await h.due();
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.get("signalsInvalidatedWhileHidden"), false);
  assert.equal(h.effects.localList, 1);
  assert.equal(h.requests.length, 0);
  assert.equal(h.effects.restart, 0);
  assert.equal(h.get("syncSamples.length"), 3);
});

test("actual recent-phase and local-reschedule helpers cannot plan sound while frozen", () => {
  const clears = [];
  const context = vm.createContext({
    document: { hidden: true }, state: { running: true, countdownOnly: false },
    clearSignalTimers: (...args) => clears.push(args),
    elapsedSeconds: () => { throw new Error("hidden page must not inspect elapsed audio plan"); },
    scheduleBufferedSignalAt: () => { throw new Error("hidden page must not schedule a cue"); },
    scheduleSegmentSignals: () => { throw new Error("hidden page must not schedule warnings"); }
  });
  vm.runInContext(`
    let signalsInvalidatedWhileHidden = false, pageAudioSuspended = true, lastSegmentIndex = "1:rotation";
    ${source("scheduleRecentPhaseSignalAfterResume")}
    ${source("rescheduleStandaloneSignals")}
  `, context);
  assert.equal(context.scheduleRecentPhaseSignalAfterResume({ cycle: 2, type: "rotation", start: 60 }), false);
  context.rescheduleStandaloneSignals({ forceStopAudio: true, includeRecentPhaseSignal: true });
  assert.deepEqual(clears, [[false, true, false]]);
  assert.equal(vm.runInContext("signalsInvalidatedWhileHidden", context), false);
  assert.equal(vm.runInContext("lastSegmentIndex", context), -1);
});

test("weak return events cannot reveal a stale mobile countdown while forced recovery is pending or active", async () => {
  for (const stage of ["pending", "active"]) {
    const h = harness();
    h.set("mobileResumeSyncEnabled = true;");
    h.advance(30000, 100);
    h.event("focus");
    assert.equal(h.get("resumeSnapPending"), true);
    if (stage === "active") await h.due();
    h.event("focus");
    h.event("online");
    assert.equal(h.get("resumeSnapPending"), true, `${stage} forced calibration must retain its display snap`);
    await h.due();
    assert.equal(h.requests.length, 1);
    assert.equal(h.get("resumeSnapPending"), true);
    await h.complete(0, { now: 132000 });
    assert.equal(h.get("resumeSnapPending"), false);
  }
});

test("a connecting or closed EventSource is repaired even if its connected flag is stale", async () => {
  for (const readyState of [0, 2]) {
    const h = harness();
    h.set(`eventSourceConnected = true; eventSource.readyState = ${readyState};`);
    h.event("online");
    await h.due();
    assert.equal(h.effects.restart, 1, `readyState ${readyState}`);
    assert.equal(h.get("syncSamples.length"), 3);
    await h.complete();
    assertLightRequest(h.effects.timing.at(-1).options);
  }
});

test("a measured poll after stopped performance time calibrates before any later wake event", async () => {
  const h = harness({ realClockTiming: true });
  h.advance(30000, 100);
  const poll = h.context.syncFromServer();
  await h.complete(0, { now: 132000, serverReceivedAt: 132000, serverSentAt: 132000 });
  assert.equal(await poll, true);
  assert.equal(h.get("serverNow()"), 132000,
    "pre-sleep and post-sleep performance epochs must not be fitted together");
  assert.equal(h.get("syncSamples.length"), 1);
  assert.equal(h.get("trustedServerClockAnchor.serverAt"), 132000);
  assert.equal(h.get("trustedServerClockAnchor.perfAt"), 2100);
  h.event("focus");
  assert.equal(h.get("serverNow()"), 132000,
    "the later wake detector must not overwrite a newly measured server anchor");
});

test("a measured poll after a two-second sleep discards the old epoch instead of fitting a late countdown", async () => {
  const h = harness({ realClockTiming: true });
  h.advance(2000, 0);
  const poll = h.context.syncFromServer();
  await h.complete(0, { now: 104000, serverReceivedAt: 104000, serverSentAt: 104000 });
  assert.equal(await poll, true);
  assert.equal(h.get("serverNow()"), 104000);
  assert.equal(h.get("syncSamples.length"), 1,
    "a short real sleep must not poison the established fit with the stopped performance epoch");
  assert.equal(h.get("clockCalibrationPending"), false);
  assert.equal(h.get("trustedServerClockAnchor.serverAt"), 104000);
});

test("an accepted extreme server rate does not make matching local clock intervals look suspended", async () => {
  const h = harness({ realClockTiming: true });
  h.set("serverClockRate = 1.1;");
  const samples = h.get("JSON.stringify(syncSamples)");
  h.advance(3000);
  assert.equal(h.context.repairServerClockAfterSuspension(), false);
  assert.equal(h.get("clockCalibrationPending"), false);
  assert.equal(h.get("JSON.stringify(syncSamples)"), samples);
  const poll = h.context.syncFromServer();
  h.advance(1500);
  await h.complete(0, { now: 105750, serverReceivedAt: 105000, serverSentAt: 106500 });
  assert.equal(await poll, true);
  assert.equal(h.get("clockCalibrationPending"), false);
  assert.equal(h.requests.length, 1, "a valid long request needs no extra forced calibration");
  assert.equal(h.get("syncSamples.length"), 4);
});

test("continuous performance time does not let an older trusted anchor undo a measured clock correction", () => {
  const h = harness({ realClockTiming: true });
  h.context.updateServerTiming({ now: 102500, serverReceivedAt: 102500, serverSentAt: 102500,
    version: 7, serverInstanceId: "server-a" }, {
    date0: 102000, date1: 102000, perf0: 2000, perf1: 2000
  }, { forceClockCorrection: true, resetClockSamples: true });
  assert.equal(h.get("serverNow()"), 102500);
  h.advance(3000);
  h.event("focus");
  assert.equal(h.get("serverNow()"), 105500);
  assert.equal(h.get("syncSamples.length"), 1);
  assert.equal(h.get("syncRequestGeneration"), 0);
});

test("system wall-clock changes with continuously advancing performance cannot jump competition time", async () => {
  for (const wallDelta of [3603000, -3597000]) {
    const h = harness({ realClockTiming: true });
    h.advance(wallDelta, 3000);
    h.event("focus");
    assert.equal(h.get("serverNow()"), 105000, `wall delta ${wallDelta}`);
    await h.due();
    await h.complete(0, { now: 105000, serverReceivedAt: 105000, serverSentAt: 105000 });
    assert.equal(h.get("serverNow()"), 105000);
    assert.equal(h.get("trustedServerClockAnchor.serverAt"), 105000);
  }
});

test("real measured network recovery preserves the good sample history and stable server time", async () => {
  const h = harness({ realClockTiming: true });
  h.advance(3000);
  const oldSamples = h.get("JSON.stringify(syncSamples)");
  h.event("online");
  assert.equal(h.get("JSON.stringify(syncSamples)"), oldSamples);
  await h.due();
  await h.complete();
  assert.equal(h.get("syncSamples.length"), 4);
  assert.equal(h.get("serverNow()"), 105000);
  assertLightRequest(h.effects.timing.at(-1).options);
});

test("an HTTP timing interval spanning stopped performance time is rejected until a fresh measured request", async () => {
  const h = harness({ realClockTiming: true });
  const spanning = h.context.syncFromServer();
  h.advance(30000, 100);
  await h.complete(0, { now: 132000, serverReceivedAt: 102000, serverSentAt: 132000 });
  await spanning;
  assert.equal(h.get("serverNow()"), 102100,
    "an invalid request midpoint must not calibrate competition time");
  assert.equal(h.get("syncSamples.length"), 0);
  assert.equal(h.get("clockCalibrationPending"), true);
  assert.equal(h.requests.length, 2, "clock repair needs a request wholly inside the new performance epoch");
  await h.complete(1, { now: 132000, serverReceivedAt: 132000, serverSentAt: 132000 });
  assert.equal(h.get("serverNow()"), 132000);
  assert.equal(h.get("syncSamples.length"), 1);
  assert.equal(h.get("clockCalibrationPending"), false);
});

test("sleep between received headers and JSON application cannot turn an old response into a fresh clock sample", async () => {
  const h = harness({ realClockTiming: true });
  const old = h.context.syncFromServer();
  const finishJson = await h.receiveHeaders(0, { now: 102000, serverReceivedAt: 102000, serverSentAt: 102000 });
  h.advance(30000, 100);
  await finishJson();
  await old;
  assert.equal(h.get("serverNow()"), 102100);
  assert.equal(h.get("syncSamples.length"), 0);
  assert.equal(h.get("clockCalibrationPending"), true);
  assert.equal(h.requests.length, 2);
  await h.complete(1, { now: 132000, serverReceivedAt: 132000, serverSentAt: 132000 });
  assert.equal(h.get("serverNow()"), 132000);
  assert.equal(h.get("syncSamples.length"), 1);
  assert.equal(h.get("clockCalibrationPending"), false);
});

test("a recovered timing-only response restores audio locally without waiting for another state request", async () => {
  const h = harness({ realClockTiming: true });
  h.set("clockCalibrationPending = true; syncSamples = []; resumeSnapPending = true;");
  h.context.updateServerTiming({ now: 102000, serverReceivedAt: 102000, serverSentAt: 102000,
    version: 7, serverInstanceId: "server-a" }, {
    date0: 102000, date1: 102000, perf0: 2000, perf1: 2000
  });
  assert.equal(h.get("clockCalibrationPending"), false);
  assert.equal(h.effects.audio.length, 0, "audio restoration must wait until synchronous state application finishes");
  await h.due();
  assert.equal(h.effects.audio.length, 1);
  assert.equal(h.effects.audio[0].reason, "clock-calibrated");
  assert.equal(h.requests.length, 0);
  assert.ok(h.effects.render.includes("clock-calibrated"));
});
