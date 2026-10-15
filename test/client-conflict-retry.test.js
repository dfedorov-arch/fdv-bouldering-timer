"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createActionTransport, reconcileServerStateIdentity, timerClockState } = require("../lib/client-action-transport");

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

function makeTransport(fetchImpl, overrides = {}) {
  let version = 10;
  let serverInstanceId = "server-a";
  let commandSequence = 0;
  const applied = [];
  const applyErrors = [];
  const failures = [];
  const transport = createActionTransport({
    applyRemote: (remote, options) => {
      version = remote.version || version;
      serverInstanceId = remote.serverInstanceId || serverInstanceId;
      applied.push({ remote, options });
    },
    clientDiagnostics: () => ({ clientId: "test-client" }),
    fetch: fetchImpl,
    getBaseVersion: () => version,
    getServerInstanceId: () => serverInstanceId,
    isAvailable: () => true,
    isRuntimeCommand: (type) => new Set(["start", "pause", "stopCountdown", "reset", "seek"]).has(type),
    isStandalone: () => false,
    markFailure: (immediate) => failures.push(immediate),
    reportApplyError: (error, context) => applyErrors.push({ error, context }),
    nextCommandId: () => `test-client:page-session:${++commandSequence}`,
    requestTimeoutMs: 2000,
    serverNow: () => 123456,
    updateTiming: () => {},
    delay: async () => {},
    ...overrides
  });
  return { applied, applyErrors, failures, transport };
}

test("monotonic runtime commands explicitly identify their time domain without changing legacy commands", async () => {
  for (const monotonic of [true, false]) {
    let request;
    const fixture = makeTransport(async (url, options) => {
      request = JSON.parse(options.body);
      return response(200, {serverInstanceId:"server-a",version:11});
    }, {usesTimerClock:() => monotonic});
    await fixture.transport.send("pause");
    assert.equal(request[monotonic ? "intendedTimerTime" : "intendedServerTime"], 123456);
    assert.equal(request[monotonic ? "intendedServerTime" : "intendedTimerTime"], undefined);
    assert.equal(request.baseServerInstanceId, "server-a");
  }
});

test("modern clock projection preserves calendar fields and is idempotent, old payloads remain unchanged", () => {
  const old = {now:220000,startedAt:200000,serverReceivedAt:219990,serverSentAt:220000};
  assert.equal(timerClockState(old), old);
  const remote = {...old,timerClock:{version:1,now:120000,receivedAt:119990,sentAt:120000,startedAt:100000}};
  const projected = timerClockState(remote);
  assert.equal(projected.now, 120000);
  assert.equal(projected.startedAt, 100000);
  assert.equal(projected.wallNow, old.now);
  assert.equal(projected.startedAtWall, old.startedAt);
  assert.equal(projected.serverReceivedAt, 119990);
  assert.equal(timerClockState(projected), projected);
  assert.equal(remote.now, old.now);
});

test("production client retries one version conflict with a fresh command id and version", async () => {
  const requests = [];
  const fixture = makeTransport(async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return response(409, { serverInstanceId: "server-b", version: 1, commandConflict: true });
    return response(200, { serverInstanceId: "server-b", version: 2, running: true });
  });

  const result = await fixture.transport.send("start", {
    settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true }
  });

  assert.equal(result, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].commandId, "test-client:page-session:1");
  assert.equal(requests[0].baseVersion, 10);
  assert.equal(requests[0].baseServerInstanceId, "server-a");
  assert.equal(requests[1].commandId, "test-client:page-session:2");
  assert.equal(requests[1].baseVersion, 1);
  assert.equal(requests[1].baseServerInstanceId, "server-b");
});

test("new server instance accepts a lower state version", () => {
  const reconcile = require("../lib/client-action-transport").reconcileServerStateIdentity;
  const restarted = reconcile("server-a", 31, { serverInstanceId: "server-b", version: 4 });
  assert.equal(restarted.instanceChanged, true);
  assert.equal(restarted.serverRestarted, true);
  assert.equal(restarted.stale, false);
  assert.equal(restarted.versionChanged, true);

  const stale = reconcile("server-b", 4, { serverInstanceId: "server-b", version: 3 });
  assert.equal(stale.instanceChanged, false);
  assert.equal(stale.stale, true);
});

test("retired instance response never becomes another server restart", () => {
  for (const retired of [new Set(["server-a"]), ["server-a"]]) {
    const old = reconcileServerStateIdentity("server-b", 4,
      { serverInstanceId: "server-a", version: 31 }, retired);
    assert.deepEqual(old, {
      instanceId: "server-b", instanceChanged: false, serverRestarted: false,
      stale: true, versionChanged: false, retired: true
    });
  }
});

test("retired identity guard preserves startup, current-instance timing and genuine new instances", () => {
  const startup = reconcileServerStateIdentity("", 0, { serverInstanceId: "server-a", version: 1 }, new Set());
  assert.equal(startup.instanceId, "server-a");
  assert.equal(startup.instanceChanged, true);
  assert.equal(startup.serverRestarted, false);
  assert.equal(startup.retired, false);

  const retired = new Set(["server-a"]);
  const oldVersion = reconcileServerStateIdentity("server-b", 4,
    { serverInstanceId: "server-b", version: 3 }, retired);
  assert.equal(oldVersion.stale, true);
  assert.equal(oldVersion.retired, false);
  const newInstance = reconcileServerStateIdentity("server-b", 4,
    { serverInstanceId: "server-c", version: 1 }, retired);
  assert.equal(newInstance.instanceChanged, true);
  assert.equal(newInstance.retired, false);
  const withoutId = reconcileServerStateIdentity("server-b", 4, { version: 4 }, retired);
  assert.equal(withoutId.instanceId, "server-b");
  assert.equal(withoutId.retired, false);
  // The optional set does not change the legacy API when it is omitted.
  assert.equal(reconcileServerStateIdentity("server-b", 4,
    { serverInstanceId: "server-a", version: 31 }).instanceChanged, true);
});

test("a delayed retired-instance action response cannot apply state, timing, rejection or conflict retry", async () => {
  for (const [status, options] of [[200, {}], [200, { applyResponse: false }], [409, {}], [403, {}]]) {
    let release;
    let currentInstance = "server-a";
    let attempts = 0;
    let timingUpdates = 0;
    const retired = new Set();
    const ready = new Promise(resolve => { release = resolve; });
    const fixture = makeTransport(async () => {
      attempts += 1;
      await ready;
      return response(status, { serverInstanceId: "server-a", version: 31,
        commandConflict: status === 409, primaryPinDenied: status === 403 });
    }, {
      acceptRemote: remote => !reconcileServerStateIdentity(currentInstance, 1, remote, retired).retired,
      updateTiming: () => { timingUpdates += 1; }
    });
    const result = fixture.transport.send("pause", {}, options);
    // A new session is accepted elsewhere while this response is in flight.
    retired.add(currentInstance);
    currentInstance = "server-b";
    release();
    assert.equal(await result, "conflict", `${status}: ${JSON.stringify(options)}`);
    assert.equal(attempts, 1);
    assert.equal(currentInstance, "server-b");
    assert.equal(fixture.applied.length, 0);
    assert.equal(timingUpdates, 0);
    assert.deepEqual(fixture.failures, []);
    assert.deepEqual(fixture.applyErrors, []);
  }
});

test("same-instance stale snapshot still provides measured timing", async () => {
  let timingUpdates = 0;
  const retired = new Set(["server-a"]);
  const fixture = makeTransport(async () => response(200, { serverInstanceId: "server-b", version: 3 }), {
    acceptRemote: remote => !reconcileServerStateIdentity("server-b", 4, remote, retired).retired,
    updateTiming: () => { timingUpdates += 1; }
  });
  assert.equal(await fixture.transport.send("settings", {}, { applyResponse: false }), true);
  assert.equal(timingUpdates, 1);
  assert.equal(fixture.applied.length, 0);
});

test("an identity guard failure is reported without network retries or state application", async () => {
  let attempts = 0;
  const guardError = new Error("identity guard failed");
  const fixture = makeTransport(async () => {
    attempts += 1;
    return response(200, { serverInstanceId: "server-a", version: 11 });
  }, { acceptRemote: () => { throw guardError; } });
  assert.equal(await fixture.transport.send("pause"), "conflict");
  assert.equal(attempts, 1);
  assert.equal(fixture.applied.length, 0);
  assert.deepEqual(fixture.failures, []);
  assert.equal(fixture.applyErrors.length, 1);
  assert.equal(fixture.applyErrors[0].error, guardError);
  const context = fixture.applyErrors[0].context;
  assert.equal(context.type, "pause");
  assert.equal(context.phase, "identity");
  assert.equal(context.status, 200);
  for (const name of ["date0", "date1", "perf0", "perf1"]) assert.ok(Number.isFinite(context.timing[name]), name);
});

test("non-runtime retired response returns false without state or network side effects", async () => {
  const fixture = makeTransport(async () => response(200, { serverInstanceId: "server-a", version: 31 }), {
    acceptRemote: () => false
  });
  assert.equal(await fixture.transport.send("settings"), false);
  assert.equal(fixture.applied.length, 0);
  assert.deepEqual(fixture.failures, []);
});

test("actual runtime controllers do not fall back to local mutations after a retired action response", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const [name, running, scheduled] of [
    ["startTimer", false, false], ["pauseTimer", true, false],
    ["hardReset", true, false], ["toggleScheduledCountdown", true, true]
  ]) {
    const match = html.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
    assert.ok(match, name);
    let attempts = 0;
    const fixture = makeTransport(async () => {
      attempts += 1;
      return response(200, { serverInstanceId: "server-a", version: 31, running: !running });
    }, { acceptRemote: () => false });
    const currentState = {running, completed: false, countdownOnly: scheduled,
      waitingForManualStart: false, elapsedBeforePause: 0, serverStartedAt: 123000,
      startedAt: 120000, accumulatedPause: 0, pausedAt: 0, activePreset: "classic", activeSettings: {oneShot: false}};
    const before = JSON.stringify(currentState);
    let localRenders = 0;
    const context = vm.createContext({
      state: currentState, controlsAvailable: () => true,
      requestScreenWakeLock() {}, unlockAudio() {},
      isBeforeScheduledStart: () => scheduled,
      shouldUseManualStartAudioLead: () => true,
      activeSettingsFromDraft: () => ({rotationSeconds: 60}), activeSettings: () => currentState.activeSettings,
      sendServerAction: (...args) => fixture.transport.send(...args),
      syncButtons() {}, render: () => {localRenders += 1;},
      clearSignalTimers() {}, elapsedSeconds: () => 17,
      performance: {now: () => 456000},
      document: {body: {classList: {remove() {}}}},
      buildTimeline() {}, signal() {}
    });
    vm.runInContext(`let standaloneMode = false, serverAvailable = true, audioContext = null;
      let lastPhaseSignalKey = "", lastSegmentIndex = "1:rotation", pendingSeekAction = Promise.resolve();
      ${match[0]}`, context);
    await context[name]();
    assert.equal(JSON.stringify(currentState), before, `${name} must retain the current server state`);
    assert.equal(localRenders, 0, `${name} must not render a local fallback`);
    assert.equal(attempts, 1);
    assert.equal(fixture.applied.length, 0);
    assert.deepEqual(fixture.failures, []);
  }
});

test("actual Stop controller ignores an older same-instance reset acknowledgement after a newer start", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const hardReset = html.match(/async function hardReset\([\s\S]*?\) \{[\s\S]*?\n    \}/);
  assert.ok(hardReset);
  let finishSounds = 0, attempts = 0;
  const measuredTimings = [];
  const currentState = {running: true, completed: false, elapsedBeforePause: 0,
    activePreset: "classic", serverStartedAt: 320000, activeSettings: {oneShot: false}};
  const before = JSON.stringify(currentState);
  const fixture = makeTransport(async () => {
    attempts += 1;
    return response(200, {serverInstanceId: "server-a", version: 31, running: false});
  }, {
    acceptRemote: (remote, context) => {
      const identity = reconcileServerStateIdentity("server-a", 32, remote, new Set());
      if (identity.stale) {
        measuredTimings.push(context.timing);
        return false;
      }
      return true;
    }
  });
  const context = vm.createContext({state: currentState,
    controlsAvailable: () => true, isBeforeScheduledStart: () => false,
    activeSettingsFromDraft: () => ({rotationSeconds: 60}),
    sendServerAction: (...args) => fixture.transport.send(...args),
    signal: kind => {if (kind === "finish") finishSounds += 1;},
    clearSignalTimers() {}, syncButtons() {}, render() {}, buildTimeline() {},
    document: {body: {classList: {remove() {}}}}
  });
  vm.runInContext(`let standaloneMode = false, serverAvailable = true;
    let lastSegmentIndex = "1:rotation", lastPhaseSignalKey = "1:rotation";
    ${hardReset[0]}`, context);
  await context.hardReset();
  assert.equal(JSON.stringify(currentState), before);
  assert.equal(finishSounds, 0);
  assert.equal(attempts, 1);
  assert.equal(fixture.applied.length, 0);
  assert.equal(measuredTimings.length, 1);
  for (const name of ["date0", "date1", "perf0", "perf1"]) assert.ok(Number.isFinite(measuredTimings[0][name]), name);
  assert.deepEqual(fixture.failures, []);
});

test("audio test uses a pending offset only for its edited target", () => {
  const resolve = require("../lib/client-action-transport").resolveAudioTestOffset;
  const command = { previewTargetClientId: "screen-a", previewAudioOffset: -750 };
  assert.equal(resolve(command, "screen-a", -200), -750);
  assert.equal(resolve(command, "screen-b", -200), -200);
  assert.equal(resolve({ previewTargetClientId: "screen-a", previewAudioOffset: 900 }, "screen-a", 0), 250);
  assert.equal(resolve({ previewTargetClientId: "screen-a", previewAudioOffset: -900 }, "screen-a", 0), -750);
  assert.equal(resolve({}, "screen-a", -200), -200);
});

test("production client stops after the single conflict retry", async () => {
  const requests = [];
  const fixture = makeTransport(async (url, options) => {
    requests.push(JSON.parse(options.body));
    return response(409, { version: 10 + requests.length, commandConflict: true });
  });

  const result = await fixture.transport.send("start", {});

  assert.equal(result, "conflict");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].commandId, "test-client:page-session:1");
  assert.equal(requests[1].commandId, "test-client:page-session:2");
});

test("runtime network failures retry three times and mark the server unavailable", async () => {
  let attempts = 0;
  const fixture = makeTransport(async () => {
    attempts += 1;
    throw new Error("network unavailable");
  });

  assert.equal(await fixture.transport.send("pause"), false);
  assert.equal(attempts, 3);
  assert.deepEqual(fixture.failures, [true]);
});

test("control rejection statuses remain distinguishable", async () => {
  for (const [remote, expected] of [
    [{ version: 11, primaryPinBlockedUntil: 1000 }, "pin-blocked"],
    [{ version: 11, primaryPinRequired: true }, "pin-required"],
    [{ version: 11, primaryPinInvalidFormat: true }, "pin-invalid"],
    [{ version: 11, primaryPinDenied: true }, "pin-denied"]
  ]) {
    const fixture = makeTransport(async () => response(403, remote));
    assert.equal(await fixture.transport.send("primaryPin", {}), expected);
  }
});

test("successful action can update timing without applying response state", async () => {
  let timingUpdates = 0;
  const fixture = makeTransport(async () => response(200, { version: 11 }), {
    updateTiming: () => { timingUpdates += 1; }
  });

  assert.equal(await fixture.transport.send("settings", {}, { applyResponse: false }), true);
  assert.equal(timingUpdates, 1);
  assert.equal(fixture.applied.length, 0);
});

test("an accepted action is not reported as a network failure when applying its response throws", async () => {
  let attempts = 0;
  const applyError = new Error("render failed");
  const fixture = makeTransport(async () => {
    attempts += 1;
    return response(200, { version: 11 });
  }, {
    applyRemote: () => { throw applyError; }
  });

  assert.equal(await fixture.transport.send("language", { language: "en" }), true);
  assert.equal(attempts, 1);
  assert.deepEqual(fixture.failures, []);
  assert.equal(fixture.applyErrors.length, 1);
  assert.equal(fixture.applyErrors[0].error, applyError);
  assert.deepEqual(fixture.applyErrors[0].context, {
    type: "language",
    phase: "success",
    status: 200
  });
});

test("a conflict response that cannot be applied is not retried as a network request", async () => {
  let attempts = 0;
  const fixture = makeTransport(async () => {
    attempts += 1;
    return response(409, { version: 11, commandConflict: true });
  }, {
    applyRemote: () => { throw new Error("render failed"); }
  });

  assert.equal(await fixture.transport.send("start"), "conflict");
  assert.equal(attempts, 1);
  assert.deepEqual(fixture.failures, []);
  assert.equal(fixture.applyErrors.length, 1);
  assert.equal(fixture.applyErrors[0].context.phase, "conflict");
});
