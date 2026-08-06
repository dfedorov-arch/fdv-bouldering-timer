"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visualStartLists() {
  const firstNames = [
    "Александрова Александра",
    "Бадамшина Софья",
    "Васильева Екатерина",
    "Гладышева Надежда",
    "Емельянова Валерия",
    "Константинова Александра",
    "Расторгуева Елизавета",
    "Сиворонова Екатерина"
  ];
  const lastNames = [
    "Александров Александр",
    "Божевольнов Николай",
    "Горькаев Григорий",
    "Детковский Алексей",
    "Кайгородов Илья",
    "Лушпей Степан",
    "Понаревский Андрей",
    "Харитонов Всеволод"
  ];
  const teams = ["НИЯУ МИФИ", "НИУ ВШЭ (*)", "РУС \"ГЦОЛИФК\"", "РАНХиГС", "РГАУ-МСХА", "МФТИ (*)"];
  function list(title, names, offset) {
    return {
      title,
      headers: ["#", "ИН", "Фамилия, имя", "Команда"],
      rows: Array.from({ length: 72 }, (_, index) => [
        String(index + 1),
        String(offset + index + 1),
        names[index % names.length],
        teams[index % teams.length]
      ]),
      routeCount: 5,
      excludedParticipants: [6]
    };
  }
  return [
    list("Трасса 1", firstNames, 80),
    list("", lastNames, 10),
    list("", lastNames, 110),
    list("Юниоры 17-25 лет - БОУЛДЕРИНГ - Квалификация", firstNames, 180)
  ];
}

async function startLayoutServer() {
  const child = spawn(process.execPath, [
    path.join(root, "scripts", "run-performance-baseline.js"),
    "--serve",
    "--scenario",
    "four-120x5-incidents"
  ], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let baseUrl = "";

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Layout server timeout.\n${output}`)), 15_000);
    function consume(chunk) {
      output += chunk.toString();
      const match = output.match(/Baseline server ready: (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match || baseUrl) return;
      baseUrl = match[1];
      clearTimeout(timeout);
      resolve();
    }
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.once("exit", (code) => {
      if (!baseUrl) {
        clearTimeout(timeout);
        reject(new Error(`Layout server exited with code ${code}.\n${output}`));
      }
    });
  });

  await ready;
  await action(baseUrl, "startLists", { startLists: visualStartLists() });
  await action(baseUrl, "startListEnabled", { enabled: true });
  return {
    baseUrl,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return;
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 4_000);
        child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }
  };
}

async function json(response, label) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function action(baseUrl, type, payload = {}) {
  return json(await fetch(`${baseUrl}/api/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "performance-baseline", type, ...payload })
  }), `Action ${type}`);
}

async function clientState(baseUrl, clientId) {
  return json(await fetch(`${baseUrl}/api/state?clientId=${encodeURIComponent(clientId)}`), "Client state");
}

async function waitForClient(baseUrl, clientId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await json(await fetch(
      `${baseUrl}/api/state?clientId=visual-inspector&diagnostics=1`
    ), "Client discovery");
    if ((state.clients || []).some((client) => client.id === clientId)) return;
    await wait(50);
  }
  throw new Error(`Browser client ${clientId} was not registered`);
}

async function selectProtocols(baseUrl, clientId, indexes) {
  const selected = new Set(indexes);
  await waitForClient(baseUrl, clientId);
  // The isolated baseline server performs one automatic initial selection.
  // Let that pass before applying the deterministic selection for the test.
  await wait(1_100);
  for (let listIndex = 0; listIndex < 4; listIndex += 1) {
    await action(baseUrl, "startListDisplay", {
      targetClientId: clientId,
      listIndex,
      enabled: selected.has(listIndex)
    });
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await clientState(baseUrl, clientId);
    if (JSON.stringify(state.startListIndexes) === JSON.stringify(indexes)) return;
    await wait(50);
  }
  throw new Error(`Protocol selection did not settle for ${clientId}`);
}

async function stabilizeTimer(baseUrl, elapsed = 350) {
  await action(baseUrl, "primary", { primaryClientId: "performance-baseline" });
  await action(baseUrl, "pause");
  await action(baseUrl, "seek", { elapsed });
}

async function openModern(browser, baseUrl, clientId, viewport, indexes) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((id) => {
    window.sessionStorage.setItem("boulderingTimerClientId", id);
  }, clientId);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await selectProtocols(baseUrl, clientId, indexes);
  await page.locator(".start-list-table").first().waitFor();
  await page.waitForFunction((count) => document.querySelectorAll(".start-list-table").length === count, indexes.length);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await wait(250);
  return { context, page };
}

async function openLegacy(browser, baseUrl, clientId, viewport, indexes, stickyFallback = false) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await clientState(baseUrl, clientId);
  await action(baseUrl, "legacyMode", { targetClientId: clientId, enabled: true });
  const params = new URLSearchParams({
    manualLegacy: "1",
    oldBrowser: "1",
    clientId
  });
  if (stickyFallback) params.set("legacyStickyFallback", "1");
  await page.goto(`${baseUrl}/legacy.html?${params}`, { waitUntil: "domcontentloaded" });
  await selectProtocols(baseUrl, clientId, indexes);
  await page.locator(".protocol-table").first().waitFor();
  await page.waitForFunction((count) => document.querySelectorAll(".protocol-table").length === count, indexes.length);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await wait(250);
  return { context, page };
}

module.exports = {
  action,
  openLegacy,
  openModern,
  selectProtocols,
  stabilizeTimer,
  startLayoutServer,
  wait
};
