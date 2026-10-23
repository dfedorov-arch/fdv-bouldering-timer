"use strict";
const {test,expect} = require("@playwright/test");
const path = require("node:path");
const {fixture} = require("../helpers/controlled-clock-server");

async function runFixture(run) {
  const cleanups=[];
  try { await run(await fixture({after:fn=>cleanups.push(fn)},"darwin",{liveClocks:true})); }
  finally { for (const fn of cleanups.reverse()) await fn(); }
}
async function open(browser,server,id,viewport={width:1280,height:900},legacy=false,options={}) {
  const context=await browser.newContext({viewport,...options});
  await context.addInitScript(id=>sessionStorage.setItem("boulderingTimerClientId",id),id);
  const page=await context.newPage(), errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(server.baseUrl+(legacy?`/legacy.html?clientId=${id}`:"/"),{waitUntil:"domcontentloaded"});
  if (!legacy) await page.waitForFunction(()=>!clockCalibrationPending);
  return {page,context,errors};
}

test("CTRL exposes only four controls, supports hotkeys and revocation, and remains unavailable in Legacy",async({browser})=>{
  await runFixture(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    const primary=await open(browser,server,"clock-test");
    const remote=await open(browser,server,"remote",{width:393,height:852});
    const legacy=await open(browser,server,"old-tv",undefined,true);
    try {
      const page=remote.page;
      await expect(primary.page.locator('[data-control-client="remote"]')).toHaveClass(/inactive/);
      await expect(page.locator(".compact-actions")).toBeHidden();
      await page.keyboard.press("z");
      expect((await server.state()).running).toBe(false);
      await primary.page.locator('[data-control-client="remote"]').click();
      await expect(page.locator("body")).toHaveClass(/limited-control/);
      await expect(page.locator(".controls")).toBeHidden();
      await expect(page.locator(".compact-actions button:visible")).toHaveCount(4);
      await expect(page.locator("#compactStart")).toBeEnabled();
      await expect(page.locator("#climbMinutes")).toBeDisabled();
      await expect(primary.page.locator('[data-control-client="remote"]')).toHaveClass(/good/);
      expect(await primary.page.locator('.browser-item').filter({has:primary.page.locator('[data-legacy-mode-client="old-tv"]')}).locator('.diag-chip').allTextContents()).toContain("CTRL");
      const legacyChip=primary.page.locator('.browser-item').filter({has:primary.page.locator('[data-legacy-mode-client="old-tv"]')}).locator('.diag-chip').filter({hasText:/^CTRL$/});
      await expect(legacyChip).toHaveClass(/neutral/);
      await page.screenshot({path:path.resolve(__dirname,"../../help-assets/limited-control.png")});
      await server.action({type:"language",language:"en"});
      await expect(page.locator("html")).toHaveAttribute("lang","en");
      await page.screenshot({path:path.resolve(__dirname,"../../help-assets/limited-control-en.png")});
      await server.action({type:"language",language:"ru"});
      await expect(page.locator("html")).toHaveAttribute("lang","ru");
      await page.keyboard.press("z");
      await expect.poll(async()=> (await server.state()).running).toBe(true);
      await page.waitForFunction(()=>state.running && elapsedSeconds()>0.1);
      await expect(page.locator("#compactPause")).toBeEnabled();
      await page.keyboard.press("Control+q");
      await expect.poll(async()=> (await server.state()).running).toBe(false);
      await page.locator("#compactStart").click();
      await expect.poll(async()=> (await server.state()).running).toBe(true);
      await page.keyboard.press("p");
      await expect.poll(async()=> (await server.state()).running).toBe(false);
      expect((await server.state()).elapsedBeforePause).toBe(0);
      await page.keyboard.press("Control+f");
      await expect(page.locator("body")).toHaveClass(/fullscreen/);
      await expect(page.locator(".compact-actions")).toBeHidden();
      await page.keyboard.press("Control+f");
      await expect(page.locator(".compact-actions")).toBeVisible();
      await page.route("**/api/action",async route=>{
        if (route.request().postDataJSON().type==="start") await server.action({type:"clientControl",targetClientId:"remote",enabled:false});
        await route.continue();
      });
      const denied=page.waitForResponse(response=>response.url().endsWith("/api/action")&&response.status()===403);
      await page.keyboard.press("z");
      await denied;
      await expect(page.locator("body")).not.toHaveClass(/limited-control/);
      await expect(page.locator(".compact-actions")).toBeHidden();
      expect(await page.evaluate(()=>state.running)).toBe(false,"revocation during a command must not start a local timer");
      await page.keyboard.press("z");
      expect((await server.state()).running).toBe(false);
      expect((await server.state()).primaryClientId).toBe("clock-test");
      expect([...primary.errors,...remote.errors,...legacy.errors]).toEqual([]);
    } finally {await primary.context.close();await remote.context.close();await legacy.context.close();}
  });
});

test("break mute is shared and retains the timer anchor and next-start target in real Web Audio",async({browser})=>{
  await runFixture(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:68});
    const {page,context,errors}=await open(browser,server,"clock-test");
    try {
      await page.evaluate(async()=>{await unlockAudio(false);await loadAudioBuffers();});
      await expect.poll(()=>page.evaluate(()=>scheduledAudioNodes.some(n=>n.kind==="warn"))).toBe(true);
      const before=await server.state();
      await page.locator("#muteBreakWarningsToggle").uncheck();
      await page.waitForFunction(()=>state.muteBreakWarnings);
      expect((await server.state()).timerClock.startedAt).toBe(before.timerClock.startedAt);
      const plan=await page.evaluate(()=>({anchor:state.serverStartedAt,
        warnings:scheduledAudioNodes.filter(n=>n.kind==="warn"&&!n.started&&n.start>audioContext.currentTime).length,
        startTarget:serverTimeForElapsed(75)}));
      expect(plan.warnings).toBe(0);
      expect(plan.startTarget).toBe(before.timerClock.startedAt+75000);
      await page.locator("#muteBreakWarningsToggle").check();
      await page.waitForFunction(()=>!state.muteBreakWarnings);
      await expect.poll(()=>page.evaluate(()=>scheduledAudioNodes.some(n=>n.kind==="warn"))).toBe(true);
      await page.screenshot({path:path.resolve(__dirname,"../../help-assets/break-warning-option.png")});
      await server.action({type:"language",language:"en"});
      await expect(page.locator("html")).toHaveAttribute("lang","en");
      await page.screenshot({path:path.resolve(__dirname,"../../help-assets/break-warning-option-en.png")});
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

for (const oneShot of [false,true]) test(`scheduled ${oneShot?"Final":"Classic"} start in a hidden tab plays one minute warning and keeps its calibrated anchor`,async({browser})=>{
  await runFixture(async server=>{
    server.frame(-7000);
    const future=new Date((await server.state()).now+67000);
    await server.start({activePreset:oneShot?"final":"classic",settings:{rotationSeconds:120,breakSeconds:oneShot?0:15,oneShot},
      startMode:"scheduled",startHours:future.getHours(),startMinutes:future.getMinutes()});
    const {page,context,errors}=await open(browser,server,"clock-test");
    try {
      await page.evaluate(async()=>{
        await unlockAudio(false);await loadAudioBuffers();
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});
        document.dispatchEvent(new Event("visibilitychange"));
        rescheduleStandaloneSignals();
      });
      const initialStart=await server.state();
      const anchor=initialStart.timerClock.startedAt;
      await expect.poll(()=>page.evaluate(()=>Array.from(scheduledSignalKeys).some(k=>k.startsWith("pendingStart:minute:")))).toBe(true);
      await expect.poll(()=>page.evaluate(()=>Array.from(playedSignalKeys).filter(k=>k.startsWith("pendingStart:minute:")).length),{timeout:10000}).toBe(1);
      await page.evaluate(async()=>{await syncFromServer({forceApply:true,skipBurst:true});rescheduleStandaloneSignals();});
      expect(await page.evaluate(()=>Array.from(playedSignalKeys).filter(k=>k.startsWith("pendingStart:minute:")).length)).toBe(1);
      const after=await server.state();
      expect(after.startedAt).toBe(initialStart.startedAt);
      // A pending calendar start is projected into the process clock on contact;
      // independently sampled wall/monotonic reads can differ by microseconds.
      expect(Math.abs(after.timerClock.startedAt-anchor)).toBeLessThan(1);
      expect(await page.evaluate(()=>state.countdownOnly)).toBe(oneShot);
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

for (const android of [false,true]) test(`standalone ${android?"Android HTML":"single HTML"} preserves break mute across reload without network`,async({browser})=>{
  const fs=require("node:fs"),os=require("node:os");
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-break-option-"));
  const file=path.join(directory,"timer.html"),root=path.resolve(__dirname,"../..");
  const built=require("node:child_process").spawnSync(process.execPath,[path.join(root,"scripts/build-standalone-html.js"),file,...(android?["--android"]:[])],{cwd:root,encoding:"utf8"});
  expect(built.status,built.stderr).toBe(0);
  const context=await browser.newContext({offline:true,viewport:{width:393,height:852}});
  try {
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(require("node:url").pathToFileURL(file).href,{waitUntil:"domcontentloaded"});
    await expect(page.locator("#muteBreakWarningsToggle")).toBeChecked();
    await expect(page.locator("#speakerKeepAwakeToggle")).toBeChecked();
    await page.locator("#speakerKeepAwakeToggle").uncheck();
    await page.locator("#muteBreakWarningsToggle").uncheck();
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(page.locator("#muteBreakWarningsToggle")).not.toBeChecked();
    expect(await page.evaluate(()=>state.muteBreakWarnings)).toBe(true);
    await expect(page.locator("#speakerKeepAwakeToggle")).not.toBeChecked();
    expect(errors).toEqual([]);
  } finally {await context.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test("limited controls retain read-only lists and fit portrait, desktop and old-TV viewports",async({browser})=>{
  await runFixture(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.action({type:"startLists",startLists:[{headers:["#","ФИО"],rows:Array.from({length:30},(_,i)=>[String(i+1),"Участник соревнований "+(i+1)]),routeCount:4}]});
    await server.action({type:"startListEnabled",enabled:true});
    const {page,context,errors}=await open(browser,server,"remote");
    try {
      await server.action({type:"clientControl",targetClientId:"remote",enabled:true});
      await server.action({type:"startListDisplay",targetClientId:"remote",listIndex:0,enabled:true});
      await expect(page.locator(".start-list-table")).toBeVisible();
      for (const size of [{width:393,height:852},{width:1280,height:900},{width:962,height:541}]) {
        await page.setViewportSize(size);
        await expect.poll(()=>page.evaluate(()=>{
          const controls=document.querySelector(".compact-actions").getBoundingClientRect();
          const timer=document.querySelector(".timer-column").getBoundingClientRect();
          const list=document.querySelector(".start-list-panel").getBoundingClientRect();
          return controls.bottom<=innerHeight+1 && controls.top>=timer.bottom-1 && controls.top>=list.bottom-1
            && (innerWidth>560 || list.top>=timer.bottom-1);
        })).toBe(true);
        await expect(page.locator(".start-list-panel-controls")).toBeHidden();
        await expect(page.locator(".progress")).toBeHidden();
        await expect(page.locator("#compactStart")).toBeVisible();
      }
      await server.action({type:"startListDisplay",targetClientId:"remote",listIndex:0,enabled:false});
      await expect(page.locator(".start-list-panel")).toBeHidden();
      await expect(page.locator("#compactStart")).toBeVisible();
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

test("speaker keep-awake uses a separate quiet node and yields to work without resetting its schedule",async({browser})=>{
 await runFixture(async server=>{
  await server.action({type:"primary",primaryClientId:"clock-test"});
  const {page,context,errors}=await open(browser,server,"clock-test");
  try{
   await page.evaluate(async()=>{revealControlsIfAllowed();await unlockAudio(false);await loadAudioBuffers();});
   await expect(page.locator("#speakerKeepAwakeToggle")).toBeChecked();
   await expect(page.locator("#instancesSoundLabel")).toHaveText(", в других");
   await expect(page.locator("#instancesSoundLabel")).toHaveAttribute("title","Звук в других браузерах");
   await expect(page.locator("#speakerKeepAwakeRow")).toHaveAttribute("title",/BT-колонке.*params.txt/);
   const result=await page.evaluate(()=>{
    const anchor=state.serverStartedAt,generation=audioScheduleGeneration;
    speakerKeepAwakePlanner.tick(serverNow(),false);
    speakerKeepAwakePlanner.tick(serverNow()-181000,true);
    tickSpeakerKeepAwake();const quiet=speakerKeepAwakeNode;
    playBuffer("start",1,true,"audit:work");
    return {hadQuiet:Boolean(quiet),quietStopped:speakerKeepAwakeNode===null,
     sameClock:anchor===state.serverStartedAt,sameGeneration:generation===audioScheduleGeneration,
     work:scheduledAudioNodes.some(n=>n.signalKey==="audit:work")};
   });
   expect(result).toEqual({hadQuiet:true,quietStopped:true,sameClock:true,sameGeneration:true,work:true});
   await page.locator("#speakerKeepAwakeToggle").uncheck();
   await page.waitForFunction(()=>state.speakerKeepAwake===false);
   await page.reload({waitUntil:"domcontentloaded"});
   await expect(page.locator("#speakerKeepAwakeToggle")).not.toBeChecked();
   await page.waitForFunction(()=>!clockCalibrationPending && isPrimaryClient);
   await page.evaluate(()=>revealControlsIfAllowed());
   await page.locator("#speakerKeepAwakeToggle").click();
   await page.waitForFunction(()=>state.speakerKeepAwake===true);
   await expect(page.locator("#speakerKeepAwakeToggle")).toBeChecked();
   for(const language of ["ru","en"]){
    await server.action({type:"language",language});
    await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
    await page.locator(".section-options").screenshot({path:path.resolve(__dirname,`../../help-assets/speaker-keep-awake-${language}.png`)});
   }
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
});

test("sound row aligns without a primary and uses one-line compact labels with a primary",async({browser})=>{
 await runFixture(async server=>{
  const {page,context,errors}=await open(browser,server,"clock-test");
  try{
   await page.evaluate(()=>revealControlsIfAllowed());
   const setPanelWidth=async width=>page.locator(".section-options").evaluate((el,w)=>{
    el.style.width=w+"px";
    const css=getComputedStyle(el.closest(".controls"));
    document.querySelector(".app").style.gridTemplateColumns=(w+parseFloat(css.paddingLeft)+parseFloat(css.paddingRight)+1)+"px minmax(0,1fr)";
   },width);
   for(const lang of ["ru","en"]){
    await server.action({type:"language",language:lang});
    await expect(page.locator("html")).toHaveAttribute("lang",lang);
    for(const width of [240,280,300,340,400]){
     await setPanelWidth(width);
     const gap=await page.evaluate(()=>{
      const a=document.getElementById("soundToggle").getBoundingClientRect(),b=document.getElementById("primaryToggle").getBoundingClientRect();
      return {a:a.x+a.width/2,b:b.x+b.width/2};
     });
     expect(Math.abs(gap.a-gap.b)).toBeLessThan(.5);
    }
   }
   await server.action({type:"primary",primaryClientId:"clock-test"});
   await page.waitForFunction(()=>isPrimaryClient);
   for(const lang of ["ru","en"]){
    await server.action({type:"language",language:lang});
    const full=lang==="ru"?"Звук в основном браузере":"Sound in primary browser";
    await expect(page.locator(".main-sound-option")).toHaveAttribute("title",full);
    for(const width of [240,280,300,340,400]){
     await setPanelWidth(width);
     const geometry=await page.evaluate(()=>{
      const label=document.getElementById("soundLabel"),input=document.getElementById("soundToggle"),row=document.querySelector(".sound-options-row");
      const a=label.getBoundingClientRect(),b=input.getBoundingClientRect(),c=row.getBoundingClientRect(),other=document.getElementById("instancesSoundToggle").getBoundingClientRect();
      return {gap:b.left-a.right,labelHeight:a.height,line:parseFloat(getComputedStyle(label).lineHeight),bottom:b.bottom,right:other.right,rowRight:c.right,
       full:getComputedStyle(label.querySelector(".sound-primary-full")).display!=="none"};
     });
     expect(geometry.gap).toBeGreaterThanOrEqual(9.5);
     expect(geometry.full).toBe(width>=300);
     expect(geometry.labelHeight).toBeLessThan(24);
     expect(geometry.right).toBeLessThanOrEqual(geometry.rowRight+.5);
     if(lang==="ru")await page.locator(".section-options").screenshot({path:path.resolve(__dirname,`../../help-assets/sound-row-${width}.png`)});
    }
   }
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
});

test("full sound caption appears in the natural wide desktop panel and compacts at medium/narrow breakpoints",async({browser})=>{
 await runFixture(async server=>{
  await server.action({type:"primary",primaryClientId:"clock-test"});
  const {page,context,errors}=await open(browser,server,"clock-test");
  try{
   await page.evaluate(()=>revealControlsIfAllowed());
   for(const lang of ["ru","en"]){
    await server.action({type:"language",language:lang});
    await expect(page.locator("html")).toHaveAttribute("lang",lang);
    for(const [width,height,full]of [[1920,1080,true],[1600,900,true],[1280,900,false],[1024,900,false],[1920,800,false],[1920,680,false]]){
     await page.setViewportSize({width,height});
     const geometry=await page.evaluate(()=>{
      const a=document.querySelector(".sound-primary-full"),b=document.querySelector(".sound-primary-short"),label=document.getElementById("soundLabel").getBoundingClientRect(),own=document.getElementById("soundToggle").getBoundingClientRect(),other=document.getElementById("instancesSoundToggle").getBoundingClientRect(),row=document.querySelector(".sound-options-row").getBoundingClientRect();
      return {full:getComputedStyle(a).display!=="none",short:getComputedStyle(b).display!=="none",gap:own.left-label.right,labelHeight:label.height,right:other.right,rowRight:row.right,rowWidth:row.width};
     });
     expect(geometry.full,JSON.stringify({width,height,lang,geometry})).toBe(full);
     expect(geometry.short).toBe(!full);
     expect(geometry.gap).toBeGreaterThanOrEqual(9.5);
     expect(geometry.labelHeight).toBeLessThan(24);
     expect(geometry.right).toBeLessThanOrEqual(geometry.rowRight+.5);
     if(width===1920 && height===1080)await page.locator(".section-options").screenshot({path:path.resolve(__dirname,`../../help-assets/sound-row-wide-${lang}.png`)});
    }
   }
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
});

test("positive break-sound checkbox defaults on and aligns with the other checkbox columns in both languages",async({browser})=>{
  await runFixture(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    const {page,context,errors}=await open(browser,server,"clock-test");
    try {
      await expect(page.locator("#muteBreakWarningsToggle")).toBeChecked();
      for (const language of ["ru","en"]) {
        await server.action({type:"language",language});
        await expect(page.locator("#muteBreakWarningsLabel")).toHaveText(language==="ru"?"Звук в перерыве":"Break sound");
        for (const width of [320,393,1024,1280]) {
          await page.setViewportSize({width,height:900});
          const columns=await page.evaluate(()=>["instancesSoundToggle","flashToggle","muteBreakWarningsToggle","speakerKeepAwakeToggle","instancesFullscreenToggle"].map(id=>{
            const r=document.getElementById(id).getBoundingClientRect();
            return {center:r.left+r.width/2,width:r.width};
          }));
          expect(Math.abs(columns[0].center-columns[2].center),JSON.stringify({width,language,columns})).toBeLessThan(0.5);
          expect(columns[1].width).toBe(columns[0].width);
          expect(columns[2].width).toBe(columns[0].width);
          expect(Math.abs(columns[3].center-columns[0].center)).toBeLessThan(.5);
          expect(Math.abs(columns[4].center-columns[0].center)).toBeLessThan(.5);
        }
      }
      await page.locator("#muteBreakWarningsToggle").uncheck();
      await page.waitForFunction(()=>state.muteBreakWarnings);
      expect((await server.state()).muteBreakWarnings).toBe(true);
      await page.reload({waitUntil:"domcontentloaded"});
      await expect(page.locator("#muteBreakWarningsToggle")).not.toBeChecked();
      await page.waitForFunction(()=>!clockCalibrationPending && isPrimaryClient);
      await page.locator("#muteBreakWarningsToggle").click();
      await page.waitForFunction(()=>!state.muteBreakWarnings);
      await expect(page.locator("#muteBreakWarningsToggle")).toBeChecked();
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

for (const withLists of [false,true]) test(`limited controls fit folding-phone visible viewport with browser bars ${withLists?"and lists":"without lists"}`,async({browser})=>{
  await runFixture(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    if (withLists) {
      await server.action({type:"startLists",startLists:[{headers:["#","ФИО"],rows:Array.from({length:30},(_,i)=>[String(i+1),"Участник "+(i+1)]),routeCount:4}]});
      await server.action({type:"startListEnabled",enabled:true});
    }
    const {page,context,errors}=await open(browser,server,"remote",{width:816,height:530},false,{isMobile:true,hasTouch:true,deviceScaleFactor:2});
    try {
      await server.action({type:"clientControl",targetClientId:"remote",enabled:true});
      if (withLists) await server.action({type:"startListDisplay",targetClientId:"remote",listIndex:0,enabled:true});
      await expect(page.locator(".compact-actions")).toBeVisible();
      // Model the mobile large viewport extending behind 120px of browser bars,
      // while dvh follows the visible viewport. Reserve a 24px gesture inset.
      await page.evaluate(()=>{
        const stylesheet=document.querySelector("style");
        stylesheet.textContent=stylesheet.textContent.replaceAll("100vh","calc(100dvh + 120px)")
          .replaceAll("env(safe-area-inset-bottom)","24px");
      });
      for (const size of [{width:816,height:530},{width:924,height:636},{width:720,height:850},
        {width:344,height:670},{width:360,height:720},{width:816,height:650},{width:816,height:530}]) {
        await page.setViewportSize(size);
        await expect.poll(()=>page.evaluate(()=>{
          const height=visualViewport?.height||innerHeight;
          const app=document.querySelector(".app").getBoundingClientRect();
          const time=document.querySelector("#time").getBoundingClientRect();
          const actions=document.querySelector(".compact-actions").getBoundingClientRect();
          const buttons=[...document.querySelectorAll(".compact-actions button")].map(b=>b.getBoundingClientRect());
          return Math.abs(app.top)<1 && app.height<=height+1 && buttons.every(b=>b.top>=0&&b.bottom<=height-24+1&&b.height>=40)
            && time.left>=-1 && time.right<=innerWidth+1 && time.bottom<=actions.top+1
            && document.documentElement.scrollHeight<=height+1;
        })).toBe(true);
        const time=await page.locator("#time").boundingBox();
        const buttons=await page.locator(".compact-actions").boundingBox();
        expect(time.y+time.height).toBeLessThanOrEqual(buttons.y+1);
        if (!withLists && size.width===924) await page.screenshot({path:path.resolve(__dirname,"../../help-assets/limited-control-fold.png")});
        if (!withLists && size.width===344) await page.screenshot({path:path.resolve(__dirname,"../../help-assets/limited-control-cover.png")});
      }
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});
