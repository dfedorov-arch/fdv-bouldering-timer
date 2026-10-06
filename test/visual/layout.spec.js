"use strict";

const { test, expect } = require("@playwright/test");
const {
  action,
  openLegacy,
  openModern,
  selectProtocols,
  stabilizeTimer,
  startLayoutServer,
  wait
} = require("./helpers");

let server;
let initialState;

test.beforeAll(async () => {
  server = await startLayoutServer();
  initialState = await (await fetch(`${server.baseUrl}/api/state`)).json();
});

test.afterAll(async () => {
  await server.stop();
});

test.beforeEach(async () => {
  // Format-specific tests must not leave Festival or different timing behind.
  await action(server.baseUrl, "primary", { primaryClientId: "performance-baseline" });
  await action(server.baseUrl, "settings", {
    activePreset: initialState.activePreset,
    settings: initialState.draftSettings
  });
  await action(server.baseUrl, "reset", {
    activePreset: initialState.runtimePreset,
    settings: initialState.activeSettings
  });
  await action(server.baseUrl, "startListEnabled", { enabled: initialState.startListEnabled });
  await stabilizeTimer(server.baseUrl);
});

for (const modern of [true, false]) {
  for (const customPalette of [false, true]) {
    test(`${modern ? "Modern" : "Legacy"} completed Final uses ${customPalette ? "custom" : "default"} break palette at zero`, async ({ browser }, testInfo) => {
      const settings = { rotationSeconds: 240, breakSeconds: 0, oneShot: true };
      await action(server.baseUrl, "reset", { activePreset: "final", settings });
      await action(server.baseUrl, "start", { activePreset: "final", settings, startMode: "manual" });
      await stabilizeTimer(server.baseUrl, 238);
      const opened = await (modern ? openModern : openLegacy)(browser, server.baseUrl,
        `visual-final-colors-${modern}-${customPalette}`, { width: 962, height: 541 }, [0]);
      try {
        if (customPalette) {
          // Keep the injected config consistent: unmodified SSE snapshots would
          // otherwise restore the real server palette while XHR uses the mock.
          if (modern) await opened.page.route("**/api/events**", (route) => route.abort());
          await opened.page.route("**/api/state**", async (route) => {
            const response = await route.fetch();
            const remote = await response.json();
            await route.fulfill({ response, json: { ...remote,
              config: { ...remote.config, breakBackgroundColor: "#612b7c", breakTextColor: "#ffeedd" } } });
          });
          await opened.page.reload({ waitUntil: "domcontentloaded" });
        }
        const timer = opened.page.locator("#time");
        const expectTime = (label) => modern ? expect(timer).toHaveAttribute("aria-label", label) : expect(timer).toHaveText(label);
        const pane = opened.page.locator(modern ? ".timer-column" : "#timerPane");
        const background = customPalette ? "rgb(97, 43, 124)" : "rgb(240, 90, 89)";
        await expectTime("00:02");
        await expect(pane).not.toHaveCSS("background-color", background);
        await action(server.baseUrl, "start", { activePreset: "final", settings, startMode: "manual" });
        // Inspect the first DOM mutation that displays zero, not a later server refresh.
        const zeroAppearance = await opened.page.evaluate((modern) => new Promise((resolve) => {
          const timer = document.querySelector("#time");
          const pane = document.querySelector(modern ? ".timer-column" : "#timerPane");
          const observer = new MutationObserver(() => {
            if ((modern ? timer.getAttribute("aria-label") : timer.textContent.trim()) !== "00:00") return;
            observer.disconnect();
            resolve(getComputedStyle(pane).backgroundColor);
          });
          observer.observe(timer, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
        }), modern);
        expect(zeroAppearance).toBe(background);
        await expect(timer).toHaveCSS("color", customPalette ? "rgb(255, 238, 221)" : "rgb(244, 247, 251)");
        await expect(pane).toHaveCSS("background-color", background);
        await expect(opened.page.locator(".route-marker.done").first()).toHaveCSS("background-color", "rgb(40, 80, 140)");
        const screenshot = testInfo.outputPath(`final-completed-${modern ? "modern" : "legacy"}-${customPalette ? "custom" : "default"}.png`);
        await opened.page.screenshot({ path: screenshot });
        await testInfo.attach("Completed Final and dark-blue completed routes", { path: screenshot, contentType: "image/png" });
        // Reset and a repeating zero-break rotation must not inherit completion colors.
        await action(server.baseUrl, "reset", { activePreset: "classic",
          settings: { rotationSeconds: 300, breakSeconds: 0, oneShot: false } });
        await expectTime("05:00");
        await expect(pane).not.toHaveCSS("background-color", background);
        await stabilizeTimer(server.baseUrl, 300);
        await expectTime("05:00");
        await expect(pane).not.toHaveCSS("background-color", background);
      } finally {
        await opened.page.unrouteAll({ behavior: "ignoreErrors" });
        await opened.context.close();
      }
    });
  }

  for (const viewport of [{ width: 360, height: 778 }, { width: 962, height: 541 }, { width: 1000, height: 1000 }]) {
    test(`${modern ? "Modern" : "Legacy"} list screen shows a read-only cycle at ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
      await action(server.baseUrl, "reset", { activePreset: "classic",
        settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false } });
      await stabilizeTimer(server.baseUrl, 630);
      const id = `visual-cycle-${modern}-${viewport.width}`;
      const opened = await (modern ? openModern : openLegacy)(browser, server.baseUrl, id, viewport, [0, 1]);
      const badge = opened.page.locator(modern ? ".cycle-chip" : "#cycleBadge");
      try {
        await expect(badge).toBeVisible();
        if (modern) {
          await expect(badge.locator("input")).toHaveValue("3");
          await expect(badge.locator("span")).toHaveText("Ротация");
          await expect(badge.locator("input")).toHaveAttribute("aria-label", "Номер ротации");
        } else await expect(badge).toHaveText("Ротация 3");
        if (modern) {
          await expect(badge.locator("input")).toBeDisabled();
          await expect(opened.page.locator("#progressTrack")).toBeHidden();
          await expect(opened.page.locator(".compact-actions")).toBeHidden();
          // Native fullscreen uses the same flag in addition to :fullscreen.
          await opened.page.evaluate(() => document.body.classList.add("fullscreen"));
          await expect(badge).toBeVisible();
        }
        await action(server.baseUrl, "clientServerTime", { targetClientId: id, enabled: true });
        await expect(opened.page.locator(modern ? "#serverClockDisplay" : "#serverClock")).toBeVisible();
        await wait(350);
        const geometry = await opened.page.evaluate((modern) => {
          const pane = document.querySelector(modern ? ".timer-column" : "#timerPane").getBoundingClientRect();
          const timer = document.querySelector(modern ? ".time" : "#time").getBoundingClientRect();
          const chip = document.querySelector(modern ? ".cycle-chip" : "#cycleBadge").getBoundingClientRect();
          const clock = document.querySelector(modern ? "#serverClockDisplay" : "#serverClock").getBoundingClientRect();
          return { pane: pane.toJSON(), timer: timer.toJSON(), chip: chip.toJSON(), clock: clock.toJSON() };
        }, modern);
        expect(geometry.chip.left).toBeGreaterThanOrEqual(geometry.pane.left - 1);
        expect(geometry.chip.right).toBeLessThanOrEqual(geometry.pane.right + 1);
        expect(geometry.chip.bottom).toBeLessThanOrEqual(geometry.pane.bottom + 1);
        expect(geometry.clock.bottom).toBeLessThanOrEqual(geometry.chip.top + 1);
        if (modern) expect(geometry.timer.bottom).toBeLessThanOrEqual(geometry.clock.top + 1);
        const screenshot = testInfo.outputPath(`list-cycle-${modern ? "modern" : "legacy"}-${viewport.width}.png`);
        await opened.page.screenshot({ path: screenshot });
        await testInfo.attach("List screen cycle", { path: screenshot, contentType: "image/png" });
        await stabilizeTimer(server.baseUrl, 930);
        await expect(badge).toHaveClass(/cycle-break/);
        await action(server.baseUrl, "language", { language: "en" });
        await expect(badge).toContainText("Rotation");
        if (modern) await expect(badge.locator("input")).toHaveAttribute("aria-label", "Rotation number");
        if (viewport.width === 1000) {
          await selectProtocols(server.baseUrl, id, []);
          await expect(badge).toBeHidden();
          await selectProtocols(server.baseUrl, id, [0, 1]);
          await expect(badge).toBeVisible();
          await action(server.baseUrl, "settings", { activePreset: "final",
            settings: { rotationMinutes: 4, breakSeconds: 0, oneShot: true } });
          await action(server.baseUrl, "reset", { activePreset: "final",
            settings: { rotationSeconds: 240, breakSeconds: 0, oneShot: true } });
          await action(server.baseUrl, "seekCycle", { cycle: 7 });
          if (modern) await expect(badge.locator("input")).toHaveValue("7");
          else await expect(badge).toHaveText("Rotation 7");
        }
        await action(server.baseUrl, "reset", { activePreset: viewport.width === 1000 ? "final" : "classic",
          settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: viewport.width === 1000 } });
        await action(server.baseUrl, "start", { activePreset: viewport.width === 1000 ? "final" : "classic",
          startMode: "scheduled", startHours: (new Date().getHours() + 1) % 24, startMinutes: new Date().getMinutes() });
        await expect(badge).toHaveClass(/cycle-waiting/);
        await expect(badge).toHaveText("Waiting for start");
        await action(server.baseUrl, "startListEnabled", { enabled: false });
        await expect(badge).toBeHidden();
      } finally {
        await action(server.baseUrl, "language", { language: "ru" });
        await action(server.baseUrl, "clientServerTime", { targetClientId: id, enabled: false });
        await opened.context.close();
      }
    });
  }

  test(`${modern ? "Modern" : "Legacy"} first-route pause marks two held starts, not first-route preparation`, async ({ browser }, testInfo) => {
    const previous = await (await fetch(`${server.baseUrl}/api/state`)).json();
    const id = `visual-first-route-${modern}`;
    let opened;
    try {
      await action(server.baseUrl, "reset", { activePreset: "classic",
        settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false } });
      await action(server.baseUrl, "startLists", { startLists: [{
        headers: ["#", "ФИО"],
        rows: Array.from({ length: 32 }, (_, index) => [String(index + 1), `Участник ${index + 1}`]),
        routeCount: 5,
        incidents: [{ kind: "pause", route: 1, startCycle: 17, resumeCycle: 19,
          participantIndex: 16, resolution: "resume", blocksStartCycleWave: true }]
      }] });
      await stabilizeTimer(server.baseUrl, 11 * 315);
      opened = await (modern ? openModern : openLegacy)(browser, server.baseUrl, id, { width: 1280, height: 900 }, [0]);
      const table = opened.page.locator(modern ? ".start-list-table" : ".protocol-table");
      const marker = (index, status) => table.locator("tbody tr").nth(index).locator("td").nth(2).locator(`.route-marker.${status}`);
      for (const elapsed of [11 * 315, 16 * 315]) {
        await stabilizeTimer(server.baseUrl, elapsed);
        await expect(marker(16, "paused")).toHaveCount(1);
        await expect(marker(17, "paused")).toHaveCount(1);
        await expect(marker(18, "paused")).toHaveCount(0);
        await expect(table.locator(".route-marker.paused")).toHaveCount(2);
      }
      if (modern) {
        await action(server.baseUrl, "primary", { primaryClientId: id });
        await opened.page.waitForFunction(() => document.body.classList.contains("controls-ready")
          && !document.body.classList.contains("viewer-mode"));
        await opened.page.locator('[data-start-list-route="0"]').click();
        const note = opened.page.locator(".start-list-incident-note span").first();
        await expect(note).toHaveText("Была приостановлена с ротации 17 по ротацию 18");
        await action(server.baseUrl, "language", { language: "en", clientId: id });
        await expect(note).toHaveText("Was paused from rotation 17 through rotation 18");
        await action(server.baseUrl, "language", { language: "ru", clientId: id });
        await expect(note).toHaveText("Была приостановлена с ротации 17 по ротацию 18");
        const screenshot = testInfo.outputPath("first-route-pause-menu.png");
        await opened.page.locator(".start-list-slot").first().screenshot({ path: screenshot });
        await testInfo.attach("First-route pause interval and exactly two icons", { path: screenshot, contentType: "image/png" });
      }
      await stabilizeTimer(server.baseUrl, 17 * 315);
      await expect(marker(16, "ready")).toHaveCount(1);
      await expect(table.locator(".route-marker.paused")).toHaveCount(0);
      await stabilizeTimer(server.baseUrl, 18 * 315);
      await expect(marker(16, "active")).toHaveCount(1);
    } finally {
      await action(server.baseUrl, "primary", { primaryClientId: "performance-baseline" });
      await action(server.baseUrl, "language", { language: "ru" });
      await opened?.context.close();
      await action(server.baseUrl, "startLists", { startLists: previous.startLists });
    }
  });

  for (const stopCycle of [16, 17]) {
    test(`${modern ? "Modern" : "Legacy"} stop at ${stopCycle} supersedes route pause at 17`, async ({ browser }, testInfo) => {
      const previous = await (await fetch(`${server.baseUrl}/api/state`)).json();
      const id = `visual-stop-before-pause-${modern}-${stopCycle}`;
      const pause = { kind: "pause", route: 2, startCycle: 17, resumeCycle: 18,
        participantIndex: 14, resolution: "resume", blocksStartCycleWave: true };
      const list = { headers: ["#", "ФИО"],
        rows: Array.from({ length: 32 }, (_, index) => [String(index + 1), `Участник ${index + 1}`]),
        routeCount: 5, incidents: [pause] };
      let opened;
      try {
        await action(server.baseUrl, "reset", { activePreset: "classic",
          settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false } });
        await action(server.baseUrl, "startLists", { startLists: [list] });
        await stabilizeTimer(server.baseUrl, 14 * 315);
        opened = await (modern ? openModern : openLegacy)(browser, server.baseUrl, id,
          { width: 1280, height: 900 }, [0]);
        const table = opened.page.locator(modern ? ".start-list-table" : ".protocol-table");
        const marker = (participant, route, status) => table.locator("tbody tr").nth(participant - 1)
          .locator("td").nth(route + 1).locator(`.route-marker.${status}`);
        await expect(marker(17, 1, "paused")).toHaveCount(1);
        if (modern) {
          // A stop at/before the pause start must preserve its original end.
          await action(server.baseUrl, "primary", { primaryClientId: id });
          await opened.page.waitForFunction(() => !document.body.classList.contains("viewer-mode"));
          await opened.page.locator('[data-start-list-route="1"]').click();
          await opened.page.locator('[data-start-list-incident-cycle]').fill(String(stopCycle));
          // Opening a route menu deliberately ignores action clicks for 500 ms.
          await wait(550);
          await opened.page.locator('[data-start-list-incident-action="stop"]').click();
          const note = opened.page.locator(".start-list-incident-note span").first();
          await expect(note).toHaveText(`Пауза с ротации 17 не действует: трасса остановлена с ротации ${stopCycle}`);
          await action(server.baseUrl, "language", { language: "en", clientId: id });
          await expect(note).toHaveText(`Pause from rotation 17 does not apply: route stopped from rotation ${stopCycle}`);
          await action(server.baseUrl, "language", { language: "ru", clientId: id });
          await expect(table.locator(".route-marker.paused")).toHaveCount(0);
          const stoppedState = await (await fetch(`${server.baseUrl}/api/state`)).json();
          expect(stoppedState.startLists[0].incidents.find(incident => incident.kind === "pause")).toEqual(pause);
          const screenshot = testInfo.outputPath(`stop-before-pause-${stopCycle}.png`);
          await opened.page.locator(".start-list-slot").first().screenshot({ path: screenshot });
          await testInfo.attach("Stop supersedes planned pause", { path: screenshot, contentType: "image/png" });
        } else {
          // Old saved zero-length stop-ended intervals remain suppressed too.
          const stoppedPause = stopCycle === 17 ? { ...pause, resumeCycle: 17, resolution: "stop" } : pause;
          await action(server.baseUrl, "startLists", { startLists: [{ ...list,
            incidents: [stoppedPause, { kind: "stop", route: 2, startCycle: stopCycle }] }] });
        }
        for (const cycle of [16, 17, 18]) {
          await stabilizeTimer(server.baseUrl, (cycle - 1) * 315);
          await expect(table.locator(".route-marker.paused")).toHaveCount(0);
          await expect(marker(cycle, 1, "active")).toHaveCount(1);
          await expect(marker(15, 2, "stopped")).toHaveCount(1);
        }
        await opened.page.reload({ waitUntil: "domcontentloaded" });
        await expect(table.locator(".route-marker.paused")).toHaveCount(0);
        await expect(marker(18, 1, "active")).toHaveCount(1);
        await stabilizeTimer(server.baseUrl, 14 * 315);
        if (modern) {
          await action(server.baseUrl, "primary", { primaryClientId: id });
          await opened.page.waitForFunction(() => document.body.classList.contains("controls-ready")
            && !document.body.classList.contains("viewer-mode"));
          await opened.page.locator('[data-start-list-route="1"]').click();
          await wait(550);
          await opened.page.locator('[data-start-list-incident-action="cancel-stop"]').click();
          const note = opened.page.locator(".start-list-incident-note span").first();
          await expect(note).toHaveText("Была приостановлена с ротации 17 по ротацию 17");
          await action(server.baseUrl, "language", { language: "en", clientId: id });
          await expect(note).toHaveText("Was paused from rotation 17 through rotation 17");
          await action(server.baseUrl, "language", { language: "ru", clientId: id });
          const restoredState = await (await fetch(`${server.baseUrl}/api/state`)).json();
          expect(restoredState.startLists[0].incidents).toEqual([pause]);
          const screenshot = testInfo.outputPath(`restored-pause-stop-${stopCycle}.png`);
          await opened.page.locator(".start-list-slot").first().screenshot({ path: screenshot });
          await testInfo.attach("Cancelled stop restores both pause boundaries", { path: screenshot, contentType: "image/png" });
        } else {
          // A read-only Legacy display receives the restored state from primary.
          await action(server.baseUrl, "startLists", { startLists: [list] });
        }
        await expect(marker(15, 2, "paused")).toHaveCount(1);
        await expect(marker(16, 2, "paused")).toHaveCount(1);
        await expect(marker(17, 1, "paused")).toHaveCount(1);
        await expect(table.locator(".route-marker.paused")).toHaveCount(3);
        await stabilizeTimer(server.baseUrl, 16 * 315);
        await expect(table.locator(".route-marker.paused")).toHaveCount(0);
        await expect(marker(15, 2, "ready")).toHaveCount(1);
        await stabilizeTimer(server.baseUrl, 17 * 315);
        await expect(marker(15, 2, "active")).toHaveCount(1);
      } finally {
        await action(server.baseUrl, "primary", { primaryClientId: "performance-baseline" });
        await action(server.baseUrl, "language", { language: "ru" });
        await opened?.context.close();
        await action(server.baseUrl, "startLists", { startLists: previous.startLists });
      }
    });
  }

  test(`${modern ? "Modern" : "Legacy"} earlier planned pause rebases an already saved later pause`, async ({ browser }, testInfo) => {
    const previous = await (await fetch(`${server.baseUrl}/api/state`)).json();
    const later = { kind: "pause", route: 2, startCycle: 17, resumeCycle: 18,
      participantIndex: 14, resolution: "resume", blocksStartCycleWave: true };
    const earlier = { kind: "pause", route: 3, startCycle: 14, resumeCycle: 16,
      participantIndex: 9, resolution: "resume", blocksStartCycleWave: true };
    const list = { headers: ["#", "ФИО"],
      rows: Array.from({ length: 32 }, (_, index) => [String(index + 1), `Участник ${index + 1}`]),
      routeCount: 5, incidents: [later] };
    let opened;
    try {
      await action(server.baseUrl, "reset", { activePreset: "classic",
        settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false } });
      await action(server.baseUrl, "startLists", { startLists: [list] });
      await stabilizeTimer(server.baseUrl, 11 * 315);
      opened = await (modern ? openModern : openLegacy)(browser, server.baseUrl,
        `visual-pause-order-${modern}`, { width: 1280, height: 900 }, [0]);
      const table = opened.page.locator(modern ? ".start-list-table" : ".protocol-table");
      const marker = (participant, route, status) => table.locator("tbody tr").nth(participant - 1)
        .locator("td").nth(route + 1).locator(`.route-marker.${status}`);
      await expect(marker(15, 2, "paused")).toHaveCount(1);
      await action(server.baseUrl, "startLists", { startLists: [{ ...list, incidents: [later, earlier] }] });
      await stabilizeTimer(server.baseUrl, 14 * 315);
      await expect(marker(10, 3, "ready")).toHaveCount(1);
      await expect(marker(13, 2, "paused")).toHaveCount(1);
      await expect(marker(14, 2, "paused")).toHaveCount(1);
      await expect(marker(15, 1, "paused")).toHaveCount(1);
      await expect(table.locator(".route-marker.paused")).toHaveCount(3);
      const screenshot = testInfo.outputPath(`ordered-pauses-${modern ? "modern" : "legacy"}.png`);
      await opened.page.screenshot({ path: screenshot });
      await testInfo.attach("Earlier pause prepares without clearing the later pause", { path: screenshot, contentType: "image/png" });
      // Reload from persisted, deliberately stale participant anchors as well.
      await opened.page.reload({ waitUntil: "domcontentloaded" });
      await expect(marker(13, 2, "paused")).toHaveCount(1);
      await stabilizeTimer(server.baseUrl, 15 * 315);
      await expect(marker(13, 2, "paused")).toHaveCount(1);
      await stabilizeTimer(server.baseUrl, 16 * 315);
      await expect(marker(13, 2, "ready")).toHaveCount(1);
      for (let participant = 1; participant <= 32; participant += 1) {
        await expect(marker(participant, 2, "active")).toHaveCount(0);
      }
      await stabilizeTimer(server.baseUrl, 17 * 315);
      await expect(marker(13, 2, "active")).toHaveCount(1);
      const saved = await (await fetch(`${server.baseUrl}/api/state`)).json();
      expect(saved.startLists[0].incidents.find(pause => pause.route === 2).participantIndex).toBe(14);
    } finally {
      await opened?.context.close();
      await action(server.baseUrl, "startLists", { startLists: previous.startLists });
    }
  });

  test(`${modern ? "Modern" : "Legacy"} prepares the paused wave one cycle before route resumption`, async ({ browser }, testInfo) => {
    const previous = await (await fetch(`${server.baseUrl}/api/state`)).json();
    const list = {
      headers: ["#", "ФИО"],
      rows: Array.from({ length: 32 }, (_, index) => [String(index + 1),
        index === 14 ? "Печенин Ярослав" : index === 15 ? "Шеклей Николай"
          : index === 16 ? "Назин Вадим" : index === 17 ? "Кровиков Давид" : `Участник ${index + 1}`]),
      routeCount: 5,
      incidents: [{ kind: "pause", route: 2, startCycle: 17, resumeCycle: 18,
        participantIndex: 14, resolution: "resume", blocksStartCycleWave: true }]
    };
    let opened;
    try {
      await action(server.baseUrl, "reset");
      await action(server.baseUrl, "settings", { activePreset: "classic",
        settings: { rotationMinutes: 5, breakSeconds: 15 } });
      await action(server.baseUrl, "start");
      await action(server.baseUrl, "startLists", { startLists: [list] });
      await stabilizeTimer(server.baseUrl, 15 * 315);
      const open = modern ? openModern : openLegacy;
      opened = await open(browser, server.baseUrl, `visual-resume-${modern}`, { width: 1280, height: 900 }, [0]);
      const table = opened.page.locator(modern ? ".start-list-table" : ".protocol-table");
      const row = (index) => table.locator("tbody tr").nth(index);
      const marker = (index, route, status) => row(index).locator("td").nth(2 + route).locator(`.route-marker.${status}`);
      await expect(marker(14, 1, "paused")).toHaveCount(1);
      await expect(marker(15, 1, "paused")).toHaveCount(1);
      await expect(marker(16, 0, "paused")).toHaveCount(1);
      await expect(marker(17, 0, "paused")).toHaveCount(0);
      await expect(table.locator(".route-marker.paused")).toHaveCount(3);
      await expect(marker(18, 0, "paused")).toHaveCount(0);
      const plannedScreenshot = testInfo.outputPath(`bounded-pause-${modern ? "modern" : "legacy"}.png`);
      await opened.page.screenshot({ path: plannedScreenshot });
      await testInfo.attach("Bounded pause includes climbing and preparation", { path: plannedScreenshot, contentType: "image/png" });
      await stabilizeTimer(server.baseUrl, 16 * 315);
      await expect(marker(14, 1, "ready")).toBeVisible();
      await expect(marker(16, 0, "ready")).toBeVisible();
      await expect(table.locator(".route-marker.paused")).toHaveCount(0);
      const screenshot = testInfo.outputPath(`route-resume-${modern ? "modern" : "legacy"}.png`);
      await opened.page.screenshot({ path: screenshot });
      await testInfo.attach("Preparation before route resumption", { path: screenshot, contentType: "image/png" });
      await stabilizeTimer(server.baseUrl, 17 * 315);
      await expect(marker(14, 1, "active")).toHaveCount(1);
      await expect(marker(16, 0, "active")).toHaveCount(1);
    } finally {
      await opened?.context.close();
      await action(server.baseUrl, "startLists", { startLists: previous.startLists });
    }
  });
}

for (const scenario of [
  { width: 360, count: 1 }, { width: 393, count: 1 },
  { width: 360, count: 2 }, { width: 393, count: 2 },
  { width: 480, count: 4, wide: true }
]) {
  test(`Legacy phone intrinsic columns: ${scenario.width}px, ${scenario.count} lists${scenario.wide ? ", wide data" : ""}`, async ({ browser }, testInfo) => {
    const previous = await (await fetch(`${server.baseUrl}/api/state`)).json();
    const names = ["Ольховой Сергей", "Майтус Артур", "Волков Станислав", "Фёдоров Фёдор",
      "Нефедов Леонид", "Федин Арсений", "Ноздрин Иван", "Стариков Владимир", "Барава Павел",
      "Простосердов Никита", "Лапшин Марк", "Овечкин Ярослав", "Тихов Даниил", "Иванов Никита",
      "Печенин Ярослав", "Щекачев Николай"];
    let opened;
    try {
      await action(server.baseUrl, "startLists", { startLists: Array.from({ length: scenario.count }, (_, listIndex) => ({
        headers: scenario.wide ? ["#", "ФИО", "Команда"] : ["#", "ФИО"],
        rows: Array.from({ length: scenario.wide ? 24 : 128 }, (_, rowIndex) => [
          String(rowIndex + 1),
          scenario.wide && rowIndex === listIndex ? "Оченьдлиннаяфамилия Алексей Александрович" : names[(rowIndex + listIndex) % names.length],
          ...(scenario.wide ? ["Спортивный клуб с длинным названием"] : [])
        ]),
        routeCount: scenario.wide ? 8 : 5
      })) });
      await action(server.baseUrl, "reset", { activePreset: "classic",
        settings: { rotationSeconds: 300, breakSeconds: 15, oneShot: false } });
      await stabilizeTimer(server.baseUrl, 15 * 315);
      opened = await openLegacy(browser, server.baseUrl, `visual-legacy-columns-${scenario.width}-${scenario.count}`,
        { width: scenario.width, height: 778 }, Array.from({ length: scenario.count }, (_, index) => index), true);
      const checkGeometry = async (portrait) => {
        const tables = await opened.page.evaluate(() => [...document.querySelectorAll(".protocol-table")].map(table => {
          const scroll = table.parentElement;
          let textOverflows = 0;
          let markerOverflows = 0;
          for (const row of table.tBodies[0].rows) {
            for (const cell of row.querySelectorAll(".protocol-data-cell")) {
              const range = document.createRange();
              range.selectNodeContents(cell);
              if (range.getBoundingClientRect().right > cell.getBoundingClientRect().right - 1) textOverflows++;
            }
            for (const marker of row.querySelectorAll(".route-marker")) {
              const box = marker.getBoundingClientRect();
              const cell = marker.parentElement.getBoundingClientRect();
              if (box.width && (box.left < cell.left || box.right > cell.right)) markerOverflows++;
            }
          }
          return { textOverflows, markerOverflows, firstWidth: table.rows[1].cells[0].offsetWidth,
            routeWidths: [...table.rows[1].querySelectorAll(".protocol-route-cell")].map(cell => cell.offsetWidth),
            nameWidth: table.rows[1].cells[1].offsetWidth, dataWidths: [...table.rows[1].querySelectorAll(".protocol-data-cell")].map(cell => cell.offsetWidth),
            overflow: scroll.scrollWidth > scroll.clientWidth + 2, overflowX: getComputedStyle(scroll).overflowX };
        }));
        expect(tables).toHaveLength(scenario.count);
        for (const table of tables) {
          expect(table.textOverflows).toBe(0);
          expect(table.markerOverflows).toBe(0);
          if (portrait) {
            expect(table.firstWidth).toBeLessThanOrEqual(40);
            for (const width of table.routeWidths) expect(width).toBeLessThanOrEqual(28);
            if (!scenario.wide) {
              expect(table.nameWidth).toBeGreaterThan(150);
              expect(table.overflow).toBe(false);
            } else {
              expect(table.overflow).toBe(true);
              expect(table.overflowX).toBe("auto");
            }
          }
        }
        if (portrait && scenario.count > 1) {
          for (const table of tables.slice(1)) expect(table.dataWidths).toEqual(tables[0].dataWidths);
        }
      };
      await expect(opened.page.locator("body")).toHaveClass(/protocol-portrait/);
      await checkGeometry(true);
      const screenshot = testInfo.outputPath(`legacy-phone-columns-${scenario.width}-${scenario.count}.png`);
      await opened.page.screenshot({ path: screenshot });
      await testInfo.attach("Legacy phone: compact number/routes and full participant names", { path: screenshot, contentType: "image/png" });
      if (scenario.wide) {
        await opened.page.locator(".protocol-scroll").first().evaluate(scroll => { scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth; });
        await expect.poll(() => opened.page.locator(".protocol-scroll").first().evaluate(scroll => scroll.scrollLeft)).toBeGreaterThan(0);
      }
      await opened.page.setViewportSize({ width: 962, height: 541 });
      await expect(opened.page.locator("body")).not.toHaveClass(/protocol-portrait/);
      await wait(800);
      await checkGeometry(false);
      await opened.page.setViewportSize({ width: scenario.width, height: 778 });
      await expect(opened.page.locator("body")).toHaveClass(/protocol-portrait/);
      await wait(800);
      await checkGeometry(true);
    } finally {
      await opened?.context.close();
      await action(server.baseUrl, "startLists", { startLists: previous.startLists });
    }
  });
}

test("Primary fullscreen with lists keeps the cycle visible but not editable", async ({ browser }) => {
  const id = "visual-primary-cycle-fullscreen";
  const opened = await openModern(browser, server.baseUrl, id, { width: 1280, height: 900 }, [0]);
  try {
    await action(server.baseUrl, "primary", { primaryClientId: id });
    await opened.page.waitForFunction(() => document.body.classList.contains("controls-ready")
      && !document.body.classList.contains("viewer-mode"));
    await expect(opened.page.locator("#cycleInput")).toBeEnabled();
    await opened.page.locator("#fullBtn").click();
    await opened.page.waitForFunction(() => Boolean(document.fullscreenElement));
    await expect(opened.page.locator(".cycle-chip")).toBeVisible();
    await expect(opened.page.locator("#cycleInput")).toBeDisabled();
    await expect(opened.page.locator("#progressTrack")).toBeHidden();
    await opened.page.evaluate(() => document.exitFullscreen());
    await expect(opened.page.locator("#cycleInput")).toBeEnabled();
  } finally {
    await action(server.baseUrl, "primary", { primaryClientId: "performance-baseline" });
    await opened.context.close();
  }
});

test("Festival hides the unavailable start-list switch", async ({ browser }) => {
  await action(server.baseUrl, "reset");
  await action(server.baseUrl, "settings", {
    activePreset: "festival",
    settings: {
      rotationMinutes: 5,
      breakSeconds: 0,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    }
  });

  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const toggleRow = page.locator("#startListToggleRow");
    await expect(toggleRow).toHaveJSProperty("hidden", true);
    await expect(toggleRow).toBeHidden();
    expect(await toggleRow.evaluate((element) => getComputedStyle(element).display)).toBe("none");
  } finally {
    await context.close().catch(() => {});
  }
});

test("Disabling remote fullscreen exits viewers once without overriding later manual fullscreen", async ({ browser }) => {
  const screenId = "visual-fullscreen-screen";
  const screenContext = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await screenContext.addInitScript((id) => {
    window.sessionStorage.setItem("boulderingTimerClientId", id);
  }, screenId);
  const screen = await screenContext.newPage();
  try {
    await screen.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await screen.waitForFunction(() => document.body.classList.contains("viewer-mode"));
    await screen.evaluate(() => {
      let fullscreenElement = null;
      let requests = 0;
      let exits = 0;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement
      });
      Object.defineProperty(document.documentElement, "requestFullscreen", {
        configurable: true,
        value: async () => {
          requests += 1;
          fullscreenElement = document.documentElement;
        }
      });
      Object.defineProperty(document, "exitFullscreen", {
        configurable: true,
        value: async () => {
          exits += 1;
          fullscreenElement = null;
        }
      });
      window.fullscreenTestState = () => ({ requests, exits, active: Boolean(fullscreenElement) });
    });
    await action(server.baseUrl, "instancesFullscreen", { enabled: true });
    await screen.waitForFunction(() => window.fullscreenTestState().requests === 1);
    await action(server.baseUrl, "instancesFullscreen", { enabled: false });
    await screen.waitForFunction(() => window.fullscreenTestState().exits === 1);
    await screen.evaluate(() => document.documentElement.requestFullscreen());
    await action(server.baseUrl, "instancesSound", { enabled: true });
    await wait(350);
    expect(await screen.evaluate(() => window.fullscreenTestState())).toEqual({ requests: 2, exits: 1, active: true });
  } finally {
    await screenContext.close();
  }
});

test("Large phone fullscreen keeps the server clock inside a timer-only screen", async ({ browser }) => {
  const clientId = "visual-phone-fullscreen-clock";
  const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
  await context.addInitScript((id) => {
    window.sessionStorage.setItem("boulderingTimerClientId", id);
  }, clientId);
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("viewer-mode"));
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await page.locator("#serverClockDisplay").waitFor();
    await page.evaluate(() => document.body.classList.add("fullscreen"));
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const timerColumn = document.querySelector(".timer-wrap").getBoundingClientRect();
      const clock = document.getElementById("serverClockDisplay").getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        stageHeight: stage.height,
        timerBottom: timerColumn.bottom,
        clockTop: clock.top,
        clockBottom: clock.bottom
      };
    });
    expect(geometry.stageHeight).toBeCloseTo(geometry.viewportHeight, 0);
    expect(geometry.timerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect(geometry.clockTop).toBeGreaterThanOrEqual(0);
    expect(geometry.clockBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await context.close();
  }
});

test("Paused festival progress stays under a motionless held pointer during server sync", async ({ browser }) => {
  await action(server.baseUrl, "reset");
  await action(server.baseUrl, "settings", {
    activePreset: "festival",
    settings: {
      rotationMinutes: 5,
      breakSeconds: 0,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    }
  });
  await action(server.baseUrl, "seek", { elapsed: 60 });

  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  let pointerHeld = false;
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const track = page.locator("#progressTrack");
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    const pointerY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.2, pointerY);
    await page.mouse.down();
    pointerHeld = true;
    await page.mouse.move(box.x + box.width * 0.72, pointerY);
    const heldTransform = await page.locator("#progressBar").evaluate((element) => element.style.transform);
    await wait(2_500);
    const transformAfterSync = await page.locator("#progressBar").evaluate((element) => element.style.transform);
    expect(transformAfterSync).toBe(heldTransform);
    await page.mouse.up();
    pointerHeld = false;
  } finally {
    if (pointerHeld) await page.mouse.up().catch(() => {});
    await context.close();
  }
});

test("Manual restart after a completed scheduled start shows cycle 1 immediately", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  await context.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  const page = await context.newPage();
  try {
    await page.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const settings = {
      rotationSeconds: 240,
      breakSeconds: 15,
      oneShot: false,
      finalRoundFormat: "old",
      finalRestRotations: 3
    };
    const now = new Date();
    await action(server.baseUrl, "reset", { settings });
    await action(server.baseUrl, "start", {
      activePreset: "classic",
      settings,
      startMode: "scheduled",
      startHours: now.getHours(),
      startMinutes: now.getMinutes(),
      elapsedBeforePause: 0
    });
    await page.waitForFunction(() => document.getElementById("startBtn").disabled);
    await action(server.baseUrl, "reset", { settings });
    await page.waitForFunction(() => !document.getElementById("startBtn").disabled);
    const manualStart = await action(server.baseUrl, "start", {
      activePreset: "classic",
      settings,
      startMode: "manual",
      startHours: "",
      startMinutes: "",
      elapsedBeforePause: 0,
      startAudioLead: true
    });
    await page.waitForFunction(() => document.getElementById("startBtn").disabled);
    const cycleState = await page.evaluate(() => {
      const chip = document.querySelector(".cycle-chip");
      const input = document.getElementById("cycleInput");
      return {
        classes: chip ? chip.className : "",
        value: input ? input.value : "",
        text: chip ? chip.textContent.trim() : ""
      };
    });
    expect(manualStart.startedAt - Date.now()).toBeGreaterThan(0);
    expect(cycleState.classes).toContain("cycle-rotation");
    expect(cycleState.classes).not.toContain("cycle-waiting");
    expect(cycleState.value).toBe("1");
    expect(cycleState.text).not.toContain("Отложенный старт");
  } finally {
    await action(server.baseUrl, "reset").catch(() => {});
    await context.close();
  }
});

test("Diagnostics outlines Legacy only when the browser can use the normal interface", async ({ browser }) => {
  const primaryContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const capableContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const requiredContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/79.0.3945.130 Safari/537.36"
  });
  await primaryContext.addInitScript(() => {
    window.sessionStorage.setItem("boulderingTimerClientId", "performance-baseline");
  });
  try {
    const primaryPage = await primaryContext.newPage();
    await primaryPage.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await primaryPage.waitForFunction(() => document.body.classList.contains("controls-ready"));
    const capablePage = await capableContext.newPage();
    await capablePage.goto(`${server.baseUrl}/legacy.html?clientId=visual-capable-legacy`, { waitUntil: "domcontentloaded" });
    const requiredPage = await requiredContext.newPage();
    await requiredPage.goto(`${server.baseUrl}/?clientId=visual-required-legacy`, { waitUntil: "domcontentloaded" });

    const capableCard = primaryPage.locator(`[data-server-time-client="visual-capable-legacy"]`)
      .locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    const requiredCard = primaryPage.locator(`[data-server-time-client="visual-required-legacy"]`)
      .locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    await expect(capableCard.locator(".diag-chip", { hasText: "LEGACY" })).toHaveClass(/manual-legacy/);
    await expect(requiredCard.locator(".diag-chip", { hasText: "LEGACY" })).not.toHaveClass(/manual-legacy/);
  } finally {
    await requiredContext.close();
    await capableContext.close();
    await primaryContext.close();
  }
});

test("Modern phone keeps two protocols readable and fills the remaining screen", async ({ browser }) => {
  const { context, page } = await openModern(
    browser,
    server.baseUrl,
    "visual-modern-phone",
    { width: 360, height: 778 },
    [1, 2]
  );
  try {
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector(".start-list-panel");
      const slots = [...document.querySelectorAll(".start-list-slot")];
      const scrolls = [...document.querySelectorAll(".start-list-scroll")];
      const tables = [...document.querySelectorAll(".start-list-table")];
      const rows = tables.map((table) => table.querySelector("tbody tr"));
      return {
        bodyClass: document.body.className,
        panel: panel && panel.getBoundingClientRect().toJSON(),
        panelScroll: panel && [panel.clientWidth, panel.scrollWidth, panel.clientHeight, panel.scrollHeight],
        slotHeights: slots.map((slot) => slot.getBoundingClientRect().height),
        horizontalOverflow: scrolls.map((scroll) => scroll.scrollWidth - scroll.clientWidth),
        fontSizes: rows.map((row) => Number.parseFloat(getComputedStyle(row).fontSize)),
        rowHeights: rows.map((row) => row.getBoundingClientRect().height),
        visibleRows: scrolls.map((scroll, index) => scroll.clientHeight / rows[index].getBoundingClientRect().height),
        routeRightEdges: tables.map((table) => {
          const cells = table.querySelectorAll("thead th");
          return cells[cells.length - 1].getBoundingClientRect().right;
        })
      };
    });

    expect(metrics.bodyClass).toContain("start-list-dense");
    expect(metrics.bodyClass).not.toContain("start-list-ultra-dense");
    expect(metrics.panel.bottom).toBeGreaterThanOrEqual(777);
    expect(metrics.panel.bottom).toBeLessThanOrEqual(779);
    expect(Math.abs(metrics.slotHeights[0] - metrics.slotHeights[1])).toBeLessThanOrEqual(2);
    expect(metrics.panelScroll[1] - metrics.panelScroll[0]).toBeLessThanOrEqual(1);
    expect(metrics.panelScroll[3] - metrics.panelScroll[2]).toBeLessThanOrEqual(1);
    for (const overflow of metrics.horizontalOverflow) expect(overflow).toBeLessThanOrEqual(1);
    for (const fontSize of metrics.fontSizes) expect(fontSize).toBeGreaterThanOrEqual(10);
    for (const rowHeight of metrics.rowHeights) expect(rowHeight).toBeGreaterThanOrEqual(24);
    for (const visibleRows of metrics.visibleRows) {
      expect(visibleRows).toBeGreaterThanOrEqual(11);
      expect(visibleRows).toBeLessThanOrEqual(12.5);
    }
    for (const right of metrics.routeRightEdges) expect(right).toBeLessThanOrEqual(346);
    await expect(page).toHaveScreenshot("modern-phone-two-protocols.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

test("Modern parallel protocols size columns by their tables instead of the wider controls", async ({ browser }) => {
  const originalState = await (await fetch(`${server.baseUrl}/api/state?clientId=visual-parallel-fixture&startListRevision=`)).json();
  const originalLists = originalState.startLists;
  const clientId = "visual-modern-parallel";
  let opened = null;
  await action(server.baseUrl, "startLists", { startLists: originalLists.slice(0, 2) });
  try {
    opened = await openModern(browser, server.baseUrl, clientId, { width: 1200, height: 800 }, [0, 1]);
    await action(server.baseUrl, "startListLayout", { parallel: true });
    await action(server.baseUrl, "primary", { primaryClientId: clientId });
    await opened.page.waitForFunction(() => document.body.classList.contains("primary-active")
      && document.querySelectorAll(".start-list-column").length === 2
      && document.querySelectorAll("[data-start-list-layout-toggle]").length === 1);
    await wait(350);
    const metrics = await opened.page.evaluate(() => [...document.querySelectorAll(".start-list-column")].map((column) => {
      const controls = column.querySelector(".start-list-panel-controls");
      const scroll = column.querySelector(".start-list-scroll");
      const table = column.querySelector(".start-list-table");
      const fileButton = column.querySelector(".start-list-file-button");
      const fileLabel = fileButton.querySelector("span");
      const buttonRect = fileButton.getBoundingClientRect();
      const labelRect = fileLabel.getBoundingClientRect();
      return {
        controlsOverflow: controls.scrollWidth - controls.clientWidth,
        emptyTableSpace: scroll.clientWidth - table.getBoundingClientRect().width,
        hasLayoutToggle: Boolean(controls.querySelector("[data-start-list-layout-toggle]")),
        labelLeftOverflow: buttonRect.left - labelRect.left,
        labelRightOverflow: labelRect.right - buttonRect.right,
        labelTextOverflow: getComputedStyle(fileLabel).textOverflow,
        labelOverflow: fileLabel.scrollWidth - fileLabel.clientWidth
      };
    }));
    expect(metrics).toHaveLength(2);
    expect(metrics[1].hasLayoutToggle).toBe(true);
    for (const metric of metrics) {
      expect(metric.controlsOverflow).toBeLessThanOrEqual(1);
      expect(metric.emptyTableSpace).toBeLessThanOrEqual(3);
      expect(metric.labelLeftOverflow).toBeLessThanOrEqual(1);
      expect(metric.labelRightOverflow).toBeLessThanOrEqual(1);
      expect(metric.labelTextOverflow).toBe("ellipsis");
    }
    expect(metrics.some((metric) => metric.labelOverflow > 1)).toBe(true);
  } finally {
    if (opened) await opened.context.close();
    await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "primary", clientId, primaryClientId: "performance-baseline" })
    });
    await action(server.baseUrl, "startListLayout", { parallel: false });
    await action(server.baseUrl, "startLists", { startLists: originalLists });
  }
});

test("Diagnostics switches the layout of exactly two lists on one screen", async ({ browser }) => {
  const screenId = "visual-layout-screen";
  const primaryId = "visual-layout-controller";
  let screen = null;
  let primary = null;
  let extraScreen = null;
  try {
    screen = await openModern(browser, server.baseUrl, screenId, { width: 1000, height: 800 }, [0, 1]);
    await action(server.baseUrl, "primary", { primaryClientId: null });
    const primaryContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await primaryContext.addInitScript((id) => {
      window.sessionStorage.setItem("boulderingTimerClientId", id);
    }, primaryId);
    const primaryPage = await primaryContext.newPage();
    primary = { context: primaryContext, page: primaryPage };
    await primaryPage.goto(`${server.baseUrl}/`, { waitUntil: "domcontentloaded" });
    extraScreen = await openModern(browser, server.baseUrl, "visual-layout-extra-screen", { width: 800, height: 600 }, [0]);
    await action(server.baseUrl, "primary", { clientId: primaryId, primaryClientId: primaryId });
    await primary.page.waitForFunction(() => document.body.classList.contains("controls-ready")
      && !document.body.classList.contains("viewer-mode"), null, { timeout: 5_000 });
    await screen.page.waitForFunction(() => document.body.classList.contains("viewer-mode"), null, { timeout: 5_000 });
    const browserNumbersToggle = primary.page.locator("#browserNumbersToggle");
    await expect(browserNumbersToggle).toBeVisible();
    const togglePlacement = await browserNumbersToggle.evaluate((button) => {
      const card = button.closest(".browser-item");
      const cardRect = card.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return {
        isPrimary: card.classList.contains("primary-browser"),
        top: buttonRect.top - cardRect.top,
        right: cardRect.right - buttonRect.right,
        insideHeading: Boolean(button.closest(".connections-heading"))
      };
    });
    expect(togglePlacement.isPrimary).toBe(true);
    expect(togglePlacement.insideHeading).toBe(false);
    expect(Math.abs(togglePlacement.top - 4)).toBeLessThanOrEqual(1);
    expect(Math.abs(togglePlacement.right - 3)).toBeLessThanOrEqual(1);
    const layoutButton = primary.page.locator(`[data-start-list-layout-client="${screenId}"]`);
    await expect(layoutButton).toHaveCount(1);
    await expect(layoutButton).toBeVisible();
    await expect(layoutButton).toHaveText("|");
    const screenCard = layoutButton.locator("xpath=ancestor::*[contains(@class, 'browser-item')]");
    await expect(screenCard.locator(".start-list-layout-overridden")).toHaveCount(0);
    const listLabels = await screenCard.locator("[data-start-list-client]").allTextContents();
    expect(listLabels).toEqual(["LIST 1", "LIST 2", "LIST 3", "LIST 4"]);
    // Diagnostics can replace a card between resolving a locator and reading
    // its pseudo-element style. Retry that read, retaining the exact values.
    await expect.poll(() => layoutButton.evaluate((button) => {
      const before = getComputedStyle(button, "::before");
      const after = getComputedStyle(button, "::after");
      return {
        beforeWidth: parseFloat(before.width),
        afterDisplay: after.display
      };
    })).toEqual({ beforeWidth: 2, afterDisplay: "none" });
    const pinButton = screenCard.locator("[data-browser-pin]");
    await expect(pinButton.locator("g")).toHaveAttribute("transform", "rotate(45 8 8)");
    await expect(pinButton.locator(".browser-pin-needle")).toHaveClass(/sharp/);
    await expect(pinButton.locator(".browser-pin-tip")).toHaveCount(1);
    await pinButton.click();
    await expect(pinButton).toHaveClass(/active/);
    await expect(pinButton.locator("g")).not.toHaveAttribute("transform", /.+/);
    await expect(pinButton.locator(".browser-pin-needle")).not.toHaveClass(/sharp/);
    await expect(pinButton.locator(".browser-pin-tip")).toHaveCount(0);
    await pinButton.click();
    await expect(pinButton).not.toHaveClass(/active/);
    const timeButton = screenCard.locator(`[data-server-time-client="${screenId}"]`);
    const diagnosticLabels = await screenCard
      .locator(".diag-row:not(.start-list-diag-row) > .diag-chip")
      .allTextContents();
    expect(diagnosticLabels).toEqual(["LEGACY", "AUDIO", "TIME", "NET", "SYNC", "SSE", "TAB"]);
    await expect(timeButton).toHaveText("TIME");
    await expect(timeButton).toHaveClass(/inactive/);
    await expect(screenCard.locator(".diag-chip", { hasText: "TAB" })).toHaveAttribute("title", /Wake Lock/);
    await expect(screen.page.locator("#serverClockDisplay")).toBeHidden();
    await timeButton.click();
    await expect(timeButton).not.toHaveClass(/inactive/);
    await expect(screen.page.locator("#serverClockDisplay")).toBeVisible();
    await expect(screen.page.locator("#serverClockDisplay")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const clockGeometry = await screen.page.evaluate(() => {
      const timer = document.getElementById("time").getBoundingClientRect();
      const clock = document.getElementById("serverClockDisplay").getBoundingClientRect();
      const timerColumn = document.querySelector(".timer-column").getBoundingClientRect();
      const style = getComputedStyle(document.getElementById("serverClockDisplay"));
      return {
        timerHeight: timer.height,
        clockWidth: clock.width,
        clockHeight: clock.height,
        clockTop: clock.top,
        timerBottom: timer.bottom,
        bottomGap: timerColumn.bottom - clock.bottom,
        footerDisplay: getComputedStyle(document.querySelector(".timer-column footer")).display,
        progressDisplay: getComputedStyle(document.getElementById("progressTrack")).display,
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        backgroundImage: style.backgroundImage,
        borderRadius: parseFloat(style.borderRadius)
      };
    });
    expect(clockGeometry.clockHeight).toBeLessThan(clockGeometry.timerHeight / 2);
    expect(clockGeometry.clockWidth / clockGeometry.fontSize).toBeLessThan(6.5);
    expect(clockGeometry.clockTop).toBeGreaterThanOrEqual(clockGeometry.timerBottom);
    expect(clockGeometry.bottomGap, JSON.stringify(clockGeometry)).toBeGreaterThanOrEqual(0);
    expect(clockGeometry.footerDisplay).toBe("block");
    expect(clockGeometry.progressDisplay).toBe("none");
    expect(clockGeometry.fontFamily).toContain("FDV LCD");
    expect(Number(clockGeometry.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(clockGeometry.backgroundImage).not.toBe("none");
    expect(clockGeometry.borderRadius).toBeGreaterThan(0);
    await timeButton.click();
    await expect(screen.page.locator("#serverClockDisplay")).toBeHidden();
    const placement = await layoutButton.evaluate((button) => {
      const card = button.closest(".browser-item");
      const row = button.closest(".start-list-diag-row");
      const listButtons = [...row.querySelectorAll("[data-start-list-client]")];
      const lastListRect = listButtons.at(-1).getBoundingClientRect();
      const previousListRect = listButtons.at(-2).getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      return {
        width: buttonRect.width,
        height: buttonRect.height,
        listWidth: lastListRect.width,
        listHeight: lastListRect.height,
        layoutGap: buttonRect.left - lastListRect.right,
        ordinaryGap: lastListRect.left - previousListRect.right,
        rightInset: cardRect.right - buttonRect.right
      };
    });
    expect(placement.width).toBe(placement.listWidth);
    expect(placement.height).toBe(placement.listHeight);
    expect(placement.layoutGap).toBeGreaterThan(placement.ordinaryGap);
    expect(placement.rightInset).toBeGreaterThanOrEqual(0);
    const layoutResponse = await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "startListClientLayout",
        clientId: primaryId,
        targetClientId: screenId,
        parallel: true
      })
    });
    expect(layoutResponse.ok).toBe(true);
    const layoutState = await layoutResponse.json();
    expect(layoutState.clients.find((client) => client.id === screenId).startListParallel).toBe(true);
    await screen.page.waitForFunction(() => document.querySelectorAll(".start-list-column").length === 2, null, { timeout: 5_000 });
    await expect(layoutButton).toHaveText("||");
    await expect(layoutButton).toHaveClass(/start-list-layout-overridden/);
    await expect(screenCard.locator("[data-start-list-client].start-list-selected")).toHaveCount(2);
    await expect(screenCard.locator("[data-start-list-client].start-list-layout-overridden")).toHaveCount(0);
    await expect.poll(() => layoutButton.evaluate((button) => ({
      width: parseFloat(getComputedStyle(button, "::before").width),
      centerGap: parseFloat(getComputedStyle(button, "::after").left)
        - parseFloat(getComputedStyle(button, "::before").left),
      secondDisplay: getComputedStyle(button, "::after").display
    }))).toEqual({ width: 2, centerGap: 6, secondDisplay: "block" });
    await fetch(`${server.baseUrl}/api/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "startListDisplay",
        clientId: primaryId,
        targetClientId: screenId,
        listIndex: 0,
        enabled: false
      })
    });
    await expect(layoutButton).toHaveCount(0);
  } finally {
    if (primary) {
      await fetch(`${server.baseUrl}/api/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "primary",
          clientId: "performance-baseline",
          primaryClientId: "performance-baseline"
        })
      }).catch(() => {});
      await primary.context.close();
    }
    if (extraScreen) await extraScreen.context.close();
    if (screen) await screen.context.close();
  }
});

for (const portrait of [false, true]) {
  test(`Old TV Legacy releases the list area without resize events (${portrait ? "portrait" : "landscape"})`, async ({ browser }, testInfo) => {
    const id = `visual-old-tv-hide-${portrait}`;
    const viewport = portrait ? { width: 360, height: 778 } : { width: 962, height: 541 };
    const opened = await openLegacy(browser, server.baseUrl, id, viewport, [0], true, true);
    const readGeometry = () => opened.page.evaluate(() => ({
      pane: document.getElementById("timerPane").getBoundingClientRect().toJSON(),
      wrap: document.getElementById("wrap").getBoundingClientRect().toJSON(),
      clock: document.getElementById("serverClock").getBoundingClientRect().toJSON()
    }));
    try {
      await action(server.baseUrl, "clientServerTime", { targetClientId: id, enabled: true });
      await expect(opened.page.locator("#serverClock")).toBeVisible();
      // Let all initial font/layout fallback callbacks finish before hiding.
      await wait(1200);
      for (const globalDisable of [false, true]) {
        if (globalDisable) await action(server.baseUrl, "startListEnabled", { enabled: false });
        else await selectProtocols(server.baseUrl, id, []);
        await expect(opened.page.locator("#protocolPane")).toBeHidden();
        await expect.poll(async () => (await readGeometry()).pane.width).toBe(viewport.width);
        await expect.poll(async () => (await readGeometry()).pane.height).toBe(viewport.height);
        await expect.poll(async () => (await readGeometry()).wrap.width).toBe(viewport.width);
        await expect.poll(async () => (await readGeometry()).wrap.height).toBe(viewport.height);
        const geometry = await readGeometry();
        expect(Math.abs((geometry.clock.left + geometry.clock.right) / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
        expect(geometry.clock.bottom).toBeLessThanOrEqual(viewport.height);
        await expect(opened.page.locator("#cycleBadge")).toBeHidden();
        const image = testInfo.outputPath(`old-tv-list-hidden-${portrait ? "portrait" : "landscape"}-${globalDisable}.png`);
        await opened.page.screenshot({ path: image });
        await testInfo.attach("Old TV with lists hidden", { path: image, contentType: "image/png" });
        if (globalDisable) await action(server.baseUrl, "startListEnabled", { enabled: true });
        else await selectProtocols(server.baseUrl, id, [0]);
        await expect(opened.page.locator("#protocolPane")).toBeVisible();
        await expect(opened.page.locator("#cycleBadge")).toBeVisible();
        await expect.poll(async () => {
          const rect = (await readGeometry()).pane;
          return portrait ? rect.height < viewport.height : rect.width < viewport.width;
        }).toBe(true);
      }
    } finally {
      await action(server.baseUrl, "clientServerTime", { targetClientId: id, enabled: false });
      await action(server.baseUrl, "startListEnabled", { enabled: true });
      await opened.context.close();
    }
  });
}

test("Legacy screen renders the optional server clock below its main timer", async ({ browser }) => {
  const clientId = "visual-legacy-server-clock";
  const opened = await openLegacy(browser, server.baseUrl, clientId, { width: 1000, height: 800 }, [0]);
  try {
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await opened.page.waitForFunction(() => !document.body.classList.contains("protocol-visible"));
    await wait(250);
    await expect(opened.page.locator("#serverClock")).toBeHidden();
    const timerBeforeClock = await opened.page.evaluate(() => {
      const timer = document.getElementById("time");
      return {
        fontSize: parseFloat(getComputedStyle(timer).fontSize),
        top: timer.getBoundingClientRect().top
      };
    });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await expect(opened.page.locator("#serverClock")).toBeVisible();
    await expect(opened.page.locator("#serverClockText")).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const geometry = await opened.page.evaluate(() => {
      const timer = document.getElementById("time").getBoundingClientRect();
      const clock = document.getElementById("serverClock").getBoundingClientRect();
      const timerWrap = document.getElementById("wrap").getBoundingClientRect();
      const style = getComputedStyle(document.getElementById("serverClock"));
      return {
        clockHeight: clock.height,
        clockTop: clock.top,
        clockBottom: clock.bottom,
        viewportHeight: window.innerHeight,
        bottomGap: timerWrap.bottom - clock.bottom,
        timerFontSize: parseFloat(getComputedStyle(document.getElementById("time")).fontSize),
        clockFontSize: parseFloat(style.fontSize),
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        borderRadius: parseFloat(style.borderRadius)
      };
    });
    expect(geometry.clockFontSize).toBeLessThan(geometry.timerFontSize / 2);
    expect(Math.abs(geometry.timerFontSize - timerBeforeClock.fontSize)).toBeLessThanOrEqual(1);
    expect(geometry.clockTop).toBeGreaterThan(geometry.viewportHeight * 0.6);
    expect(geometry.clockBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    expect(Math.abs(geometry.bottomGap - geometry.clockHeight)).toBeLessThanOrEqual(1);
    expect(geometry.fontFamily).toContain("FDV LCD");
    expect(Number(geometry.fontWeight)).toBeGreaterThanOrEqual(700);
    expect(geometry.borderRadius).toBeGreaterThan(0);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await opened.context.close();
  }
});

test("Legacy classic countdown starts from the same absolute timestamp after the network disappears", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  let stateRequests = 0;
  await page.route("**/api/state?**", async (route) => {
    stateRequests += 1;
    if (stateRequests > 1) {
      await route.abort("internetdisconnected");
      return;
    }
    const response = await route.fetch();
    const remote = await response.json();
    const now = Date.now();
    await route.fulfill({
      response,
      json: {
        ...remote,
        now,
        running: true,
        completed: false,
        countdownOnly: false,
        waitingForManualStart: false,
        startedAt: now + 1500,
        elapsedBeforePause: 0,
        activePreset: "classic",
        runtimePreset: "classic",
        activeSettings: { ...remote.activeSettings, rotationSeconds: 10, breakSeconds: 0, oneShot: false },
        manualLegacy: true,
        legacyRedirect: false,
        showServerTime: true,
        legacyProtocols: []
      }
    });
  });
  try {
    await page.goto(`${server.baseUrl}/legacy.html?manualLegacy=1&oldBrowser=1&clientId=visual-legacy-offline-start`, {
      waitUntil: "domcontentloaded"
    });
    await expect(page.locator("#time")).toHaveText("00:02");
    const clockBefore = await page.locator("#serverClockText").textContent();
    await wait(5_600);
    await expect(page.locator("body")).toHaveClass(/offline/);
    await expect(page.locator("#time")).toHaveText(/00:0[45]/);
    const clockAfter = await page.locator("#serverClockText").textContent();
    expect(clockAfter).not.toBe(clockBefore);
  } finally {
    await context.close();
  }
});

test("Legacy short TV viewport keeps the server clock clear of the main timer", async ({ browser }) => {
  const clientId = "visual-legacy-short-server-clock";
  const opened = await openLegacy(browser, server.baseUrl, clientId, { width: 962, height: 541 }, [0]);
  try {
    await action(server.baseUrl, "startListEnabled", { enabled: false });
    await opened.page.waitForFunction(() => !document.body.classList.contains("protocol-visible"));
    await opened.page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await wait(250);
    const timerBeforeClock = await opened.page.evaluate(() => {
      const timer = document.getElementById("time");
      return {
        fontSize: parseFloat(getComputedStyle(timer).fontSize),
        top: timer.getBoundingClientRect().top
      };
    });
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: true });
    await expect(opened.page.locator("#serverClock")).toBeVisible();
    const geometry = await opened.page.evaluate(() => {
      const wrap = document.getElementById("wrap").getBoundingClientRect();
      const clock = document.getElementById("serverClock").getBoundingClientRect();
      const timer = document.getElementById("time").getBoundingClientRect();
      const timerFontSize = parseFloat(getComputedStyle(document.getElementById("time")).fontSize);
      return {
        clockHeight: clock.height,
        bottomGap: wrap.bottom - clock.bottom,
        timerTop: timer.top,
        timerFontSize
      };
    });
    expect(Math.abs(geometry.timerFontSize - timerBeforeClock.fontSize)).toBeLessThanOrEqual(1);
    expect(Math.abs((timerBeforeClock.top - geometry.timerTop) - geometry.clockHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.bottomGap - geometry.clockHeight)).toBeLessThanOrEqual(1);
  } finally {
    await action(server.baseUrl, "clientServerTime", { targetClientId: clientId, enabled: false }).catch(() => {});
    await action(server.baseUrl, "startListEnabled", { enabled: true }).catch(() => {});
    await opened.context.close();
  }
});

test("Legacy TV fallback keeps column headers visible after automatic scrolling", async ({ browser }) => {
  const { context, page } = await openLegacy(
    browser,
    server.baseUrl,
    "visual-legacy-tv-sticky",
    { width: 962, height: 541 },
    [0, 3],
    true
  );
  try {
    await page.locator(".protocol-scroll").evaluateAll((scrolls) => {
      for (const scroll of scrolls) {
        scroll.scrollTop = 600;
        scroll.dispatchEvent(new Event("scroll"));
      }
    });
    await wait(100);
    const headers = await page.evaluate(() => [...document.querySelectorAll(".protocol-scroll")].map((scroll) => {
      const cells = [...scroll.querySelectorAll("thead th")];
      const routeCell = cells[cells.length - 1];
      const scrollRect = scroll.getBoundingClientRect();
      const cellRects = cells.map((cell) => cell.getBoundingClientRect());
      const routeRect = routeCell.getBoundingClientRect();
      const topElement = document.elementFromPoint(
        routeRect.left + routeRect.width / 2,
        routeRect.top + routeRect.height / 2
      );
      return {
        scrollTop: scroll.scrollTop,
        deltas: cellRects.map((rect) => rect.top - scrollRect.top),
        cellBottom: routeRect.bottom,
        scrollTopEdge: scrollRect.top,
        routeText: routeCell.textContent.trim(),
        routeCellOnTop: topElement === routeCell || routeCell.contains(topElement)
      };
    }));
    await expect(page.locator("body")).toHaveClass(/protocol-sticky-fallback/);
    for (const header of headers) {
      expect(header.scrollTop).toBeGreaterThan(0);
      for (const delta of header.deltas) expect(Math.abs(delta)).toBeLessThanOrEqual(1);
      expect(header.cellBottom).toBeGreaterThan(header.scrollTopEdge);
      expect(header.routeText).toBe("5");
      expect(header.routeCellOnTop).toBe(true);
    }
    const dataCells = await page.locator(".protocol-table tbody .protocol-data-cell").evaluateAll((cells) => cells.map((cell) => ({
      clientWidth: cell.clientWidth,
      scrollWidth: cell.scrollWidth,
      textOverflow: getComputedStyle(cell).textOverflow
    })));
    for (const cell of dataCells) {
      expect(cell.textOverflow).not.toBe("ellipsis");
      expect(cell.scrollWidth - cell.clientWidth).toBeLessThanOrEqual(1);
    }
    await expect(page).toHaveScreenshot("legacy-tv-sticky-fallback.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

test("Legacy TV remains stable after four protocols become two and the timer stops", async ({ browser }) => {
  const { context, page } = await openLegacy(
    browser,
    server.baseUrl,
    "visual-legacy-tv-transition",
    { width: 962, height: 541 },
    [0, 1, 2, 3]
  );
  try {
    await selectProtocols(server.baseUrl, "visual-legacy-tv-transition", [0, 3]);
    await action(server.baseUrl, "reset", {
      activePreset: "classic",
      settings: { rotationSeconds: 8, breakSeconds: 3, oneShot: false }
    });
    await page.waitForFunction(() => document.querySelectorAll(".protocol-table").length === 2);
    await wait(300);
    const metrics = await page.evaluate(() => {
      const pane = document.getElementById("protocolPane").getBoundingClientRect();
      const columns = [...document.querySelectorAll(".protocol-column")].map((column) => column.getBoundingClientRect());
      const slots = [...document.querySelectorAll(".protocol-slot")].map((slot) => slot.getBoundingClientRect());
      const tables = [...document.querySelectorAll(".protocol-table")];
      const widths = tables.map((table) => [...table.querySelectorAll("thead th")].map((cell) => cell.getBoundingClientRect().width));
      return {
        pane: pane.toJSON(),
        columns: columns.map((rect) => rect.toJSON()),
        slots: slots.map((rect) => rect.toJSON()),
        widths
      };
    });
    expect(metrics.columns).toHaveLength(1);
    expect(metrics.slots).toHaveLength(2);
    expect(Math.abs(metrics.pane.right - 962)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.columns[0].right - metrics.pane.right)).toBeLessThanOrEqual(1);
    for (const slot of metrics.slots) {
      expect(Math.abs(slot.left - metrics.pane.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(slot.right - metrics.pane.right)).toBeLessThanOrEqual(1);
    }
    expect(metrics.widths[0].length).toBe(metrics.widths[1].length);
    metrics.widths[0].forEach((width, index) => {
      expect(Math.abs(width - metrics.widths[1][index])).toBeLessThanOrEqual(1);
    });
    await expect(page).toHaveScreenshot("legacy-tv-two-after-stop.png", { fullPage: false });
  } finally {
    await context.close();
  }
});

for (const scenario of [
  { name: "Modern 1000x1000 with four protocols", modern: true },
  { name: "Legacy 1000x1000 with four protocols", modern: false }
]) {
  test(`${scenario.name} keeps every protocol inside the viewport`, async ({ browser }) => {
    const clientId = scenario.modern ? "visual-modern-square" : "visual-legacy-square";
    const opened = scenario.modern
      ? await openModern(browser, server.baseUrl, clientId, { width: 1000, height: 1000 }, [0, 1, 2, 3])
      : await openLegacy(browser, server.baseUrl, clientId, { width: 1000, height: 1000 }, [0, 1, 2, 3]);
    try {
      const selector = scenario.modern ? ".start-list-slot" : ".protocol-slot";
      const rects = await opened.page.locator(selector).evaluateAll((slots) => slots.map((slot) => slot.getBoundingClientRect().toJSON()));
      expect(rects).toHaveLength(4);
      for (const rect of rects) {
        expect(rect.left).toBeGreaterThanOrEqual(-1);
        expect(rect.top).toBeGreaterThanOrEqual(-1);
        expect(rect.right).toBeLessThanOrEqual(1001);
        expect(rect.bottom).toBeLessThanOrEqual(1001);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
      }
      await action(server.baseUrl, "showBrowserNumbers", { enabled: true });
      const badge = opened.page.locator("#browserNumberBadge");
      await expect(badge).toBeVisible();
      const badgePlacement = await opened.page.evaluate((modern) => {
        const badgeElement = document.getElementById("browserNumberBadge");
        const timerElement = document.querySelector(modern ? ".timer-column" : "#timerPane");
        const badgeRect = badgeElement.getBoundingClientRect();
        const timerRect = timerElement.getBoundingClientRect();
        return {
          timerRight: timerRect.right,
          topOffset: badgeRect.top - timerRect.top,
          rightOffset: timerRect.right - badgeRect.right
        };
      }, scenario.modern);
      expect(badgePlacement.timerRight).toBeLessThan(999);
      expect(Math.abs(badgePlacement.topOffset - 12)).toBeLessThanOrEqual(1);
      expect(Math.abs(badgePlacement.rightOffset - 12)).toBeLessThanOrEqual(1);
    } finally {
      await action(server.baseUrl, "showBrowserNumbers", { enabled: false });
      await opened.context.close();
    }
  });
}
