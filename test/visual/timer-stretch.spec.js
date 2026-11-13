"use strict";
const {test,expect}=require("@playwright/test");
const {fixture}=require("../helpers/controlled-clock-server");
const {authenticatedFetch:fetch}=require("../helpers/browser-session");
async function scenario(browser,fn,startupParams={}){const cleanups=[],contexts=[];try{const server=await fixture({after:f=>cleanups.push(f)},"darwin",{liveClocks:true,startupParams});await server.action({type:"primary",primaryClientId:"clock-test"});
async function open(id,legacy=false,viewport={width:393,height:852},unsupported=false){const context=await browser.newContext({viewport});contexts.push(context);await context.addInitScript(c=>{sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);},await server.credentials(id));const page=await context.newPage();if(unsupported)await page.route("**/lib/timer-stretch.js*",r=>r.fulfill({contentType:"application/javascript",body:"window.FDVTimerStretch={property:function(){return '';},scale:function(){return 1;}};"}));if(legacy){await fetch(server.baseUrl+"/api/state?clientId="+id);await server.action({type:"legacyMode",targetClientId:id,enabled:true});}await page.goto(server.baseUrl+(legacy?"/legacy.html?manualLegacy=1&oldBrowser=1&legacyStickyFallback=1&clientId="+id:"/"),{waitUntil:"domcontentloaded"});await page.evaluate(()=>document.fonts?.ready);if(legacy)await page.waitForFunction(()=>document.getElementById("timeDigits").textContent!=="--:--");else await page.waitForFunction(()=>!clockCalibrationPending);return page;}
await fn(server,open);}finally{for(const c of contexts)await c.close();for(const f of cleanups.reverse())await f();}}
async function geometry(page,legacy){return page.evaluate(legacy=>{const time=document.getElementById(legacy?"timeDigits":"time"),pane=document.querySelector(legacy?"#timerPane":".timer-wrap"),clock=document.getElementById(legacy?"serverClock":"serverClockDisplay"),separator=document.querySelector(".time-separator");return {time:time.getBoundingClientRect().toJSON(),pane:pane.getBoundingClientRect().toJSON(),clock:clock.getBoundingClientRect().toJSON(),transform:getComputedStyle(time).transform,separator:separator?separator.getBoundingClientRect().toJSON():null};},legacy);}

for(const legacy of [false,true])test("per-screen vertical stretch fills portrait space up to 200% "+(legacy?"Legacy":"Modern"),async({browser},testInfo)=>{
 await scenario(browser,async(server,open)=>{
  const primary=await open("clock-test",false,{width:1280,height:900});const screen=await open("stretch-screen",legacy);const other=await open("other-screen");
  const chip=primary.locator('[data-timer-stretch-client="stretch-screen"]');await expect(chip).toHaveClass(/inactive/);await expect(chip).toHaveAttribute("aria-pressed","false");
  const before=await geometry(screen,legacy);const version=(await server.state()).version;
  await chip.click();await expect(chip).toHaveAttribute("aria-pressed","true");await expect.poll(async()=> (await geometry(screen,legacy)).time.height/before.time.height).toBeGreaterThan(1.1);
  const after=await geometry(screen,legacy);expect(after.time.height/before.time.height).toBeLessThanOrEqual(2.01);expect(Math.abs(after.time.width-before.time.width)).toBeLessThan(1.5);expect(after.time.top).toBeGreaterThanOrEqual(after.pane.top-1);expect(after.time.bottom).toBeLessThanOrEqual(after.pane.bottom+1);
  if(!legacy){expect(Math.abs(after.separator.height-before.separator.height)).toBeLessThan(1);expect(Math.abs(after.separator.width-before.separator.width)).toBeLessThan(1);}
  expect(await other.evaluate(()=>state.timerVerticalStretch)).toBe(false);
  await screen.screenshot({path:testInfo.outputPath("stretch-portrait.png")});
  if(!legacy){
    const card=primary.locator(".browser-item").filter({has:chip});
    await card.screenshot({path:require("node:path").resolve(__dirname,"../../help-assets/timer-stretch-ru.png")});
    await server.action({type:"language",language:"en"});await expect(primary.locator("html")).toHaveAttribute("lang","en");
    await card.screenshot({path:require("node:path").resolve(__dirname,"../../help-assets/timer-stretch-en.png")});
    await server.action({type:"language",language:"ru"});
  }
  await screen.reload({waitUntil:"domcontentloaded"});await expect.poll(()=>screen.evaluate(legacy=>legacy ? document.getElementById("timeDigits").style.transform!=="" : state.timerVerticalStretch,legacy)).toBe(true);
  await server.action({type:"clientServerTime",targetClientId:"stretch-screen",enabled:true});await expect(screen.locator(legacy?"#serverClock":"#serverClockDisplay")).toBeVisible();
  await screen.waitForTimeout(250);const withClock=await geometry(screen,legacy);expect(withClock.time.bottom).toBeLessThanOrEqual(withClock.clock.top+1);expect(withClock.time.top).toBeGreaterThanOrEqual(withClock.pane.top-1);
  await screen.setViewportSize({width:1280,height:720});await screen.waitForTimeout(800);const wide=await geometry(screen,legacy);expect(wide.time.top).toBeGreaterThanOrEqual(wide.pane.top-1);expect(wide.time.bottom).toBeLessThanOrEqual(wide.clock.top+1);
  await screen.setViewportSize({width:393,height:852});await screen.waitForTimeout(800);await server.action({type:"clientServerTime",targetClientId:"stretch-screen",enabled:false});await chip.click();await expect(chip).toHaveAttribute("aria-pressed","false");await expect.poll(async()=> (await geometry(screen,legacy)).transform).toBe("none");
  if(!legacy){await expect.poll(()=>screen.locator("#time").evaluate(el=>el.style.getPropertyValue("--timer-separator-scale"))).toBe("");expect(await screen.locator(".time-separator").evaluate(el=>Math.abs(el.getBoundingClientRect().height-el.offsetHeight))).toBeLessThan(1);}
  expect((await server.state()).running).toBe(false);expect((await server.state()).version).toBeGreaterThan(version);
 });
});

test("unsupported browser has a gray noninteractive stretch chip",async({browser})=>{
 await scenario(browser,async(server,open)=>{const primary=await open("clock-test");await open("unsupported",true,undefined,true);const chip=primary.locator('[data-timer-stretch-status="unsupported"]');await expect(chip).toHaveClass(/neutral/);await expect(chip).toHaveAttribute("aria-disabled","true");await expect(primary.locator('[data-timer-stretch-client="unsupported"]')).toHaveCount(0);});
});

for(const legacy of [false,true])for(const percent of [125,100,80])test("params cap "+percent+" controls badge and digits "+(legacy?"Legacy":"Modern"),async({browser})=>{
 await scenario(browser,async(server,open)=>{
  const primary=await open("clock-test",false,{width:1280,height:900});const screen=await open("configured",legacy);
  const badge=primary.locator('[data-timer-stretch-status="configured"]');
  await expect(badge).toHaveAttribute("title",new RegExp(percent+"%"));await expect(badge).toHaveAttribute("title",/timer_vertical_stretch_max_percent.*params.txt/);
  const before=await geometry(screen,legacy);
  if(percent>100){await expect(badge).toHaveAttribute("aria-pressed","false");await badge.click();await expect(badge).toHaveAttribute("aria-pressed","true");await expect.poll(async()=> (await geometry(screen,legacy)).time.height/before.time.height).toBeGreaterThan(1.2);expect((await geometry(screen,legacy)).time.height/before.time.height).toBeLessThanOrEqual(1.26);}
  else{await expect(badge).toHaveClass(/neutral/);await expect(badge).toHaveAttribute("aria-disabled","true");await expect(primary.locator('[data-timer-stretch-client="configured"]')).toHaveCount(0);
   // A saved enabled preference must still render proportionally with a disabled global cap.
   if(legacy){await screen.route("**/api/state?*",async route=>{const response=await route.fetch();const json=await response.json();json.timerVerticalStretch=true;await route.fulfill({response,json});});await screen.reload({waitUntil:"domcontentloaded"});await screen.waitForFunction(()=>document.getElementById("timeDigits").textContent!=="--:--");}
   else await screen.evaluate(()=>{state.timerVerticalStretch=true;fitTimerText();});
   expect((await geometry(screen,legacy)).transform).toBe("none");
  }
 },{timer_vertical_stretch_max_percent:percent});
});


test("stretch during active browser audio preserves prepared nodes, cue targets and the timer anchor",async({browser})=>{
 await scenario(browser,async(server,open)=>{
  const primary=await open("clock-test",false,{width:1280,height:900});const screen=primary;
  await server.action({type:"instancesSound",enabled:true});await screen.waitForFunction(()=>canPlaySound());
  await screen.evaluate(async()=>{await unlockAudio(false);await loadAudioBuffers();});
  await primary.locator('[data-audio-client="clock-test"]').click();
  await primary.locator("[data-audio-offset-slider]").evaluate(slider=>{slider.value="125";slider.dispatchEvent(new Event("input",{bubbles:true}));});
  await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:48});
  await screen.waitForFunction(()=>scheduledAudioNodes.length>0);
  const before=await screen.evaluate(()=>{window.stretchNodes=scheduledAudioNodes.map(n=>n.node);return {anchor:state.serverStartedAt,targets:scheduledAudioNodes.map(n=>n.targetDetails?.targetServerTimeMs),offset:audioUserOffsetMs};});
  const chip=primary.locator('[data-timer-stretch-client="clock-test"]');await chip.click();await screen.waitForFunction(()=>state.timerVerticalStretch);
  const after=await screen.evaluate(()=>({anchor:state.serverStartedAt,targets:scheduledAudioNodes.map(n=>n.targetDetails?.targetServerTimeMs),offset:audioUserOffsetMs,retained:stretchNodes.every(node=>scheduledAudioNodes.some(n=>n.node===node))}));
  expect(after).toEqual({...before,retained:true});
  await expect(primary.locator("[data-audio-offset-slider]")).toHaveValue("125");
 });
});

for(const legacy of [false,true])test("stretch leaves space for lists, footer and server clock "+(legacy?"Legacy":"Modern"),async({browser})=>{
 await scenario(browser,async(server,open)=>{
  await open("clock-test",false,{width:1280,height:900});const screen=await open("list-screen",legacy,{width:1280,height:900});
  await server.action({type:"startLists",startLists:[{headers:["#","Имя"],rows:[["1","Первый"],["2","Второй"]],routeCount:5}]});
  await server.action({type:"startListDisplay",targetClientId:"list-screen",listIndex:0,enabled:true});
  await server.action({type:"clientServerTime",targetClientId:"list-screen",enabled:true});
  await server.action({type:"clientTimerStretch",targetClientId:"list-screen",enabled:true});
  for(const viewport of [{width:1280,height:900},{width:393,height:852},{width:962,height:541}]){
   await screen.setViewportSize(viewport);await screen.waitForTimeout(1000);
   const g=await geometry(screen,legacy);expect(g.time.top).toBeGreaterThanOrEqual(g.pane.top-2);expect(g.time.bottom).toBeLessThanOrEqual(g.clock.top+2);
   expect(g.time.left).toBeGreaterThanOrEqual(g.pane.left-2);expect(g.time.right).toBeLessThanOrEqual(g.pane.right+2);
  }
 });
});

for(const android of [false,true])test("standalone stretch persists per tab without sharing the preference "+(android?"Android":"HTML"),async({browser})=>{
 const context=await browser.newContext({viewport:{width:393,height:852},offline:true});
 try{const page=await context.newPage();const file=require("node:path").resolve(__dirname,android?"../../android/app/src/main/assets/timer.html":"../../docs/standalone.html");const url=require("node:url").pathToFileURL(file).href;
  await page.goto(url,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>standaloneMode);
  const chip=page.locator('[data-timer-stretch-client]');await expect(chip).toHaveAttribute("aria-pressed","false");if(!(await chip.isVisible()))await page.locator('[data-section-toggle][aria-controls="browserList"]').click();await chip.click();await expect(chip).toHaveAttribute("aria-pressed","true");
  await page.reload({waitUntil:"domcontentloaded"});await expect(chip).toHaveAttribute("aria-pressed","true");
  const second=await context.newPage();await second.goto(url,{waitUntil:"domcontentloaded"});await second.waitForFunction(()=>standaloneMode);
  await expect(second.locator('[data-timer-stretch-client]')).toHaveAttribute("aria-pressed","false");await expect(chip).toHaveAttribute("aria-pressed","true");
 }finally{await context.close();}
});


for(const legacy of [false,true])test("startup stretch flag applies before a screen toggle "+(legacy?"Legacy":"Modern"),async({browser})=>{
 await scenario(browser,async(server,open)=>{
  const primary=await open("clock-test",false,{width:1280,height:900}),screen=await open("auto-screen",legacy);
  const badge=primary.locator('[data-timer-stretch-client="auto-screen"]');await expect(badge).toHaveAttribute("aria-pressed","true");
  await expect.poll(async()=> (await geometry(screen,legacy)).transform).not.toBe("none");
  await badge.click();await expect(badge).toHaveAttribute("aria-pressed","false");
  await screen.reload({waitUntil:"domcontentloaded"});await expect.poll(async()=> (await geometry(screen,legacy)).transform).toBe("none");
  const fresh=await open("new-auto-screen");await expect.poll(()=>fresh.evaluate(()=>state.timerVerticalStretch)).toBe(true);
 },{timer_vertical_stretch:true});
});

test("standalone inherits the embedded stretch default and retains an explicit off choice",async({browser},testInfo)=>{
 const fs=require("node:fs"),path=require("node:path"),url=require("node:url");
 const html=fs.readFileSync(path.resolve(__dirname,"../../docs/standalone.html"),"utf8");const marker='"timerVerticalStretchDefault":false';expect(html).toContain(marker);
 const file=testInfo.outputPath("stretch-default-on.html");fs.writeFileSync(file,html.replace(marker,'"timerVerticalStretchDefault":true'));
 const context=await browser.newContext({viewport:{width:393,height:852}});
 try{const page=await context.newPage();await page.goto(url.pathToFileURL(file).href,{waitUntil:"domcontentloaded"});await page.waitForFunction(()=>standaloneMode);
  const badge=page.locator('[data-timer-stretch-client]');await expect(badge).toHaveAttribute("aria-pressed","true");
  if(!await badge.isVisible())await page.locator('[data-section-toggle][aria-controls="browserList"]').click();
  await badge.click();await expect(badge).toHaveAttribute("aria-pressed","false");await page.reload({waitUntil:"domcontentloaded"});await expect(badge).toHaveAttribute("aria-pressed","false");
 }finally{await context.close();}
});
