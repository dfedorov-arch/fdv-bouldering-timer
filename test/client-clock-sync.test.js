"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function source(name, optional = false) {
  const match = html.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  if (optional && !match) return "";
  assert.ok(match, name);
  return match[0];
}

function harness({ samples = true, sampleOffset = 0 } = {}) {
  let now = 2000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const context = vm.createContext({
    performance: { now: () => now }, Date: { now: () => 100000 + now },
    window: {
      setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
      clearTimeout: id => timers.delete(id)
    },
    scheduleDisplayBoundary: () => {}, refreshTrustedClockAnchor: () => {},
    syncFromServer: options => { requests.push(options); return Promise.resolve(true); }
  });
  const constants = ["syncSampleWindowMs", "syncMaxSamples", "syncRateMinSpanMs", "syncRateLargeMin",
    "syncRateLargeMax", "syncRateNormalMin", "syncRateNormalMax", "syncRateStableMinSamples",
    "syncRateStableMaxResidualMs", "syncRateStableMaxHalfDiffPpm", "syncRateStableMaxOutlierShare",
    "syncRateConfirmationTolerancePpm", "syncRateConfirmationWindows", "syncRateLargeThresholdPpm",
    "syncRateDeadband", "syncRateSmoothing"]
    .map(name => html.match(new RegExp(`const ${name} = [^;]+;`))[0]).join("\n");
  const seeds = samples ? [0, 500, 1000].map(perfTime => ({
    at: perfTime, latency: 4, networkLatency: 4, perfTime,
    serverTime: 100000 + sampleOffset + perfTime,
    clockOffset: sampleOffset, perfOffset: 100000 + sampleOffset
  })) : [];
  vm.runInContext(`
    ${constants}
    ${html.match(/const serverClockRecoveryCooldownMs = [^;]+;/)?.[0] || "const serverClockRecoveryCooldownMs = 2000;"}
    let serverTimeAnchor = 100000, serverPerfAnchor = 0, serverClockRate = 1;
    let serverPerfOffset = 100000, serverTimeOffset = 0, lastServerVersion = 7;
    let lastServerInstanceId = "server-a", lastMeasuredClockServerInstanceId = "server-a";
    let serverClockRateConfidence = "normal", serverClockRateGateReason = "normal";
    let serverClockRateHighConfidence = false;
    let pendingServerClockRatePpm = null, pendingServerClockRateCount = 0;
    let serverClockRecoveryTimer = null, lastServerClockRecoveryAt = -Infinity;
    let standaloneMode = false, syncRequestInFlight = false;
    let syncSamples = ${JSON.stringify(seeds)};
    let syncQuality = {error: 2, latency: 4, jitter: 0, samples: ${seeds.length}, rate: 1};
    ${["serverNow", "clampFloat", "median", "percentile", "fitClockRate",
      "resetServerClockRateConfirmation", "applyServerClockModel", "updateServerTiming"].map(name => source(name)).join("\n")}
    ${source("requestMeasuredClockSync", true)}
  `, context);
  return {
    context, timers, requests,
    at(value) { now = value; },
    get(expression) { return vm.runInContext(expression, context); },
    set(expression) { vm.runInContext(expression, context); },
    update(remote, timing = {}, options = {}) { context.updateServerTiming(remote, timing, options); },
    fire() {
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
    measured(offset = 0, extra = {}, options = {}) {
      context.updateServerTiming({now: 100000 + now - 1 + offset,
        serverReceivedAt: 100000 + now - 3 + offset,
        serverSentAt: 100000 + now - 1 + offset,
        version: 7, serverInstanceId: "server-a", ...extra}, {
        perf0: now - 4, perf1: now, date0: 100000 + now - 4, date1: 100000 + now
      }, options);
    }
  };
}

test("delayed or future SSE timestamps never move an already calibrated clock or change its quality", () => {
  for (const offset of [-10000, -1500, -1100, -1000, -300, 1500]) {
    const h = harness();
    const samples = h.get("JSON.stringify(syncSamples)");
    const quality = h.get("JSON.stringify(syncQuality)");
    h.update({now: 102000 + offset, version: 7, serverInstanceId: "server-a"});
    assert.equal(h.get("serverNow()"), 102000, `push timestamp offset ${offset}`);
    assert.equal(h.get("JSON.stringify(syncSamples)"), samples);
    assert.equal(h.get("JSON.stringify(syncQuality)"), quality);
    assert.equal(h.timers.size, Math.abs(offset) > 1000 ? 1 : 0);
  }
});

test("unmeasured force/reset flags cannot bypass clock protection or discard trusted samples", () => {
  const h = harness();
  h.update({now: 100500, version: 8}, {}, {forceClockCorrection: true, resetClockSamples: true});
  assert.equal(h.get("serverNow()"), 102000);
  assert.equal(h.get("syncSamples.length"), 3);
  assert.equal(h.get("lastServerVersion"), 8);
  assert.equal(h.timers.size, 1);
});

test("missing, empty, non-finite or reversed request timing does not qualify as a measured clock sample", () => {
  for (const timing of [
    {}, {date0: null, date1: null, perf0: null, perf1: null},
    {date0: "", date1: "", perf0: "", perf1: ""},
    {date0: 101996, date1: 102000, perf0: NaN, perf1: 2000},
    {date0: 101996, date1: 102000, perf0: 2000, perf1: 1996}
  ]) {
    const h = harness();
    h.update({now: 100500, version: 7}, timing);
    assert.equal(h.get("serverNow()"), 102000);
    assert.equal(h.get("syncSamples.length"), 3);
  }
});

test("recovery requests are coalesced, rate limited and never bypass an in-flight synchronization", () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.update({now: 100500});
  assert.equal(h.timers.size, 1);
  h.fire();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].skipBurst, true);
  assert.equal(h.requests[0].forceClockCorrection, undefined);
  h.update({now: 100500});
  assert.equal(h.timers.size, 0);
  h.at(4000);
  h.set("syncRequestInFlight = true");
  h.update({now: 100500});
  assert.equal(h.timers.size, 0);
  h.set("syncRequestInFlight = false");
  h.update({now: 100500});
  assert.equal(h.timers.size, 1);
  h.set("syncRequestInFlight = true");
  h.fire();
  assert.equal(h.requests.length, 1);
});

test("standalone mode neither reanchors its clock nor makes recovery requests on push input", () => {
  const h = harness();
  h.set("standaloneMode = true");
  h.update({now: 100500});
  assert.equal(h.get("serverNow()"), 102000);
  assert.equal(h.timers.size, 0);
});

test("a measured response cancels a queued recovery, and entering standalone cancels its dispatch", () => {
  for (const complete of [h => h.measured(), h => h.set("standaloneMode = true")]) {
    const h = harness();
    h.update({now: 100500});
    assert.equal(h.timers.size, 1);
    complete(h);
    h.fire();
    assert.equal(h.timers.size, 0);
    assert.equal(h.requests.length, 0);
  }
});

test("initial push requests a measured sample, and the first measured response calibrates the clock", () => {
  const h = harness({samples: false});
  h.update({now: 50000, serverInstanceId: "server-a"});
  assert.equal(h.get("serverNow()"), 102000);
  assert.equal(h.timers.size, 1);
  h.measured(-52000);
  assert.equal(h.get("serverNow()"), 50000);
  assert.equal(h.get("syncSamples.length"), 1);
});

test("a server restart calibrates from the new measured response without mixing old-instance samples", () => {
  const h = harness({sampleOffset: 600});
  h.update({now: 105000, serverInstanceId: "server-b", version: 1});
  assert.equal(h.get("serverNow()"), 102000);
  assert.equal(h.get("syncSamples.length"), 3);
  assert.equal(h.timers.size, 1);
  h.measured(3000, {serverInstanceId: "server-b", version: 1});
  assert.equal(h.get("serverNow()"), 105000);
  assert.equal(h.get("syncSamples.length"), 1);
  assert.equal(h.get("lastMeasuredClockServerInstanceId"), "server-b");
});

test("measured resume still permits explicit sample reset and immediate clock correction", () => {
  const h = harness();
  h.measured(1500, {}, {forceClockCorrection: true, resetClockSamples: true, preserveClockRate: true});
  assert.equal(h.get("serverNow()"), 103500);
  assert.equal(h.get("syncSamples.length"), 1);
});

test("measured requests with no server receive/send metadata still support initial calibration", () => {
  const h = harness({samples: false});
  h.update({now: 102000, serverInstanceId: "server-a"}, {
    date0: 101996, date1: 102000, perf0: 1996, perf1: 2000
  });
  assert.equal(h.get("serverNow()"), 102002);
  assert.equal(h.get("syncSamples.length"), 1);
});

test("ordinary measured synchronization retains its 250 ms step limit", () => {
  const h = harness({sampleOffset: 600});
  h.measured(600);
  assert.equal(h.get("serverNow()"), 102250);
  assert.equal(h.get("syncSamples.length"), 4);
});

test("delayed JSON handling is projected to the current clock instead of forcing a jump from raw remote.now", () => {
  const h = harness({sampleOffset: 600});
  h.update({now: 100603, serverReceivedAt: 100601, serverSentAt: 100603,
    serverInstanceId: "server-a", version: 7}, {perf0: 0, perf1: 4, date0: 100000, date1: 100004});
  assert.equal(h.get("serverNow()"), 102250);
});

test("SSE clock rejection does not short-circuit authoritative timer state application", () => {
  const apply = source("applyServerState");
  const timingAt = apply.indexOf("updateServerTiming(remote");
  const stateAt = apply.indexOf("state.running = Boolean(remote.running)");
  assert.ok(timingAt >= 0 && stateAt > timingAt);
  assert.doesNotMatch(apply.slice(timingAt, stateAt), /if\s*\(|return\b/);
  assert.match(apply, /state\.serverStartedAt = Number\(remote\.startedAt/);
  assert.match(apply, /render\("state-update"\)/);
});
