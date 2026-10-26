"use strict";

const { test, expect } = require("@playwright/test");
const { fixture } = require("../helpers/controlled-clock-server");

async function withDisplays(browser, run) {
  const cleanup = [], contexts = [], pages = [], errors = [];
  try {
    const server = await fixture({after:fn => cleanup.push(fn)}, "darwin", {liveClocks:true});
    for (const id of ["final-operator", "final-screen"]) {
      const context = await browser.newContext(); contexts.push(context);
      await context.addInitScript(id => sessionStorage.setItem("boulderingTimerClientId", id), id);
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(server.baseUrl, {waitUntil:"domcontentloaded"});
      await page.waitForFunction(() => !clockCalibrationPending && eventSourceConnected && !syncRequestInFlight);
      await page.mouse.click(8, 8);
      await page.evaluate(async () => {
        await unlockAudio(false); await loadAudioBuffers();
        window.finalStartProbe = [];
        const original = markSignalPlayed;
        markSignalPlayed = function(key) {
          const accepted = original(key);
          if (accepted) window.finalStartProbe.push({key,at:serverNow()});
          return accepted;
        };
      });
      expect(await page.evaluate(() => canPlaySound() && audioContext?.state === "running")).toBe(true);
    }
    await run(server, pages);
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
    for (const fn of cleanup.reverse()) await fn();
  }
}

async function reset(server, pages, oneShot = true) {
  const activePreset = oneShot ? "final" : "classic";
  await server.action({type:"settings",activePreset,settings:{rotationMinutes:1,breakSeconds:0,oneShot}});
  await server.action({type:"reset",activePreset,settings:{rotationSeconds:8,breakSeconds:0,oneShot}});
  for (const page of pages) {
    await page.waitForFunction(preset => !state.running && state.activePreset === preset, activePreset);
    await page.evaluate(() => {window.finalStartProbe=[];});
  }
  // The operator's normal action/transport is retained; shorten only the fixture.
  await pages[0].evaluate(() => {activeSettingsFromDraft=()=>({...state.activeSettings,rotationSeconds:8});});
}

async function manualStart(pages) {
  await pages[0].evaluate(() => startTimer());
  await Promise.all(pages.map(page => page.waitForFunction(() => state.running)));
}

async function signals(page) {
  return page.evaluate(() => ({
    starts:window.finalStartProbe.filter(e=>e.key.includes(":rotation:start:")),
    warnings:window.finalStartProbe.filter(e=>e.key.includes(":warn:")),
    ends:window.finalStartProbe.filter(e=>e.key.includes("rotationBoundary:1:finish:"))
  }));
}

test("manual Final starts exactly once on both clients, including the next attempt and complete ending", async ({browser}) => {
  await withDisplays(browser, async (server,pages) => {
    for (let attempt=0;attempt<2;attempt+=1) {
      await reset(server,pages);
      await manualStart(pages);
      await expect.poll(async()=> (await server.state()).completed,{timeout:12000}).toBe(true);
      await pages[0].waitForTimeout(350);
      for (const page of pages) {
        const result=await signals(page);
        expect(result.starts).toHaveLength(1);
        expect(result.warnings).toHaveLength(5);
        expect(result.ends).toHaveLength(1);
      }
    }
  });
});

test("Final preliminary countdown still waits for manual Start and Classic start is unchanged", async ({browser}) => {
  await withDisplays(browser, async (server,pages) => {
    await reset(server,pages);
    // Empty scheduled fields resolve to now: complete the preliminary countdown
    // immediately, without changing host clocks or waiting for a calendar minute.
    await server.start({activePreset:"final",startMode:"scheduled",startHours:"",startMinutes:"",
      settings:{rotationSeconds:8,breakSeconds:0,oneShot:true}});
    await Promise.all(pages.map(page=>page.waitForFunction(()=>state.waitingForManualStart)));
    await pages[0].waitForTimeout(500);
    for (const page of pages) expect((await signals(page)).starts).toHaveLength(0);
    await manualStart(pages);
    await pages[0].waitForTimeout(1600);
    for (const page of pages) expect((await signals(page)).starts).toHaveLength(1);
    await reset(server,pages,false);
    await manualStart(pages);
    await pages[0].waitForTimeout(1600);
    for (const page of pages) expect((await signals(page)).starts).toHaveLength(1);
  });
});

test("manual Final audio correction does not duplicate the operator watchdog or omit screen start", async ({browser}) => {
  await withDisplays(browser, async (server,pages) => {
    for (const offset of [-750,250]) {
      await reset(server,pages);
      // Apply an existing authoritative per-client setting, not forced sound.
      for (const page of pages) {
        await server.action({type:"audioOffset",targetClientId:await page.evaluate(()=>clientId),offset});
        await page.waitForFunction(offset=>audioUserOffsetMs===offset,offset);
      }
      await manualStart(pages);
      await pages[0].waitForTimeout(1800);
      for (const page of pages) expect((await signals(page)).starts).toHaveLength(1);
    }
  });
});
