"use strict";
const {test,expect}=require("@playwright/test");
const path=require("node:path");
const {fixture}=require("../helpers/controlled-clock-server");
async function withServer(run,options={}){
  const cleanup=[];
  try{const server=await fixture({after:fn=>cleanup.push(fn)},"darwin",{liveClocks:true,nativeAudioStub:true,legacyRuntime:null,...options});await run(server);}
  finally{for(const fn of cleanup.reverse())await fn();}
}
async function open(page,server){
  await server.action({type:"primary",primaryClientId:"clock-test"});
  await page.addInitScript(()=>sessionStorage.setItem("boulderingTimerClientId","clock-test"));
  await page.goto(server.baseUrl+"/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>nativeAudioRoute?.snapshot().active && nativeAudioRoute.suppressed());
}
async function toggleAudioPanel(page){
  await page.waitForFunction(()=>performance.now()-lastAudioChipToggleAt>=300);
  await page.locator('[data-audio-client="clock-test"]').click();
}
test("local native route retains the browser offset, stops with its checkbox and can be re-enabled",async({page})=>{
  await withServer(async server=>{
    const errors=[];page.on("pageerror",e=>errors.push(e.message));await open(page,server);
    expect(await page.evaluate(()=>({wanted:browserSoundRequested(),local:canPlaySound()}))).toEqual({wanted:true,local:false});
    await server.action({type:"audioOffset",targetClientId:"clock-test",offset:-300});
    await page.waitForFunction(()=>lastKnownClients.some(c=>c.id===clientId && c.serverAudioActive));
    await page.evaluate(()=>revealControlsIfAllowed());
    await toggleAudioPanel(page);
    await expect(page.locator("[data-native-audio-label]")).toHaveText("Звук воспроизводит сервер");
    await expect(page.locator("[data-audio-offset-value]")).toContainText("-300");
    await page.locator(".browser-item.primary-browser").screenshot({path:path.resolve(__dirname,"../../help-assets/server-audio.png")});
    await toggleAudioPanel(page);
    await expect(page.locator("[data-native-audio-label]")).toHaveCount(0);
    await server.action({type:"language",language:"en"});
    await expect(page.locator("html")).toHaveAttribute("lang","en");
    await toggleAudioPanel(page);
    await expect(page.locator("[data-native-audio-label]")).toHaveText("Sound is played by the server");
    await page.locator(".browser-item.primary-browser").screenshot({path:path.resolve(__dirname,"../../help-assets/server-audio-en.png")});
    await toggleAudioPanel(page);
    await expect(page.locator("[data-native-audio-label]")).toHaveCount(0);
    await server.action({type:"language",language:"ru"});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:54});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="plan").at(-1)?.cues.some(c=>c.kind==="warn")).toBe(true);
    const remote=await server.state(),anchor=remote.timerClock.startedAt;
    const plan=server.nativeEvents().filter(e=>e.stage==="plan").at(-1);
    const warning=plan.cues.find(c=>c.kind==="warn");expect(warning.at).toBeCloseTo(anchor+55000-300,1);
    await page.locator("#soundToggle").uncheck();
    await expect.poll(()=>page.evaluate(()=>nativeAudioRoute.snapshot().active)).toBe(false);
    await page.locator("#soundToggle").check();
    await page.waitForFunction(()=>nativeAudioRoute.snapshot().active);
    await server.action({type:"pause"});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="plan").at(-1)?.cues.length).toBe(0);
    expect(errors).toEqual([]);
  });
});
test("frozen browser delegates two full rotations to the server and remote Stop cancels the next series",async({page,context})=>{
  test.setTimeout(45000);
  await withServer(async server=>{
    await open(page,server);
    await server.start({settings:{rotationSeconds:6,breakSeconds:3,oneShot:false}});
    const cdp=await context.newCDPSession(page);
    await cdp.send("Page.setWebLifecycleState",{state:"frozen"});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="played" && e.key.startsWith("2:rotation:warn")).length,{timeout:18000}).toBe(5);
    expect(server.nativeEvents().filter(e=>e.stage==="played"&&e.key.startsWith("1:rotation:warn")).length).toBe(5);
    await server.action({type:"reset"});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="plan").at(-1)?.cues.length).toBe(0);
    const count=server.nativeEvents().filter(e=>e.stage==="played").length;
    await new Promise(resolve=>setTimeout(resolve,1500));
    expect(server.nativeEvents().filter(e=>e.stage==="played").length).toBe(count);
    await cdp.send("Page.setWebLifecycleState",{state:"active"});
  });
});

test("native output checkbox returns sound to the browser, survives reload and preserves correction",async({page})=>{
  await withServer(async server=>{
    await open(page,server);
    await server.action({type:"audioOffset",targetClientId:"clock-test",offset:-300});
    await page.evaluate(async()=>{revealControlsIfAllowed();await unlockAudio(false);await loadAudioBuffers();});
    await toggleAudioPanel(page);
    const checkbox=page.locator('[data-server-audio-enabled="clock-test"]');
    await expect(checkbox).toBeChecked();
    await expect(checkbox.locator("..")).toHaveAttribute("title",/скрытой или спящей вкладке/);
    const label=await page.locator("[data-native-audio-label]").boundingBox(),box=await checkbox.boundingBox();
    expect(box.x-label.x-label.width).toBeGreaterThanOrEqual(12);
    await checkbox.uncheck();
    await page.waitForFunction(()=>!nativeAudioRoute.suppressed() && canPlaySound() && nativeAudioOffer.enabled===false);
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator("[data-native-audio-label]")).toHaveText("Звук воспроизводит браузер");
    await expect(page.locator("[data-audio-offset-value]")).toContainText("-300");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>nativeAudioOffer?.enabled===false && !nativeAudioRoute.suppressed());
    await page.evaluate(()=>revealControlsIfAllowed());await toggleAudioPanel(page);
    await expect(checkbox).not.toBeChecked();
    await server.action({type:"language",language:"en"});
    await expect(checkbox.locator("..")).toHaveAttribute("title",/hidden or sleeping tab/);
    await expect(page.locator("[data-audio-offset-value]")).toContainText("-300");
    await checkbox.check();
    await page.waitForFunction(()=>nativeAudioRoute.suppressed() && nativeAudioRoute.snapshot().active);
    await expect(checkbox).toBeChecked();
    expect(await page.evaluate(()=>({local:canPlaySound(),nodes:scheduledAudioNodes.length}))).toEqual({local:false,nodes:0});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:54});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="plan").at(-1)?.cues.some(c=>c.kind==="warn")).toBe(true);
    const anchor=(await server.state()).timerClock.startedAt;
    const cue=server.nativeEvents().filter(e=>e.stage==="plan").at(-1).cues.find(c=>c.kind==="warn");
    expect(cue.at).toBeCloseTo(anchor+55000-300,1);
    await checkbox.uncheck();
    await page.waitForFunction(()=>!nativeAudioRoute.suppressed() && nativeAudioOffer.enabled===false);
    await expect.poll(()=>page.evaluate(()=>lastKnownClients.find(c=>c.id===clientId)?.serverAudioActive)).toBe(false);
  });
});
test("closing the owner page revokes native playback; proxy and foreign-origin claims are rejected",async({page,request})=>{
  await withServer(async server=>{
    await open(page,server);
    const remote=await server.state();
    for(const headers of [{"x-forwarded-for":"127.0.0.1"},{origin:"https://foreign.invalid"}]){
      const result=await request.post(server.baseUrl+"/api/server-audio",{headers,data:{clientId:"clock-test",serverInstanceId:remote.serverInstanceId,op:"prepare",wanted:true}});
      expect(result.status()).toBe(403);
    }
    await page.close();
    await expect.poll(async()=>{
      const response=await request.post(server.baseUrl+"/api/server-audio",{data:{clientId:"clock-test",serverInstanceId:remote.serverInstanceId,op:"status"}});
      return (await response.json()).active;
    }).toBe(false);
  });
});

test("an unlocked visible browser submits no audio while the native route plays both rotations",async({page})=>{
  await withServer(async server=>{
    await open(page,server);
    await page.evaluate(async()=>{
      await unlockAudio(false);await loadAudioBuffers();
      window.browserOutputProbe=[];
      const start=AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1)browserOutputProbe.push("buffer");return start.apply(this,args);};
      const oscillator=OscillatorNode.prototype.start;
      OscillatorNode.prototype.start=function(...args){browserOutputProbe.push("oscillator");return oscillator.apply(this,args);};
      const play=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(...args){browserOutputProbe.push("html");return play.apply(this,args);};
      const speak=speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak=function(...args){browserOutputProbe.push("speech");return speak(...args);};
    });
    await expect.poll(()=>page.evaluate(()=>audioContext.state)).toBe("running");
    await server.start({settings:{rotationSeconds:6,breakSeconds:3,oneShot:false}});
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="played"&&e.key.startsWith("2:rotation:warn")).length,{timeout:18000}).toBe(5);
    expect(server.nativeEvents().filter(e=>e.stage==="played"&&e.key.startsWith("1:rotation:warn")).length).toBe(5);
    expect(await page.evaluate(()=>({native:nativeAudioRoute.suppressed(),local:canPlaySound(),submitted:browserOutputProbe,nodes:scheduledAudioNodes.length})))
      .toEqual({native:true,local:false,submitted:[],nodes:0});
  });
});

for(const preset of ["classic","festival","final"])test(`scheduled ${preset} minute warning survives unchanged calendar-clock samples on the native route`,async({page})=>{
  await withServer(async server=>{
    server.frame(-7000);await open(page,server);
    await server.action({type:"audioOffset",targetClientId:"clock-test",offset:-300});
    const future=new Date((await server.state()).now+67000);
    const before=await server.start({activePreset:preset,settings:{rotationSeconds:60,breakSeconds:preset==="final"?0:15,oneShot:preset==="final"},
      startMode:"scheduled",startHours:future.getHours(),startMinutes:future.getMinutes()});
    await expect.poll(()=>server.nativeEvents().some(e=>e.stage==="plan"&&e.cues.some(c=>c.key.startsWith("pendingStart:minute:"))),{timeout:6000}).toBe(true);
    const cue=server.nativeEvents().find(e=>e.stage==="plan"&&e.cues.some(c=>c.key.startsWith("pendingStart:minute:"))).cues.find(c=>c.key.startsWith("pendingStart:minute:"));
    expect(Math.abs(cue.at-(before.timerClock.startedAt-60000-300))).toBeLessThan(1);
    const stops=server.nativeEvents().filter(e=>e.stage==="stop").length;
    await page.waitForTimeout(500);
    expect(server.nativeEvents().filter(e=>e.stage==="stop")).toHaveLength(stops);
    await expect.poll(()=>server.nativeEvents().filter(e=>e.stage==="played"&&e.key.startsWith("pendingStart:minute:")).length,{timeout:10000}).toBe(1);
    await page.evaluate(()=>syncFromServer({forceApply:true,skipBurst:true}));
    expect(server.nativeEvents().filter(e=>e.stage==="played"&&e.key.startsWith("pendingStart:minute:"))).toHaveLength(1);
    expect((await server.state()).startedAt).toBe(before.startedAt);
    expect(await page.evaluate(()=>state.countdownOnly)).toBe(preset==="final");
  },{integerWallClock:true,nativeAudioCoordinatorSource:process.env.FDV_TEST_NATIVE_AUDIO_BASELINE||null});
});
