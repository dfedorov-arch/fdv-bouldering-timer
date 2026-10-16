"use strict";

const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { fixture } = require("../helpers/controlled-clock-server");

async function withServers(run) {
  const cleanup = [];
  const contexts = [];
  try {
    const primary = await fixture({after:callback=>cleanup.push(callback)}, null);
    const backup = await fixture({after:callback=>cleanup.push(callback)}, null);
    await primary.action({clientId:"operator",type:"primary",primaryClientId:"operator"});
    await primary.action({clientId:"operator",type:"startLists",startLists:[{headers:["#","ФИО"],rows:[["1","Проверка SEC"]],routeCount:5}]});
    await primary.start({clientId:"operator",settings:{rotationSeconds:180,breakSeconds:15,oneShot:false},elapsedBeforePause:10});
    await run({primary,backup,contexts});
  } finally {
    for (const context of contexts) await context.close();
    for (const callback of cleanup.reverse()) await callback();
  }
}

async function open(browser, server, id, contexts, legacy = false) {
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  contexts.push(context);
  await context.addInitScript(id => sessionStorage.setItem("boulderingTimerClientId", id), id);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(server.baseUrl + (legacy ? `/legacy.html?clientId=${id}` : "/?perf=3"), {waitUntil:"domcontentloaded"});
  if (!legacy) await page.waitForFunction(()=>!clockCalibrationPending);
  else await expect(page.locator("#time")).not.toHaveText("--:--");
  return {page,errors};
}

async function pair(page, backup) {
  await page.locator("#secondaryServerButton").click();
  await page.locator("#secondaryServerAddress").fill(backup.baseUrl);
  await page.locator("#secondaryServerConnect").click();
  await expect(page.locator("#secondaryServerButton")).toHaveClass(/is-set/, {timeout:10000});
  await page.locator("#secondaryServerClose").click();
}

test("SEC pairs without disturbing audio, moves one screen, merges diagnostics and switches all including Legacy", async ({browser}) => {
  await withServers(async ({primary,backup,contexts}) => {
    const operator = await open(browser,primary,"operator",contexts);
    const viewer = await open(browser,primary,"screen",contexts);
    const legacy = await open(browser,primary,"old-tv",contexts,true);
    const page = operator.page;
    await page.evaluate(async () => {
      await unlockAudio(false); await loadAudioBuffers();
      scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()),serverNow()+30000,"minute",false,true);
      window.secAudioBefore={nodes:scheduledAudioNodes.slice(),generation:audioScheduleGeneration,context:audioContext};
    });
    await pair(page,backup);
    expect(await page.evaluate(()=>({nodes:window.secAudioBefore.nodes.every(node=>scheduledAudioNodes.includes(node)),
      generation:audioScheduleGeneration-window.secAudioBefore.generation}))).toEqual({nodes:true,generation:0});
    const badge = page.locator('[data-secondary-client="screen"]');
    await expect(badge).toHaveClass(/inactive/);
    await page.locator("#secondaryServerButton").click();
    await page.screenshot({path:path.resolve(__dirname,"../../help-assets/secondary-server.png")});
    await page.locator("#secondaryServerClose").click();
    await badge.click();
    await viewer.page.waitForFunction(()=>secondaryConnection.info().onSecondary);
    await expect(badge).not.toHaveClass(/inactive|neutral/);
    expect(viewer.page.url()).toContain(primary.baseUrl);
    const position = await page.evaluate(()=>elapsedSeconds());
    await page.locator('[data-secondary-client="operator"]').click();
    await page.waitForFunction(url=>secondaryConnection.info().active === url && !clockCalibrationPending,backup.baseUrl);
    await legacy.page.waitForFunction(()=>document.getElementById("time").textContent!=="--:--");
    await expect.poll(async () => {
      const data=await (await fetch(backup.baseUrl+"/api/state?diagnostics=1")).json();
      return data.sec.epoch === 1 && data.sec.role === "primary"
        ? data.clients.filter(client=>["operator","screen","old-tv"].includes(client.id)&&!client.onSecondary&&client.connected).length : 0;
    }).toBe(3);
    expect(await page.evaluate(()=>audioContext===window.secAudioBefore.context)).toBe(true);
    expect(await page.evaluate(()=>elapsedSeconds())).toBeGreaterThanOrEqual(position);
    await page.locator("#pauseBtn").click();
    await expect.poll(async ()=>(await backup.state()).running).toBe(false);
    await page.waitForFunction(()=>secondaryConnection.info().config.epoch === 1);
    await page.locator('[data-secondary-client="screen"]').click();
    await viewer.page.waitForFunction(()=>secondaryConnection.info().onSecondary && !clockCalibrationPending);
    expect(await viewer.page.evaluate(()=>secondaryConnection.info().active)).toBe(primary.baseUrl);
    await expect(badge).not.toHaveClass(/inactive|neutral/);
    // Transfer the whole group a second time to the already-known old process.
    await page.locator('[data-secondary-client="operator"]').click();
    await page.waitForFunction(url=>secondaryConnection.info().active === url && !clockCalibrationPending,primary.baseUrl);
    await expect.poll(async()=>{try { const s=await backup.state();return s.sec.epoch === 2 && s.sec.role === "secondary" && s.sec.ready;} catch(_){return false;}}).toBe(true);
    expect((await primary.state()).running).toBe(false);
    expect(await page.evaluate(()=>audioContext === window.secAudioBefore.context)).toBe(true);
    expect(operator.errors).toEqual([]);
    expect(viewer.errors).toEqual([]);
    expect(legacy.errors).toEqual([]);
  });
});

test("SEC automatically takes over after 20 seconds, preserves the run and does not fail back on primary restart", async ({browser}) => {
  await withServers(async ({primary,backup,contexts}) => {
    const {page,errors} = await open(browser,primary,"operator",contexts);
    await pair(page,backup);
    const before=await page.evaluate(()=>({elapsed:elapsedSeconds(),at:performance.now(),clientId}));
    await primary.stop();
    await page.waitForFunction(()=>secondaryConnection.info().onSecondary && !clockCalibrationPending,null,{timeout:30000});
    const after=await page.evaluate(()=>({elapsed:elapsedSeconds(),at:performance.now(),clientId}));
    expect(after.at-before.at).toBeGreaterThanOrEqual(19000);
    expect(after.clientId).toBe(before.clientId);
    expect(Math.abs(after.elapsed-before.elapsed-(after.at-before.at)/1000)).toBeLessThan(0.25);
    await expect.poll(async ()=>(await backup.state()).sec.switchAll,{timeout:6000}).toBe(true);
    await page.locator("#pauseBtn").click();
    await expect.poll(async ()=>(await backup.state()).running).toBe(false);
    const paused=(await backup.state()).elapsed;
    await primary.restart();
    await expect.poll(async ()=>{try {const s=await primary.state();return s.sec.epoch === 1 && s.sec.role === "secondary" && s.sec.ready;}catch(_){return false;}},{timeout:6000}).toBe(true);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(()=>secondaryConnection.info().active)).toBe(backup.baseUrl);
    expect(await page.evaluate(()=>secondaryConnection.info().config.secondaryUrl)).toBe(primary.baseUrl);
    expect((await backup.state()).elapsed).toBe(paused);
    expect(errors).toEqual([]);
  });
});
