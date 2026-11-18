"use strict";
const {test,expect}=require("@playwright/test"),{fixture}=require("../helpers/controlled-clock-server");
const list=()=>({headers:["#","Bib","Athlete"],rows:Array.from({length:12},(_,i)=>[String(i+1),String(101+i),"Athlete "+(i+1)]),routeCount:4});
const entry=(pi=0,route=1,timeSeconds=90,startSignal=false)=>({listIndex:0,participantIndex:pi,route,timeSeconds,startSignal});
const plan=(placement="flow",solo=false)=>({id:"extra",afterCycle:2,entries:[entry()],placement,solo});
async function pagesFor(browser,preset,fn,{legacy=true}={}){
 const cleanup=[],contexts=[],pages=[],errors=[];
 try{
  const server=await fixture({after:cb=>cleanup.push(cb)},"darwin",{liveClocks:true});
  const final=preset!=="classic";
  await server.action({type:"primary",primaryClientId:"clock-test"});
  await server.action({type:"settings",activePreset:final?"final":"classic",settings:{rotationMinutes:4,breakSeconds:final?0:15,oneShot:final,finalRoundFormat:final?preset:"old"}});
  await server.action({type:"startLists",startLists:[list()]});await server.action({type:"startListEnabled",enabled:true});
  for(const id of legacy?["clock-test","slot-legacy"]:["clock-test"]){
   const context=await browser.newContext();contexts.push(context);await context.addInitScript(c=>{sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);},await server.credentials(id));
   const page=await context.newPage();pages.push(page);page.on("pageerror",e=>errors.push(e.message));
   await page.goto(server.baseUrl+(id==="slot-legacy"?"/legacy.html?clientId=slot-legacy":"/?perf=2"));
   if(id!=="slot-legacy")await page.waitForFunction(()=>!clockCalibrationPending&&eventSourceConnected&&!syncRequestInFlight);
   else await expect(pages[0].locator('[data-legacy-mode-client="slot-legacy"]')).toBeAttached();
   await server.action({type:"startListDisplay",targetClientId:id,listIndex:0,enabled:true});await expect(page.locator(".start-list-table,.protocol-table")).toBeVisible();
  }
  await fn(server,pages);expect(errors).toEqual([]);
 }finally{for(const c of contexts)await c.close();for(const cb of cleanup.reverse())await cb();}
}
test("Old Final disables route pause and limits an additional rotation to one athlete",async({browser})=>{
 await pagesFor(browser,"old",async(server,[page])=>{
  await page.locator('[data-start-list-route="0"]').click();await expect(page.locator('.start-list-incident-action.pause')).toBeDisabled();await expect(page.locator('.start-list-incident-action.stop')).toBeEnabled();
  await page.locator('[data-final-appeal-add]').click();const row=page.locator('[data-ar-athlete="0"]');await row.locator('[data-ar-route="1"]').check();
  await expect(page.locator('[data-ar-athlete="1"] [data-ar-route="2"]')).toBeDisabled();await row.locator('[data-ar-minutes]').fill('1');await row.locator('[data-ar-seconds]').fill('30');
  await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-summary]')).toHaveCount(1);expect((await server.state()).finalAppealRotations[0].entries).toHaveLength(1);
 });
});
test("Classic dialog defaults to shared flow, offers immediate placement and a separate solo checkbox",async({browser})=>{
 await pagesFor(browser,"classic",async(server,[page])=>{
  await page.locator('[data-final-appeal-add]').click();await expect(page.locator('[data-ar-solo]')).not.toBeChecked();await expect(page.locator('[data-ar-placement]')).toHaveValue('flow');
  await page.locator('[data-ar-after]').fill('2');await page.locator('[data-ar-placement]').selectOption('immediate');
  await page.locator('[data-ar-athlete="0"] [data-ar-route="1"]').check();await page.locator('[data-ar-athlete="0"] [data-ar-minutes]').fill('1');await page.locator('[data-ar-athlete="0"] [data-ar-seconds]').fill('30');
  await expect(page.locator('[data-ar-athlete="1"] [data-ar-route="2"]')).toBeEnabled();
  await page.locator('.final-appeal-dialog').screenshot({path:test.info().outputPath('classic-repeat-dialog.png')});
  await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-summary]')).toContainText(/ротация 3|cycle 3/);
  expect((await server.state()).finalAppealRotations[0]).toMatchObject({placement:"immediate",solo:false});
  await page.locator('[data-ar-edit]').click();await page.locator('[data-ar-solo]').check();await expect(page.locator('[data-ar-placement]')).toBeDisabled();await expect(page.locator('[data-ar-athlete="1"] [data-ar-route="2"]')).toBeDisabled();
  await page.locator('[data-ar-save]').click();expect((await server.state()).finalAppealRotations[0].solo).toBe(true);
  await page.locator('[data-ar-close]').click();await page.evaluate(()=>applyLanguage('en'));await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-edit]').click();await page.locator('[data-ar-solo]').uncheck();await page.locator('.final-appeal-dialog').screenshot({path:test.info().outputPath('classic-repeat-dialog-en.png')});await page.locator('[data-ar-cancel]').click();
 });
});
for(const placement of ["flow","immediate"])test(`Classic ${placement} shows the repeated athlete and shifted normal schedule on Modern and Legacy`,async({browser})=>{
 await pagesFor(browser,"classic",async(server,pages)=>{
  const cycle=placement==="flow"?5:3;
  await server.action({type:"finalAppeals",rotations:[plan(placement)]});
  for(const page of pages)await expect(page.locator('[data-rotation-slot]')).toHaveCount(1);
  await server.action({type:"seekCycle",cycle:cycle-1});
  await server.start({settings:{rotationSeconds:240,breakSeconds:15,oneShot:false},elapsedBeforePause:(cycle-2)*255});
  for(const page of pages){await expect(page.locator('[data-rotation-slot] .route-marker.ready')).toHaveCount(1);await expect(page.locator('[data-rotation-slot] .route-marker.empty')).toHaveCount(3);await expect(page.locator('[data-rotation-slot] .appeal-ready-time')).toHaveText('1:30');
   const geometry=await page.locator('[data-rotation-slot]').evaluate(row=>{const marker=row.querySelector('.route-marker.ready').getBoundingClientRect(),badge=row.querySelector('.appeal-ready-time'),b=badge.getBoundingClientRect();return {right:b.left>=marker.right,z:Number(getComputedStyle(badge.parentNode).zIndex),text:badge.textContent};});expect(geometry.right).toBe(true);expect(geometry.z).toBeGreaterThan(0);
   await page.locator('[data-rotation-slot]').screenshot({path:test.info().outputPath(`ready-time-${placement}-${pages.indexOf(page)}.png`)});
  }
  await server.action({type:"pause"});await server.action({type:"seekCycle",cycle});await server.start({settings:{rotationSeconds:240,breakSeconds:15,oneShot:false},elapsedBeforePause:(cycle-1)*255+1});
  for(const page of pages){await expect(page.locator('[data-rotation-slot] .route-marker.ready')).toHaveCount(1);await expect(page.locator('.start-list-table tbody tr[data-participant-index] td.route-cell:nth-last-child(3) .route-marker.ready,.protocol-table tbody tr:not([data-rotation-slot]) td.protocol-route-cell:nth-last-child(3) .route-marker.ready')).toHaveCount(1);const dim=page.locator('.start-list-table tbody tr[data-participant-index] td.route-cell:nth-last-child(3) .route-marker.ready,.protocol-table tbody tr:not([data-rotation-slot]) td.protocol-route-cell:nth-last-child(3) .route-marker.ready');await expect(dim).toHaveCSS('opacity','0.35');}
  await server.action({type:"pause"});await server.action({type:"seekCycle",cycle});await server.start({settings:{rotationSeconds:240,breakSeconds:15,oneShot:false},elapsedBeforePause:(cycle-1)*255+151});
  for(const page of pages){await expect(page.locator('[data-rotation-slot] .route-marker.active')).toHaveCount(1);await expect(page.locator('[data-rotation-slot] .appeal-ready-time')).toHaveCount(0);await expect(page.locator('.start-list-table tbody tr[data-participant-index] td.route-cell:nth-last-child(3) .route-marker.ready,.protocol-table tbody tr:not([data-rotation-slot]) td.protocol-route-cell:nth-last-child(3) .route-marker.ready')).toHaveCSS('opacity','1');}
  for(const [i,page]of pages.entries())await page.locator(i?'.protocol-table':'.start-list-table').screenshot({path:test.info().outputPath(`classic-${placement}-${i}.png`)});
 });
});
for(const preset of ["classic","old","new"])test(`empty rotation renders a numbered row with styled dashes in ${preset} on Modern and Legacy`,async({browser})=>{
 await pagesFor(browser,preset,async(server,[page,legacy])=>{
  await page.locator('[data-final-appeal-add]').click();await page.locator('[data-ar-toggle-empty]').click();await expect(page.locator('[data-ar-athlete]')).toHaveCount(0);await page.locator('[data-ar-after]').fill('2');await page.locator('[data-ar-save]').click();await expect(page.locator('[data-ar-summary]')).toHaveCount(1);await page.locator('[data-ar-close]').click();
  for(const p of [page,legacy]){
   const row=p.locator('[data-rotation-slot]');await expect(row).toHaveCount(1);await expect(row.locator('td').nth(0)).toHaveText('3');await expect(row.locator('td').nth(1)).toHaveText('-');await expect(row.locator('td').nth(2)).toHaveText('-');await expect(row.locator('.route-marker.empty')).toHaveCount(4);
   expect(await row.locator('.route-marker.empty').first().evaluate(el=>getComputedStyle(el,'::before').content)).toBe('""');
   await expect(p.locator('.start-list-table tbody tr,.protocol-table tbody tr')).toHaveCount(13);
  }
  expect((await server.state()).startLists[0].rows).toHaveLength(12);
  await page.locator('.start-list-table').screenshot({path:test.info().outputPath(`empty-${preset}.png`)});
 });
});
test("standalone Classic restores settings and flow after a solo attempt",async({browser})=>{
 const context=await browser.newContext({offline:true});try{
  const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(require("node:url").pathToFileURL(require("node:path").resolve(__dirname,"../../docs/standalone.html")).href);
  await page.waitForFunction(()=>standaloneMode);await page.evaluate(()=>setPreset("classic"));await page.locator('#startListToggle').check();await page.evaluate(l=>commitStartLists([l]),list());
  const regular=await page.evaluate(()=>activeSettingsFromDraft());
  await page.evaluate(()=>{Object.assign(state,window.FDVFinalAppeals.replaceQueue(state,[{id:"solo",afterCycle:1,solo:true,placement:"flow",entries:[{listIndex:0,participantIndex:0,route:0,timeSeconds:2,startSignal:false}]}]));state.elapsedBeforePause=state.activeSettings.rotationSeconds+state.activeSettings.breakSeconds-0.1;startStandaloneTimer();});
  await page.waitForFunction(()=>state.finalAppealActiveId==="solo"&&!state.running);expect(await page.evaluate(()=>state.finalAppealClassicElapsed)).toBe(regular.rotationSeconds+regular.breakSeconds);
  await page.evaluate(()=>startStandaloneTimer());await page.waitForFunction(()=>state.completed);expect(await page.evaluate(()=>state.activeSettings.oneShot)).toBe(true);
  await page.reload();await page.waitForFunction(()=>!!state.finalAppealActiveId&&state.completed);await page.evaluate(()=>startStandaloneTimer());expect(await page.evaluate(()=>({id:state.finalAppealActiveId,oneShot:state.activeSettings.oneShot,seconds:state.activeSettings.rotationSeconds}))).toEqual({id:"",oneShot:false,seconds:regular.rotationSeconds});expect(errors).toEqual([]);
 }finally{await context.close();}
});
