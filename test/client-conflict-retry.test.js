"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createActionTransport } = require("../lib/client-action-transport");

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
    nextCommandId: () => `test-client:page-session:${++commandSequence}`,
    requestTimeoutMs: 2000,
    serverNow: () => 123456,
    updateTiming: () => {},
    delay: async () => {},
    ...overrides
  });
  return { applied, failures, transport };
}

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

test("audio test uses a pending offset only for its edited target", () => {
  const resolve = require("../lib/client-action-transport").resolveAudioTestOffset;
  const command = { previewTargetClientId: "screen-a", previewAudioOffset: 500 };
  assert.equal(resolve(command, "screen-a", -200), 500);
  assert.equal(resolve(command, "screen-b", -200), -200);
  assert.equal(resolve({ previewTargetClientId: "screen-a", previewAudioOffset: 900 }, "screen-a", 0), 500);
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
