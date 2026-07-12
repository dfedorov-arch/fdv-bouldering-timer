const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function copyFixture(target) {
  for (const name of ["serve-bouldering-timer.js", "params.txt"]) {
    fs.copyFileSync(path.join(projectRoot, name), path.join(target, name));
  }
  for (const name of ["beeps", "fonts"]) {
    fs.cpSync(path.join(projectRoot, name), path.join(target, name), { recursive: true });
  }
  fs.cpSync(path.join(projectRoot, "lib"), path.join(target, "lib"), { recursive: true });
}

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before it became ready.\n${output.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/state?clientId=integration-test`);
      if (response.ok) return response.json();
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become ready.\n${output.join("")}`);
}

async function postAction(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "integration-test", ...body })
  });
  return { status: response.status, body: await response.json() };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

test("production server validates settings, rejects stale commands, and deduplicates retries", { timeout: 20000 }, async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-timer-test-"));
  copyFixture(fixture);
  const port = await freePort();
  const httpsPort = await freePort();
  const output = [];
  const spawnServer = () => {
    const server = spawn(process.execPath, [path.join(fixture, "serve-bouldering-timer.js")], {
      cwd: fixture,
      env: { ...process.env, PORT: String(port), HTTPS_PORT: String(httpsPort) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", (chunk) => output.push(chunk.toString()));
    server.stderr.on("data", (chunk) => output.push(chunk.toString()));
    return server;
  };
  let child = spawnServer();
  t.after(async () => {
    await stopServer(child);
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child, output);

  const classic = await postAction(baseUrl, {
    type: "settings",
    activePreset: "classic",
    settings: {
      rotationMinutes: -20,
      breakSeconds: 99999,
      oneShot: false,
      startHours: 99,
      startMinutes: -5
    }
  });
  assert.equal(classic.status, 200);
  assert.deepEqual(classic.body.draftSettings, {
    rotationMinutes: 1,
    breakSeconds: 3600,
    oneShot: false,
    startHours: 23,
    startMinutes: 0
  });

  const festival = await postAction(baseUrl, {
    type: "settings",
    activePreset: "festival",
    settings: {
      rotationMinutes: 999,
      breakSeconds: 99999,
      oneShot: false,
      startHours: "",
      startMinutes: ""
    }
  });
  assert.equal(festival.status, 200);
  assert.equal(festival.body.draftSettings.rotationMinutes, 240);
  assert.equal(festival.body.draftSettings.breakSeconds, 14400);

  const reset = await postAction(baseUrl, {
    type: "reset",
    commandId: "normalize-reset",
    settings: { rotationSeconds: -10, breakSeconds: 99999, oneShot: false }
  });
  assert.equal(reset.status, 200);
  assert.deepEqual(reset.body.activeSettings, {
    rotationSeconds: 1,
    breakSeconds: 14400,
    oneShot: false
  });

  const staleVersion = reset.body.version;
  const changed = await postAction(baseUrl, {
    type: "settings",
    activePreset: "classic",
    settings: { rotationMinutes: 5, breakSeconds: 15, oneShot: false }
  });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.version > staleVersion);

  const conflict = await postAction(baseUrl, {
    type: "reset",
    commandId: "stale-reset",
    baseVersion: staleVersion,
    settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false }
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.commandConflict, true);
  assert.equal(conflict.body.expectedVersion, changed.body.version);

  const startBody = {
    type: "start",
    commandId: "deduplicated-start",
    baseVersion: changed.body.version,
    settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true },
    startMode: "manual",
    startHours: "",
    startMinutes: "",
    startAudioLead: true
  };
  const started = await postAction(baseUrl, startBody);
  assert.equal(started.status, 200);
  assert.equal(started.body.running, true);
  assert.equal(started.body.manualStartLeadMs, 300);
  assert.equal(started.body.manualStartDisplayHold, true);

  const duplicate = await postAction(baseUrl, startBody);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.commandDuplicate, true);
  assert.equal(duplicate.body.version, started.body.version);

  await stopServer(child);
  child = spawnServer();
  const restored = await waitForServer(baseUrl, child, output);
  assert.equal(restored.running, true);
  assert.equal(restored.manualStartLeadMs, 300);
  assert.equal(restored.manualStartDisplayHold, true);
  assert.ok(restored.version > started.body.version);

  const untilStartedMs = Math.max(0, Number(restored.startedAt || 0) - Date.now());
  await new Promise((resolve) => setTimeout(resolve, untilStartedMs + 25));
  const paused = await postAction(baseUrl, {
    type: "pause",
    commandId: "pause-after-restore",
    baseVersion: restored.version
  });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.running, false);
  assert.ok(paused.body.elapsedBeforePause >= 0);

  await stopServer(child);
  child = spawnServer();
  const restoredPause = await waitForServer(baseUrl, child, output);
  assert.equal(restoredPause.running, false);
  assert.ok(restoredPause.elapsedBeforePause >= paused.body.elapsedBeforePause);
  assert.ok(restoredPause.version > paused.body.version);

  const competingBaseVersion = restoredPause.version;
  const competingActions = [
    {
      type: "start",
      commandId: "competing-start",
      baseVersion: competingBaseVersion,
      startMode: "manual",
      startHours: "",
      startMinutes: "",
      settings: { rotationSeconds: 60, breakSeconds: 0, oneShot: true }
    },
    {
      type: "reset",
      commandId: "competing-reset",
      baseVersion: competingBaseVersion,
      settings: { rotationSeconds: 90, breakSeconds: 0, oneShot: true }
    }
  ];
  const competingResults = await Promise.all(competingActions.map((action) => postAction(baseUrl, action)));
  assert.deepEqual(competingResults.map((result) => result.status).sort(), [200, 409]);
  const rejectedIndex = competingResults.findIndex((result) => result.status === 409);
  const rejectedAction = competingActions[rejectedIndex];
  const rejectedReplay = await postAction(baseUrl, rejectedAction);
  assert.equal(rejectedReplay.status, 409);
  assert.equal(rejectedReplay.body.commandDuplicate, true);
  assert.equal(rejectedReplay.body.commandConflict, true);
});
