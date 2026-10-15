"use strict";

const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { fixture } = require("../helpers/controlled-clock-server");

async function withClockServer(run) {
  const cleanup = [];
  try {
    const server = await fixture({ after: callback => cleanup.push(callback) }, "darwin", { liveClocks: true });
    await run(server);
  } finally {
    for (const callback of cleanup.reverse()) await callback();
  }
}

test("new screen does not display or schedule a wrong timer when SSE precedes clock calibration", async ({ browser }) => {
  await withClockServer(async server => {
    await server.start({ elapsedBeforePause: 52 });
    const context = await browser.newContext();
    let release;
    try {
      await context.addInitScript(() => {
        const originalNow = Date.now.bind(Date);
        Date.now = () => originalNow() + 5000;
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const held = new Promise(resolve => { release = resolve; });
      await page.route("**/api/state?**", async route => { await held; await route.continue().catch(() => {}); });
      await page.goto(server.baseUrl + "/?perf=3", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(lastServerInstanceId) && state.running);
      await page.evaluate(() => unlockAudio(false));
      await expect(page.locator("#time")).toHaveAttribute("aria-label", "--:--");
      await expect(page.locator("#serverConnectionWarningTitle")).toHaveText("Синхронизация времени");
      expect(await page.evaluate(() => ({pending:clockCalibrationPending,
        nodes:scheduledAudioNodes.length, plans:scheduledSignalKeys.size, played:playedSignalKeys.size})))
        .toEqual({pending:true,nodes:0,plans:0,played:0});
      expect(await page.evaluate(() => {
        saveOfflineSnapshot();
        return localStorage.getItem(offlineSnapshotKey);
      })).toBeNull();
      await page.screenshot({ path: path.resolve(__dirname, "../../help-assets/initial-clock-sync.png") });
      release();
      await page.unroute("**/api/state?**");
      await page.waitForFunction(() => !clockCalibrationPending && state.timerClockVersion === 1);
      await expect(page.locator("#time")).not.toHaveAttribute("aria-label", "--:--");
      await expect(page.locator("#timeMinutes")).not.toHaveText("--");
      expect(await page.evaluate(() => {
        saveOfflineSnapshot();
        return JSON.parse(localStorage.getItem(offlineSnapshotKey)).timerClockVersion;
      })).toBe(1);
      const remote = await server.state();
      expect(Math.abs(await page.evaluate(() => elapsedSeconds()) - remote.elapsed)).toBeLessThan(0.25);
      expect(errors).toEqual([]);
    } finally {
      release?.();
      await context.close();
    }
  });
});

test("calendar changes preserve a running screen's clock, timers and already scheduled Web Audio nodes", async ({ browser }) => {
  await withClockServer(async server => {
    await server.start({ settings:{rotationSeconds:125,breakSeconds:15,oneShot:false} });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(server.baseUrl + "/?perf=3", { waitUntil:"domcontentloaded" });
      await page.waitForFunction(() => !clockCalibrationPending && state.timerClockVersion === 1);
      await page.waitForFunction(() => !syncRequestInFlight);
      await page.evaluate(async () => {
        for (let i = 0; i < 6; i += 1) await syncFromServer({skipBurst:true});
        await unlockAudio(false);
        await loadAudioBuffers();
        // A real Web Audio node far enough ahead to survive the assertions.
        scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()), serverNow()+30000, "minute", false, true);
        window.clockTest = {
          nodes: scheduledAudioNodes.slice(), clears:0,
          generation: audioScheduleGeneration, startedAt: state.serverStartedAt,
          version: lastServerVersion, elapsed: elapsedSeconds(), perf:performance.now()
        };
        const originalClear = clearSignalTimers;
        clearSignalTimers = (...args) => { window.clockTest.clears += 1; return originalClear(...args); };
      });
      expect(await page.evaluate(() => window.clockTest.nodes.length)).toBeGreaterThan(0);
      for (const offset of [120000, -120000, 0]) {
        server.frame(offset, 0, 0);
        await server.state();
        await page.evaluate(() => syncFromServer({skipBurst:true}));
        const result = await page.evaluate(() => ({
          pending:clockCalibrationPending,
          sameNodes:window.clockTest.nodes.every(node => scheduledAudioNodes.includes(node)),
          clears:window.clockTest.clears,
          generation:audioScheduleGeneration-window.clockTest.generation,
          startShift:state.serverStartedAt-window.clockTest.startedAt,
          versionShift:lastServerVersion-window.clockTest.version,
          elapsedError:elapsedSeconds()-window.clockTest.elapsed-(performance.now()-window.clockTest.perf)/1000,
          syncError:syncQuality.error,
          wallOffset:state.serverWallOffset
        }));
        expect(result.pending).toBe(false);
        expect(result.sameNodes).toBe(true);
        expect(result.clears).toBe(0);
        expect(result.generation).toBe(0);
        expect(Math.abs(result.startShift)).toBeLessThan(0.01);
        expect(result.versionShift).toBe(0);
        expect(Math.abs(result.elapsedError)).toBeLessThan(0.1);
        expect(result.syncError).toBeLessThan(100);
        expect(Math.abs(result.wallOffset-offset)).toBeLessThan(10);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
});
