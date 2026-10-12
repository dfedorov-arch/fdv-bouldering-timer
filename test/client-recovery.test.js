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
function harness() {
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
    syncBrowserNumberDisplay() {}, handleAudioTest() {}, wakeAudioOutput() {},
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
  vm.runInContext(`
    let standaloneMode = false, offlineReloadMode = false, serverAvailable = true;
    let serverTimeAnchor = 100000, serverPerfAnchor = 0, serverClockRate = 1;
    let serverPerfOffset = 100000, serverTimeOffset = 0;
    let serverClockRateHighConfidence = true, serverClockRateConfidence = "normal";
    let serverClockRateGateReason = "normal", pendingServerClockRatePpm = null, pendingServerClockRateCount = 0;
    let syncSamples = ${JSON.stringify(seedSamples)};
    let syncQuality = { error: 2, latency: 4, jitter: 0, samples: 3, rate: 1 };
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
    let pendingServerState = null, lastStartListServerRevision = "lists-a";
    let isPrimaryClient = false, eventSource = { readyState: 1 }, eventSourceConnected = true;
    let eventStreamGeneration = 3, lastSseEventAt = 2000, sseRestarts = 0;
    let diagnosticsEventSource = null, diagnosticsStreamGeneration = 0;
    const clientId = "recovery-test";
    let mobileResumeSyncEnabled = false;
    const syncRequestTimeoutMs = 2000, staleResumeAfterMs = 3000, resumeSnapMaxWaitMs = 2600;
    const clockContinuityGapMs = 3000, clockContinuityMismatchMs = 100;
    const offlineSnapshotMaxAgeMs = 86400000, sseSilentRestartMs = 25000;
    const syncRateLargeMin = 0.95, syncRateLargeMax = 1.05;
    ${["serverNow", "clampFloat", "applyServerClockModel", "reanchorServerClockModel",
      "resetServerClockRateConfirmation", "repairServerClockAfterSuspension", "holdClockRateForResume",
      "clearResumeSnapPending", "beginResumeSnapPending", "shouldResetSignalsOnResume",
      "isLocalStandalonePage", "resumeLocalPageAfterSuspension", "cancelServerSyncForClockRecovery",
      "queueClientRecoverySync", "scheduleClientRecoverySync", "flushClientRecoverySync",
      "resumeClientSync", "handleClientRecoveryEvent", "syncFromServer", "checkSseHeartbeat",
      "markSseEvent", "startEventStream", "restartEventStream", "startDiagnosticsStream",
      "stopDiagnosticsStream"].map(source).join("\n")}
  `, context);
  const get = expression => vm.runInContext(expression, context);
  const set = expression => vm.runInContext(expression, context);
  const restartEventStream = context.restartEventStream;
  context.restartEventStream = () => {
    effects.restart += 1;
    restartEventStream();
  };
  context.syncDiagnosticsStream = () => { effects.diagnostics += 1; };
  context.updateServerTiming = (remote, timing, options = {}) => {
    effects.timing.push({ remote, timing, options: { ...options } });
    if (options.resetClockSamples) set("syncSamples = [];");
    if (timing) {
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

test("long hidden-page recovery rebuilds audio without treating continuous clocks as suspended", async () => {
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
  assert.equal(h.get("serverNow()"), 132000);
  assert.equal(h.get("syncSamples.length"), 0);
  assert.equal(h.get("syncRequestGeneration"), 1);
  assert.equal(h.effects.audio.length, 1, "local clock repair must not rebuild sound twice");
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

test("clock continuity repair respects both the 3 s observation gap and 100 ms mismatch threshold", () => {
  for (const [wallDelta, perfDelta, repaired] of [
    [2999, 0, false], [3000, 2901, false], [3000, 2900, true], [3000, 3100, true]
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

test("becoming hidden before the measured response does not restart hidden sound", async () => {
  const h = harness();
  h.set("signalsInvalidatedWhileHidden = true;");
  h.event("focus");
  assert.equal(h.effects.audio.length, 1);
  h.context.document.hidden = true;
  h.context.document.visibilityState = "hidden";
  await h.due();
  await h.complete();
  const options = h.effects.timing.at(-1).options;
  assert.equal(options.rescheduleSignals, false);
  assert.equal(options.includeRecentPhaseSignal, false);
  assert.equal(Boolean(options.replaceAudioSchedule), false);
  assert.equal(h.effects.audio.length, 1);
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

test("actual recent-phase and local-reschedule helpers cannot plan sound while hidden", () => {
  const clears = [];
  const context = vm.createContext({
    document: { hidden: true }, state: { running: true, countdownOnly: false },
    clearSignalTimers: (...args) => clears.push(args),
    elapsedSeconds: () => { throw new Error("hidden page must not inspect elapsed audio plan"); },
    scheduleBufferedSignalAt: () => { throw new Error("hidden page must not schedule a cue"); },
    scheduleSegmentSignals: () => { throw new Error("hidden page must not schedule warnings"); }
  });
  vm.runInContext(`
    let signalsInvalidatedWhileHidden = false, lastSegmentIndex = "1:rotation";
    ${source("scheduleRecentPhaseSignalAfterResume")}
    ${source("rescheduleStandaloneSignals")}
  `, context);
  assert.equal(context.scheduleRecentPhaseSignalAfterResume({ cycle: 2, type: "rotation", start: 60 }), false);
  context.rescheduleStandaloneSignals({ forceStopAudio: true, includeRecentPhaseSignal: true });
  assert.deepEqual(clears, [[false, true]]);
  assert.equal(vm.runInContext("signalsInvalidatedWhileHidden", context), true);
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
