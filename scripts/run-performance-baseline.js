"use strict";

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const baseline = require("./lib/performance-baseline");

const root = path.resolve(__dirname, "..");

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const files = [
    "serve-bouldering-timer.js",
    "index.html",
    "legacy.html",
    "params.txt",
    "manifest.webmanifest",
    "sw.js",
    "favicon.ico",
    "app-icon.svg"
  ];
  const directories = ["beeps", "fonts", "lib"];
  files.forEach((name) => fs.copyFileSync(path.join(root, name), path.join(target, name)));
  directories.forEach((name) => fs.cpSync(path.join(root, name), path.join(target, name), { recursive: true }));
}

async function waitForServer(baseUrl, child, output) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Baseline server exited early.\n${output.join("")}`);
    try {
      const response = await fetch(`${baseUrl}/api/state?clientId=performance-baseline`);
      if (response.ok) return;
    } catch (error) {}
    await wait(50);
  }
  throw new Error(`Baseline server did not become ready.\n${output.join("")}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
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

async function readJson(response, label) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function action(baseUrl, type, payload = {}) {
  return readJson(await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "performance-baseline", type, ...payload })
  }), `Action ${type}`);
}

async function performanceSnapshot(baseUrl, reset = false) {
  return readJson(await fetch(`${baseUrl}/api/performance${reset ? "?reset=1" : ""}`), "Performance snapshot");
}

async function prepareScenario(baseUrl, scenario) {
  await action(baseUrl, "reset", {
    activePreset: "classic",
    settings: { rotationSeconds: 8, breakSeconds: 3, oneShot: false }
  });
  await action(baseUrl, "start", {
    activePreset: "classic",
    settings: { rotationSeconds: 8, breakSeconds: 3, oneShot: false },
    startMode: "manual",
    startAudioLead: false
  });
  await action(baseUrl, "startLists", { startLists: scenario.startLists });
  await action(baseUrl, "startListEnabled", { enabled: scenario.startLists.length > 0 });
}

async function main() {
  if (process.argv.includes("--list-scenarios")) {
    Object.entries(baseline.scenarioDefinitions).forEach(([id, definition]) => {
      console.log(`${id}\t${JSON.stringify(definition)}`);
    });
    return;
  }

  const scenario = baseline.createScenario(argumentValue("--scenario", "four-120x5-incidents"));
  const sampleDurationMs = Math.max(1000, Number(argumentValue("--sample-ms", "15000")) || 15000);
  const warmupMs = Math.max(0, Number(argumentValue("--warmup-ms", "3000")) || 0);
  const outputPath = argumentValue("--output");
  const sourceCommit = argumentValue("--source-commit");
  const serve = process.argv.includes("--serve");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-performance-baseline-"));
  copyFixture(fixture);
  const port = await freePort();
  const httpsPort = await freePort();
  const output = [];
  const child = spawn(process.execPath, [path.join(fixture, "serve-bouldering-timer.js"), "--performance-diagnostics"], {
    cwd: fixture,
    env: { ...process.env, PORT: String(port), HTTPS_PORT: String(httpsPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl, child, output);
    await performanceSnapshot(baseUrl, true);
    await prepareScenario(baseUrl, scenario);
    const serverLoad = await performanceSnapshot(baseUrl);
    console.log(`Baseline server ready: ${baseUrl}/?perf=1`);
    console.log(`Legacy client: ${baseUrl}/legacy.html?perf=1&clientId=baseline-legacy`);
    console.log(`Scenario: ${scenario.id}`);

    if (serve) {
      const configuredClients = new Set(["performance-baseline"]);
      let selectingClients = false;
      const selectionTimer = setInterval(async () => {
        if (selectingClients || !scenario.startLists.length) return;
        selectingClients = true;
        try {
          const state = await readJson(await fetch(
            `${baseUrl}/api/state?clientId=performance-baseline&diagnostics=1`
          ), "Client discovery");
          for (const client of state.clients || []) {
            const clientId = String(client.id || "");
            if (!clientId || configuredClients.has(clientId)) continue;
            for (let listIndex = 0; listIndex < scenario.startLists.length; listIndex += 1) {
              await action(baseUrl, "startListDisplay", {
                targetClientId: clientId,
                listIndex,
                enabled: true
              });
            }
            configuredClients.add(clientId);
            console.log(`Protocols enabled for benchmark client: ${clientId}`);
          }
        } catch (error) {
          if (child.exitCode === null) console.warn(`Client discovery failed: ${error.message}`);
        } finally {
          selectingClients = false;
        }
      }, 1000);
      console.log("Press Ctrl+C to stop the isolated baseline server.");
      try {
        await new Promise((resolve) => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
          child.once("exit", resolve);
        });
      } finally {
        clearInterval(selectionTimer);
      }
      return;
    }

    await wait(warmupMs);
    await performanceSnapshot(baseUrl, true);
    await wait(sampleDurationMs);
    const serverSteady = await performanceSnapshot(baseUrl);
    const report = baseline.createReport({
      sourceCommit,
      scenario: { id: scenario.id, ...scenario.definition },
      sampleDurationMs,
      serverLoad,
      serverSteady
    });
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (outputPath) {
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), serialized, "utf8");
      console.log(`Baseline report written: ${path.resolve(outputPath)}`);
    } else {
      process.stdout.write(serialized);
    }
  } finally {
    await stopServer(child);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
