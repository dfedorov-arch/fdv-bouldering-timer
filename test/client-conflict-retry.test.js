const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const indexHtml = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");

function productionSendServerActionSource() {
  const start = indexHtml.indexOf("async function sendServerAction");
  const end = indexHtml.indexOf("async function syncFromServer", start);
  assert.ok(start >= 0 && end > start, "sendServerAction must be present in index.html");
  return indexHtml.slice(start, end).trim();
}

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body
  };
}

function makeContext(fetchImpl) {
  const context = {
    AbortController,
    clientId: "test-client",
    commandSessionId: "page-session",
    commandSeq: 0,
    fetch: fetchImpl,
    lastServerVersion: 10,
    markServerFailure: () => {},
    performance,
    runtimeCommandTypes: new Set(["start", "pause", "stopCountdown", "reset", "seek"]),
    serverAvailable: true,
    serverNow: () => 123456,
    standaloneMode: false,
    syncRequestTimeoutMs: 2000,
    updateServerTiming: () => {},
    clientDiagnostics: () => ({}),
    window: {
      clearTimeout,
      setTimeout
    }
  };
  context.applyServerState = (remote) => {
    context.lastServerVersion = remote.version;
  };
  return context;
}

async function runProductionAction(context) {
  vm.runInNewContext(
    `${productionSendServerActionSource()}\nresult = sendServerAction("start", { settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true } });`,
    context
  );
  return context.result;
}

test("production client retries one version conflict with a fresh command id and version", async () => {
  const requests = [];
  const context = makeContext(async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) return response(409, { version: 11, commandConflict: true });
    return response(200, { version: 12, running: true });
  });

  const result = await runProductionAction(context);

  assert.equal(result, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].commandId, "test-client:page-session:1");
  assert.equal(requests[0].baseVersion, 10);
  assert.equal(requests[1].commandId, "test-client:page-session:2");
  assert.equal(requests[1].baseVersion, 11);
});

test("production client stops after the single conflict retry", async () => {
  const requests = [];
  const context = makeContext(async (url, options) => {
    requests.push(JSON.parse(options.body));
    return response(409, { version: 10 + requests.length, commandConflict: true });
  });

  const result = await runProductionAction(context);

  assert.equal(result, "conflict");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].commandId, "test-client:page-session:1");
  assert.equal(requests[1].commandId, "test-client:page-session:2");
});
