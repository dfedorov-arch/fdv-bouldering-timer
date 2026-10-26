"use strict";

const {test,expect}=require("@playwright/test");
const {fixture}=require("../helpers/controlled-clock-server");

async function stoppedFinal(server,format="old") {
  await server.action({type:"settings",activePreset:"classic",settings:{rotationMinutes:2,breakSeconds:0,oneShot:false}});
  await server.action({type:"settings",activePreset:"final",settings:{rotationMinutes:2,breakSeconds:0,oneShot:true,finalRoundFormat:format,finalRestRotations:5}});
  await server.start({activePreset:"final",settings:{rotationSeconds:120,breakSeconds:0,oneShot:true,finalRoundFormat:format,finalRestRotations:5}});
  await server.action({type:"reset",activePreset:"final",settings:{rotationSeconds:120,breakSeconds:0,oneShot:true,finalRoundFormat:format,finalRestRotations:5}});
}

async function withPages(browser,run) {
  const cleanups=[],contexts=[],pages=[],errors=[];
  try {
    const server=await fixture({after:fn=>cleanups.push(fn)},"darwin",{liveClocks:true});
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await stoppedFinal(server);
    for(const id of ["clock-test","format-viewer"]) {
      const context=await browser.newContext();contexts.push(context);
      await context.addInitScript(id=>sessionStorage.setItem("boulderingTimerClientId",id),id);
      const page=await context.newPage();pages.push(page);
      page.on("pageerror",error=>errors.push(error.message));
      await page.goto(server.baseUrl,{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>!clockCalibrationPending&&state.startListFinalCycle>0&&!state.running);
    }
    await run(server,pages);
    expect(errors).toEqual([]);
  } finally {
    for(const context of contexts)await context.close();
    for(const fn of cleanups.reverse())await fn();
  }
}

async function dialogClick(page,selector,accept,language="ru") {
  const messages=[];
  page.once("dialog",async dialog=>{
    messages.push(dialog.message());
    if(accept)await dialog.accept();else await dialog.dismiss();
  });
  await page.locator(selector).click();
  expect(messages).toEqual([language==="ru"?'Вы уверены, что хотите завершить "Финал"?':'Are you sure you want to end "Final"?']);
}

test("both Final round changes ask, cancel without side effects, and restart all screens from rotation one",async({browser})=>{
  await withPages(browser,async(server,[page,viewer])=>{
    for(const [from,to] of [["old","new"],["new","old"]]) {
      await stoppedFinal(server,from);
      await page.waitForFunction(from=>state.activeSettings.finalRoundFormat===from&&state.startListFinalCycle>0&&!state.running,from);
      const target=to==="new"?"#finalNewOption":"#finalOldOption";
      await expect(page.locator('input[name="finalRoundFormat"][value="'+to+'"]')).toBeEnabled();
      const before=await server.state();
      await dialogClick(page,target,false);
      await expect(page.locator('input[name="finalRoundFormat"][value="'+from+'"]')).toBeChecked();
      const cancelled=await server.state();
      expect(cancelled.version).toBe(before.version);
      expect(cancelled.startListFinalCycle).toBe(before.startListFinalCycle);
      expect(cancelled.activeSettings.finalRoundFormat).toBe(from);
      await dialogClick(page,target,true);
      await page.waitForFunction(to=>!presetChangeInFlight&&state.activeSettings.finalRoundFormat===to&&state.startListFinalCycle===0,to);
      await viewer.waitForFunction(to=>state.activeSettings.finalRoundFormat===to&&state.startListFinalCycle===0,to);
      const changed=await server.state();
      expect(changed.activeSettings.rotationSeconds).toBe(120);
      expect(changed.activeSettings.finalRestRotations).toBe(5);
      expect(changed.running).toBe(false);
      expect(changed.runtimePreset).toBe("final");
      await expect(page.locator("#cycleMeta")).toHaveText(/1/);
    }
  });
});

test("Classic and Festival share Final confirmation, including English cancellation",async({browser})=>{
  await withPages(browser,async(server,[page])=>{
    for(const mode of ["classic","festival"]) {
      await stoppedFinal(server,"new");
      await page.waitForFunction(()=>state.activePreset==="final"&&state.startListFinalCycle>0);
      await server.action({type:"language",language:"en"});
      await expect(page.locator("html")).toHaveAttribute("lang","en");
      const before=await server.state();
      await dialogClick(page,'[data-preset="'+mode+'"]',false,"en");
      expect((await server.state()).version).toBe(before.version);
      await dialogClick(page,'[data-preset="'+mode+'"]',true,"en");
      await page.waitForFunction(mode=>!presetChangeInFlight&&state.activePreset===mode&&state.runtimePreset===mode&&state.startListFinalCycle===0,mode);
    }
  });
});

test("running, paused and completed Finals still require Stop; viewer cannot change formats",async({browser})=>{
  await withPages(browser,async(server,[page,viewer])=>{
    await expect(viewer.locator('input[name="finalRoundFormat"][value="new"]')).toBeDisabled();
    const before=await server.state();
    await viewer.evaluate(()=>setPreset("final",{finalRoundFormat:"new"}));
    await page.locator('[data-preset="final"]').click();
    expect((await server.state()).version).toBe(before.version);
    await server.start({activePreset:"final",settings:{rotationSeconds:120,breakSeconds:0,oneShot:true,finalRoundFormat:"old"}});
    await page.waitForFunction(()=>state.running&&elapsedSeconds()>0.1);
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeDisabled();
    await server.action({type:"pause"});
    await page.waitForFunction(()=>!state.running&&state.elapsedBeforePause>0);
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeDisabled();
    await stoppedFinal(server);
    await page.waitForFunction(()=>!state.running&&state.elapsedBeforePause===0);
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeEnabled();
    await server.start({activePreset:"final",settings:{rotationSeconds:1,breakSeconds:0,oneShot:true,finalRoundFormat:"old"}});
    await page.waitForFunction(()=>state.completed);
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeDisabled();
    await server.action({type:"reset",activePreset:"final",settings:{rotationSeconds:120,breakSeconds:0,oneShot:true,finalRoundFormat:"old"}});
    await page.waitForFunction(()=>!state.completed&&!state.running&&state.elapsedBeforePause===0);
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeEnabled();
  });
});

for(const android of [false,true]) test(`standalone ${android?"Android":"single-file"} Final uses the same confirmation and persists the new round`,async({browser})=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-final-format-"));
  const file=path.join(directory,"timer.html"),root=path.resolve(__dirname,"../..");
  const built=require("node:child_process").spawnSync(process.execPath,[path.join(root,"scripts/build-standalone-html.js"),file,...(android?["--android"]:[])],{cwd:root,encoding:"utf8"});
  expect(built.status,built.stderr).toBe(0);
  const context=await browser.newContext({offline:true});
  try {
    const page=await context.newPage(),errors=[],requests=[];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("request",request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
    await page.goto(require("node:url").pathToFileURL(file).href,{waitUntil:"domcontentloaded"});
    await page.evaluate(()=>setPreset("final"));
    await page.keyboard.press("z");
    await page.waitForFunction(()=>state.running);
    await page.keyboard.press("p");
    await page.waitForFunction(()=>!state.running&&state.startListFinalCycle>0);
    await dialogClick(page,"#finalNewOption",false);
    await expect(page.locator('input[name="finalRoundFormat"][value="old"]')).toBeChecked();
    const before=await page.evaluate(()=>state.startListFinalCycle);
    expect(before).toBeGreaterThan(0);
    await dialogClick(page,"#finalNewOption",true);
    await page.waitForFunction(()=>!presetChangeInFlight&&state.activeSettings.finalRoundFormat==="new"&&state.startListFinalCycle===0);
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeChecked();
    expect(await page.evaluate(()=>state.startListFinalCycle)).toBe(0);
    expect(requests).toEqual([]);expect(errors).toEqual([]);
  } finally {await context.close();fs.rmSync(directory,{recursive:true,force:true});}
});
