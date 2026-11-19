"use strict";
const {test,expect}=require("@playwright/test");
const {fixture}=require("../helpers/controlled-clock-server");
const settings={rotationSeconds:240,breakSeconds:0,oneShot:true,finalRoundFormat:"new"};
const list=()=>({headers:["#","Athlete"],rows:Array.from({length:8},(_,i)=>[String(i+1),"Athlete "+(i+1)]),routeCount:4});
const entry=(pi,route,timeSeconds,startSignal=false)=>({listIndex:0,participantIndex:pi,route,timeSeconds,startSignal});
const plan=(id,entries,afterCycle=0)=>({id,afterCycle,entries,completed:false});
async function withPages(browser,run,{legacy=false}={}){
 const cleanup=[],contexts=[],pages=[],errors=[];
 try{
  const server=await fixture({after:fn=>cleanup.push(fn)},"darwin",{liveClocks:true,requestTimeoutMs:3000});
  await server.action({type:"primary",primaryClientId:"clock-test"});
  await server.action({type:"settings",activePreset:"final",settings:{rotationMinutes:4,breakSeconds:0,oneShot:true,finalRoundFormat:"new"}});
  await server.action({type:"startLists",startLists:[list()]});await server.action({type:"startListEnabled",enabled:true});
  for(const id of legacy?["clock-test","ar-legacy"]:["clock-test","ar-viewer"]){
   const ctx=await browser.newContext();contexts.push(ctx);
   await ctx.addInitScript(c=>{sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);},await server.credentials(id));
   const page=await ctx.newPage();pages.push(page);page.on("pageerror",e=>errors.push(e.message));
   await page.goto(server.baseUrl+(id==="ar-legacy"?"/legacy.html?clientId=ar-legacy":"/?perf=2"),{waitUntil:"domcontentloaded"});
   if(id==="ar-legacy")await expect(pages[0].locator('[data-legacy-mode-client="ar-legacy"]')).toBeAttached();
   else await page.waitForFunction(()=>!clockCalibrationPending&&eventSourceConnected&&!syncRequestInFlight);
   await server.action({type:"startListDisplay",targetClientId:id,listIndex:0,enabled:true});
   await expect(page.locator(".start-list-table, .protocol-table")).toBeVisible();
   if(id!=="ar-legacy"){
    await page.mouse.click(8,8);
    // Both contexts use loopback. Simulate separate audible devices through
    // the existing diagnostic mode instead of disabling same-computer protection.
    await page.evaluate(async()=>{await unlockAudio(false);await loadAudioBuffers();window.arProbe=[];const original=markSignalPlayed;markSignalPlayed=function(key){const accepted=original(key);if(accepted)window.arProbe.push({key,at:serverNow()});return accepted;};});
    expect(await page.evaluate(()=>canPlaySound())).toBe(true);
   }
  }
  await run(server,pages);expect(errors).toEqual([]);
 }finally{for(const c of contexts)await c.close();for(const fn of cleanup.reverse())await fn();}
}
const row=(page,pi)=>page.locator('[data-ar-editor] [data-ar-athlete="'+pi+'"]');
async function time(page,pi,minutes,seconds){await row(page,pi).locator("[data-ar-minutes]").fill(String(minutes));await row(page,pi).locator("[data-ar-seconds]").fill(String(seconds));}
const marker=(page,pi,r,status)=>page.locator(".start-list-table tbody tr, .protocol-table tbody tr").nth(pi).locator("td.route-cell,td.protocol-route-cell").nth(r).locator(".route-marker."+status);

test("dialog saves/cancels individual blocks, aligns controls, uses numeric time fields and collapses summaries",async({browser})=>{
 await withPages(browser,async(server,[page])=>{
  await page.locator('[data-start-list-route="0"]').click();
  await expect(page.locator('.start-list-incident-action.pause')).toBeDisabled();
  await expect(page.locator('.start-list-incident-action.stop')).toBeEnabled();
  const icon=await page.locator('[data-final-appeal-add]').evaluate(el=>{const a=getComputedStyle(el,'::before'),b=getComputedStyle(el,'::after');return {font:getComputedStyle(el).fontSize,width:a.width,height:a.height,otherWidth:b.width,otherHeight:b.height,color:a.backgroundColor,green:getComputedStyle(document.querySelector('.start-list-add')).color};});
  expect(icon.font).toBe('0px');expect(icon.width).toBe(icon.otherWidth);expect(icon.height).toBe(icon.otherHeight);expect(icon.color).not.toBe(icon.green);
  const headerCenters=await page.locator('.start-list-table thead').evaluate(el=>[...el.querySelectorAll('th:not(.route-cell)')].map(th=>{const range=document.createRange();range.selectNodeContents(th.querySelector('.start-list-appeal-heading>span')||th);const r=range.getBoundingClientRect();return r.y+r.height/2;}));
  expect(Math.max(...headerCenters)-Math.min(...headerCenters)).toBeLessThan(1.5);
  await page.locator('.start-list-table thead').screenshot({path:test.info().outputPath('appeal-header-centered.png')});
  await page.locator('[data-final-appeal-add]').screenshot({path:test.info().outputPath('appeal-plus.png')});
  await page.locator('[data-final-appeal-add]').click();
  await expect(page.locator('[data-ar-after]')).toHaveValue('0');await expect(page.locator('[data-ar-add]')).toHaveCount(0);
  await expect(page.locator('[data-ar-start]:checked')).toHaveCount(0);
  await row(page,0).locator('[data-ar-route="0"]').check();await time(page,0,1,30);
  await expect(row(page,0).locator('[data-ar-route="1"]')).toBeDisabled();await expect(row(page,1).locator('[data-ar-route="0"]')).toBeDisabled();
  await row(page,1).locator('[data-ar-route="1"]').check();await time(page,1,2,0);
  await expect(page.locator('[data-ar-start]:checked')).toHaveCount(0);expect((await server.state()).finalAppealRotations).toEqual([]);
  const centers=await page.locator('.final-appeal-block-head').evaluate(el=>[el.querySelector('strong'),el.querySelector('input'),el.querySelector('button')].map(el=>{const r=el.getBoundingClientRect();return r.y+r.height/2;}));expect(Math.max(...centers)-Math.min(...centers)).toBeLessThan(1);
  await page.locator('.final-appeal-dialog').screenshot({path:test.info().outputPath('appeal-dialog.png')});
  await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor]')).toHaveCount(0);await expect(page.locator('[data-ar-summary]')).toHaveCount(1);await expect(page.locator('[data-ar-add]')).toBeVisible();
  expect((await server.state()).activeSettings.rotationSeconds).toBe(120);
  await page.locator('[data-ar-add]').click();await expect(page.locator('[data-ar-add]')).toHaveCount(0);await page.locator('[data-ar-cancel]').click();await expect(page.locator('[data-ar-summary]')).toHaveCount(1);
  await page.locator('[data-ar-add]').click();await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor]')).toHaveCount(0);await expect(page.locator('[data-ar-summary]')).toHaveCount(1);
  await page.locator('[data-ar-edit]').click();await time(page,0,4,1);await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor] [data-ar-error]')).toContainText('4:00');
  expect((await server.state()).finalAppealRotations[0].entries[0].timeSeconds).toBe(90);
  await row(page,0).locator('[data-ar-minutes]').press('ArrowDown');await expect(row(page,0).locator('[data-ar-minutes]')).toHaveValue('3');await row(page,0).locator('[data-ar-minutes]').press('ArrowUp');await expect(row(page,0).locator('[data-ar-minutes]')).toHaveValue('4');
  await page.locator('[data-ar-cancel]').click();expect((await server.state()).finalAppealRotations[0].entries[0].timeSeconds).toBe(90);
  await page.locator('[data-ar-add]').click();await row(page,2).locator('[data-ar-route="2"]').check();await time(page,2,0,45);await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-summary]')).toHaveCount(2);
  await page.locator('.final-appeal-dialog').screenshot({path:test.info().outputPath('appeal-summaries.png')});
  await page.locator('[data-ar-close]').click();await page.evaluate(()=>applyLanguage('en'));await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-edit]').first().click();
  await page.locator('.final-appeal-dialog').screenshot({path:test.info().outputPath('appeal-dialog-en.png')});
  await page.locator('[data-ar-cancel]').click();await page.locator('[data-ar-summary]').last().locator('[data-ar-remove]').click();await expect(page.locator('[data-ar-summary]')).toHaveCount(1);
  expect((await server.state()).finalAppealRotations).toHaveLength(1);
 });
});

test("silent A/R keeps warm-up and common five-second/finish sounds on both Modern screens",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("silent",[entry(0,0,8),entry(1,1,6)])]});
  await pages[0].waitForFunction(()=>state.finalAppealActiveId==="silent");
  await pages[0].evaluate(()=>startTimer());
  await expect.poll(async()=>(await server.state()).completed,{timeout:12000}).toBe(true);
  await pages[0].waitForTimeout(350);
  expect((await server.state()).manualStartLeadMs).toBe(0); // Cleared on natural completion.
  for(const page of pages){
   const cues=await page.evaluate(()=>window.arProbe.map(e=>e.key));
   expect(cues.filter(k=>k.includes(":rotation:start:")||k.startsWith("appealStart:")||/^rotationBoundary:1:rotation:/.test(k))).toHaveLength(0);
   expect(cues.filter(k=>k.includes(":warn:"))).toHaveLength(5);
   expect(cues.filter(k=>k.includes("rotationBoundary:1:finish:silent:"))).toHaveLength(1);
  }
  await pages[0].evaluate(()=>startTimer());
  await expect.poll(async()=>(await server.state()).finalAppealActiveId).toBe("");
  expect((await server.state()).startListFinalCycle).toBe(0);expect((await server.state()).activeSettings.rotationSeconds).toBe(240);
 });
});

test("time inputs and validation follow changed round settings instead of the saved A/R duration",async({browser})=>{
 await withPages(browser,async(server,[page])=>{
  await server.action({type:"finalAppeals",rotations:[plan("cap",[entry(0,0,120)])]});
  const change=async minutes=>{
   await server.action({type:"settings",activePreset:"final",settings:{rotationMinutes:minutes,breakSeconds:0,oneShot:true,finalRoundFormat:"new"}});
   await page.waitForFunction(minutes=>draftSettings().rotationMinutes===minutes,minutes);
  };
  await change(3);await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-edit]').click();
  await expect(row(page,0).locator('[data-ar-minutes]')).toHaveAttribute("max","3");await time(page,0,3,1);await page.locator('[data-ar-save]').click();
  await expect(page.locator('[data-ar-editor] [data-ar-error]')).toContainText("3:00");
  await time(page,0,3,0);await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor]')).toHaveCount(0);
  expect((await server.state()).activeSettings.rotationSeconds).toBe(180);await page.locator('[data-ar-close]').click();
  await change(5);await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-edit]').click();
  await expect(row(page,0).locator('[data-ar-minutes]')).toHaveAttribute("max","5");await time(page,0,4,30);await page.locator('[data-ar-save]').click();
  await expect(page.locator('[data-ar-editor]')).toHaveCount(0);expect((await server.state()).activeSettings.rotationSeconds).toBe(270);
 });
});

test("selected delayed starts are deduplicated, survive audio rescheduling and do not repeat after pause/resume",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("delayed",[entry(0,0,8),entry(1,1,6,true),entry(2,2,6,true)])]});
  await pages[0].waitForFunction(()=>state.finalAppealActiveId==="delayed");
  await pages[0].evaluate(()=>startTimer());
  await pages[0].waitForTimeout(2900);
  for(const page of pages)await expect.poll(()=>page.evaluate(()=>window.arProbe.filter(e=>e.key.startsWith("appealStart:")).length)).toBe(1);
  await server.action({type:"pause"});
  await pages[0].waitForFunction(()=>!state.running);
  await pages[0].evaluate(()=>startTimer());
  await pages[0].waitForTimeout(600);
  for(const page of pages){
   await page.evaluate(()=>{rescheduleStandaloneSignals({includeRecentPhaseSignal:true});});
   const cues=await page.evaluate(()=>window.arProbe.filter(e=>e.key.startsWith("appealStart:")));expect(cues).toHaveLength(1);
  }
 });
});

test("Modern and Legacy display assigned A/R athletes, preserve ordinary numbering and resume the next regular rotation",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("display",[entry(4,0,8),entry(6,2,6)],0)]});
  for(const page of pages){await expect(marker(page,4,0,"ready")).toBeVisible();await expect(marker(page,6,2,"ready")).toBeVisible();}
  await server.start({activePreset:"final",settings,startAudioLead:true});
  for(const page of pages){await expect(marker(page,4,0,"active")).toBeVisible();await expect(marker(page,6,2,"active")).toBeVisible();await expect(page.locator(".route-marker.active")).toHaveCount(2);}
  await server.action({type:"reset",settings,activePreset:"final"});
  expect((await server.state()).startListFinalCycle).toBe(0);
  for(const page of pages){await expect(marker(page,4,0,"active")).toHaveCount(0);await expect(marker(page,6,2,"done")).toHaveCount(0);}
  await server.start({activePreset:"final",settings});
  for(const page of pages)await expect(marker(page,0,0,"active")).toBeVisible();
 },{legacy:true});
});

test("two consecutive A/R rotations each play a single selected initial start and finish on both screens",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("first",[entry(0,0,6,true),entry(1,1,6,true)]),plan("second",[entry(2,0,6,true)])]});
  for(const id of ["first","second"]){
   await pages[0].waitForFunction(id=>state.finalAppealActiveId===id,id);
   await pages[0].evaluate(()=>startTimer());
   await expect.poll(async()=>(await server.state()).completed,{timeout:10000}).toBe(true);
   await pages[0].waitForTimeout(250);
   for(const page of pages){
    const cues=await page.evaluate(()=>window.arProbe.map(e=>e.key));
    expect(cues.filter(k=>k.includes(":rotation:start:")).length).toBe(id==="first"?1:2);
    expect(cues.filter(k=>k.includes(`rotationBoundary:1:finish:${id}:`))).toHaveLength(1);
   }
   expect((await server.state()).startListFinalCycle).toBe(0);
   if(id==="first"){await server.action({type:"reset",settings,activePreset:"final"});}
  }
 });
});

test("A/R preliminary countdown waits for manual Start and retains the existing preparation lead",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("scheduled",[entry(0,0,8),entry(1,1,6)])]});
  await server.start({activePreset:"final",settings,startMode:"scheduled",startHours:"",startMinutes:""});
  for(const page of pages){
   await page.waitForFunction(()=>state.waitingForManualStart);
   await expect(marker(page,0,0,"ready")).toBeVisible();
   expect(await page.evaluate(()=>window.arProbe.filter(e=>e.key.includes(":start:")).length)).toBe(0);
  }
  await pages[0].evaluate(()=>startTimer());
  const s=await server.state();expect(s.manualStartLeadMs).toBe(600);expect(s.countdownOnly).toBe(false);expect(s.activeSettings.rotationSeconds).toBe(8);expect(s.startListFinalCycle).toBe(0);
 });
});

test("rotation 10 prepares the inserted A/R instead of ordinary rotation 11 in Modern and Legacy",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  await server.action({type:"finalAppeals",rotations:[plan("after10",[entry(7,3,120)],10)]});
  await server.action({type:"seekCycle",cycle:9});
  for(const page of pages){await expect(marker(page,7,3,"ready")).toHaveCount(0);await expect(marker(page,5,1,"ready")).toBeVisible();}
  await server.action({type:"seekCycle",cycle:10});
  for(const page of pages){
   await expect(marker(page,7,3,"ready")).toBeVisible();await expect(marker(page,6,1,"ready")).toHaveCount(0);await expect(marker(page,2,2,"ready")).toHaveCount(0);
   await expect(page.locator('.appeal-ready-time')).toHaveText('2:00');
   await expect(marker(page,5,1,"active")).toBeVisible();await expect(marker(page,1,2,"active")).toBeVisible();
  }
  await server.start({activePreset:"final",settings});const anchor=(await server.state()).timerClock.startedAt;
  await server.action({type:"finalAppeals",rotations:[plan("after10",[entry(6,3,120)],10)]});
  for(const page of pages){await expect(marker(page,7,3,"ready")).toHaveCount(0);await expect(marker(page,6,3,"ready")).toBeVisible();}
  expect((await server.state()).timerClock.startedAt).toBe(anchor);
  await server.action({type:"reset",activePreset:"final",settings});
  expect((await server.state()).startListFinalCycle).toBe(10);
  for(const page of pages)await expect(marker(page,6,3,"ready")).toBeVisible();
 },{legacy:true});
});

test("completed A/R can be edited and replayed with a new finish identity, then deleted",async({browser})=>{
 await withPages(browser,async(server,pages)=>{
  const page=pages[0];await server.action({type:"finalAppeals",rotations:[plan("history",[entry(0,0,1)])]});
  await server.start({activePreset:"final",settings,startAudioLead:true});
  await expect.poll(async()=>(await server.state()).completed,{timeout:5000}).toBe(true);await page.waitForTimeout(300);
  for(const screen of pages)expect(await screen.evaluate(()=>window.arProbe.filter(e=>e.key.includes("rotationBoundary:1:finish:history:")).length)).toBe(1);
  await server.action({type:"reset",activePreset:"final",settings});
  await page.locator('[data-final-appeal-add]').click();await expect(page.locator('[data-ar-summary]')).toContainText(/Завершена|Completed/);await expect(page.locator('[data-ar-edit]')).toBeEnabled();
  await page.locator('[data-ar-edit]').click();await time(page,0,0,2);await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor]')).toHaveCount(0);await page.locator('[data-ar-close]').click();
  await server.start({activePreset:"final",settings,startAudioLead:true});
  await expect.poll(async()=>(await server.state()).completed,{timeout:5000}).toBe(true);await page.waitForTimeout(300);
  for(const screen of pages){const finishes=await screen.evaluate(()=>window.arProbe.filter(e=>e.key.includes("rotationBoundary:1:finish:history:")));expect(finishes).toHaveLength(2);expect(finishes[0].key).not.toBe(finishes[1].key);}
  await server.action({type:"reset",activePreset:"final",settings});await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-remove]').click();
  await expect(page.locator('[data-ar-summary]')).toHaveCount(0);expect((await server.state()).finalAppealRotations).toEqual([]);expect((await server.state()).startListFinalCycle).toBe(0);
 });
});

test("standalone dialog, A/R execution, pause/resume and reload retain assignments and ordinary progress",async({browser})=>{
 const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),root=path.resolve(__dirname,"../.."),directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-ar-")),file=path.join(directory,"timer.html");
 const result=require("node:child_process").spawnSync(process.execPath,[path.join(root,"scripts/build-standalone-html.js"),file],{cwd:root,encoding:"utf8"});expect(result.status,result.stderr).toBe(0);
 let ctx;
 try{
  ctx=await browser.newContext({offline:true});const page=await ctx.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(require("node:url").pathToFileURL(file).href,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>standaloneMode);
  await page.evaluate(()=>setPreset("final"));await page.evaluate(()=>setPreset("final",{finalRoundFormat:"new"}));await page.locator("#startListToggle").check();
  await page.evaluate(l=>commitStartLists([l]),list());
  await page.locator('[data-final-appeal-add]').click();await row(page,0).locator('[data-ar-route="0"]').check();await time(page,0,0,8);
  await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-editor]')).toHaveCount(0);await page.locator('[data-ar-close]').click();
  await expect(page.locator('#cycleMeta')).toContainText(/Допротация|A\/R/);
  await page.reload({waitUntil:"domcontentloaded"});await page.waitForFunction(()=>!!state.finalAppealActiveId);
  expect(await page.evaluate(()=>state.activeSettings.rotationSeconds)).toBe(8);
  await page.evaluate(()=>startTimer());await page.waitForFunction(()=>state.running&&elapsedSeconds()>0.1);await page.evaluate(()=>pauseTimer());
  expect(await page.evaluate(()=>state.startListFinalCycle)).toBe(0);
  await page.reload({waitUntil:"domcontentloaded"});await page.waitForFunction(()=>!!state.finalAppealActiveId&&!state.running&&state.elapsedBeforePause>0);
  await page.evaluate(()=>startTimer());await page.waitForFunction(()=>state.completed,null,{timeout:10000});
  await page.evaluate(()=>startTimer());expect(await page.evaluate(()=>state.finalAppealActiveId)).toBe("");expect(await page.evaluate(()=>state.startListFinalCycle)).toBe(0);
  expect(await page.evaluate(()=>state.activeSettings.rotationSeconds)).toBe(240);expect(errors).toEqual([]);
 }finally{if(ctx)await ctx.close();fs.rmSync(directory,{recursive:true,force:true});}
});
