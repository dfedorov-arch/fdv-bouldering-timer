"use strict";
const {test,expect}=require("@playwright/test");
const {fixture}=require("../helpers/controlled-clock-server");
const path=require("node:path");
async function setup(browser,run){
  const cleanup=[],contexts=[],errors=[];
  try{
    const server=await fixture({after:fn=>cleanup.push(fn)},"darwin",{liveClocks:true,requestTimeoutMs:4000});
    await server.action({type:"primary",primaryClientId:"clock-test"});
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,
      userAgent:"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 SamsungBrowser/28.0 Mobile Safari/537.36"});contexts.push(context);
    await context.addInitScript(()=>{
      sessionStorage.setItem("boulderingTimerClientId","delivery-phone");
      window.dropStateEvents=false;
      const Native=window.EventSource;
      window.EventSource=class extends Native{
        addEventListener(name,listener,options){return super.addEventListener(name,event=>{
          if(window.dropStateEvents&&["state","audio-test"].includes(name))return;
          listener.call(this,event);
        },options);}
      };
    });
    const phone=await context.newPage();phone.on("pageerror",error=>errors.push(error.message));
    await phone.goto(server.baseUrl,{waitUntil:"domcontentloaded"});
    await phone.waitForFunction(()=>!clockCalibrationPending&&eventSourceConnected);
    async function client(){return (await server.state()).clients.find(c=>c.id==="delivery-phone");}
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    await run({server,phone,context,contexts,client,errors});
  }finally{for(const c of contexts)await c.close();for(const fn of cleanup.reverse())await fn();}
}
test("start, pause, seek, reset, settings and language are confirmed only after the screen applies them",async({browser})=>{
  await setup(browser,async({server,phone,client,errors})=>{
    for(const action of [
      {type:"settings",activePreset:"final",settings:{rotationMinutes:4,breakSeconds:0,oneShot:true}},
      {type:"start",activePreset:"final",settings:{rotationSeconds:240,breakSeconds:0,oneShot:true},startMode:"manual",startHours:"",startMinutes:"",startAudioLead:true},
      {type:"pause"},{type:"seek",elapsed:42},{type:"reset"},{type:"language",language:"en"}
    ]){
      if(action.type==="pause")await phone.waitForTimeout(700);
      const state=await server.action(action);
      await expect.poll(async()=>{const c=await client();return c.delivery.version===state.version?c.delivery.status:"old";}).toBe("applied");
      expect(await phone.evaluate(()=>window.FDVStateDelivery.report().deliveryApplied)).toBe(state.delivery.key);
    }
    expect(errors).toEqual([]);
  });
});
test("HTTP immediately applies a missed command and repairs SSE without resetting the measured clock",async({browser})=>{
  await setup(browser,async({server,phone,client,errors})=>{
    const before=await phone.evaluate(()=>{dropStateEvents=true;return {samples:syncSamples.length,instance:lastServerInstanceId,restarts:sseRestarts};});
    const started=Date.now();const state=await server.action({type:"language",language:"en"});
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    expect(Date.now()-started).toBeLessThan(6000);
    await expect(phone.locator("html")).toHaveAttribute("lang","en");
    const after=await phone.evaluate(()=>({samples:syncSamples.length,instance:lastServerInstanceId,restarts:sseRestarts,pending:clockCalibrationPending,applied:FDVStateDelivery.report().deliveryApplied}));
    expect(after.instance).toBe(before.instance);expect(after.pending).toBe(false);expect(after.restarts).toBeGreaterThan(before.restarts);expect(after.samples).toBeGreaterThanOrEqual(before.samples);
    expect(after.applied).toBe(state.delivery.key);
    expect(errors).toEqual([]);
  });
});
test("a received snapshot with an apply error never turns green from the advanced state version",async({browser})=>{
  await setup(browser,async({server,phone,client})=>{
    await phone.evaluate(()=>{window.originalFullscreen=applyViewerFullscreenPreference;applyViewerFullscreenPreference=()=>{throw Error("injected apply failure");};});
    const state=await server.action({type:"language",language:"en"});
    await expect.poll(async()=>(await client()).delivery.status).toBe("received");
    expect(await phone.evaluate(()=>FDVStateDelivery.report().deliveryApplied)).not.toBe(state.delivery.key);
    await phone.evaluate(()=>{applyViewerFullscreenPreference=originalFullscreen;void syncFromServer({forceApply:true});});
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
  });
});
test("a diagnostic sound command falls back to HTTP once and expired copies are not replayed",async({browser})=>{
  await setup(browser,async({server,phone,client})=>{
    await phone.evaluate(()=>{dropStateEvents=true;window.processedSoundTests=[];handleAudioTest=async command=>{processedSoundTests.push(command.id);};});
    await server.action({type:"audioTest",targetClientId:"delivery-phone",kind:"start"});
    await expect.poll(async()=>phone.evaluate(()=>processedSoundTests.length)).toBe(1);
    await expect.poll(async()=>(await client()).delivery.eventStatus).toBe("applied");
    await phone.evaluate(async()=>{await syncFromServer({forceApply:true});await syncFromServer({forceApply:true});});
    expect(await phone.evaluate(()=>processedSoundTests.length)).toBe(1);
    await phone.evaluate(()=>{FDVApplyDeliveryEvent("audio-test",{id:"expired-test",deliveryId:"expired-copy",deliveryExpiresAt:serverNow()-100});});
    expect(await phone.evaluate(()=>processedSoundTests.length)).toBe(1);
    expect(await phone.evaluate(()=>JSON.parse(FDVStateDelivery.report().deliveryEvents).find(r=>r.id==="expired-copy").result)).toBe("expired");
    await phone.evaluate(()=>FDVApplyDeliveryEvent("audio-test",{id:"obsolete-test",deliveryId:"obsolete-copy",deliveryExpiresAt:serverNow()+2000,deliveryStateKey:"superseded-state"}));
    expect(await phone.evaluate(()=>processedSoundTests.length)).toBe(1);
  });
});
test("Legacy acknowledges its own completed render and mode commands recover through HTTP",async({browser})=>{
  await setup(browser,async({server,phone,client,contexts})=>{
    await phone.evaluate(()=>{dropStateEvents=true;});
    await server.action({type:"legacyMode",targetClientId:"delivery-phone",enabled:true});
    await expect(phone).toHaveURL(/legacy\.html/);
    await expect.poll(async()=>{const c=await client();return c.legacyViewer&&c.delivery.status==="applied";}).toBe(true);
    await server.action({type:"language",language:"en"});
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    await server.action({type:"legacyMode",targetClientId:"delivery-phone",enabled:false});
    await expect(phone).not.toHaveURL(/legacy\.html/);
    await expect.poll(async()=>{const c=await client();return !c.legacyViewer&&c.delivery.status==="applied";}).toBe(true);
  });
});
test("operator shows clear receipts without expanding the diagnostic chip row",async({browser})=>{
  await setup(browser,async({server,phone,client,contexts})=>{
    const c=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(c);
    await c.addInitScript(()=>sessionStorage.setItem("boulderingTimerClientId","clock-test"));
    const operator=await c.newPage();await operator.goto(server.baseUrl,{waitUntil:"domcontentloaded"});
    await operator.waitForFunction(()=>!clockCalibrationPending&&isPrimaryClient);
    const dot=operator.locator('.browser-delivery-status[data-delivery-status="applied"]').first();
    await expect(dot).toBeVisible();await expect(dot).toHaveText("");
    await expect(dot).toHaveAttribute("title",/^Применено\./);
    await expect(dot).toHaveAttribute("aria-label",/^Применено\./);
    expect(await dot.evaluate(node=>node.parentElement.tagName)).toBe("STRONG");
    expect(await dot.boundingBox()).toMatchObject({width:8,height:8});
    const circle=await dot.boundingBox(),ip=await dot.locator("..").locator(".browser-heading-address").boundingBox();
    expect(Math.abs(circle.y+circle.height/2-ip.y-ip.height/2)).toBeLessThan(2);
    expect((await dot.locator("..").boundingBox()).height).toBeLessThan(20);
    expect(await dot.locator("..").locator(".browser-heading-address").evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    await expect(operator.locator(".browser-item > .browser-delivery-status")).toHaveCount(0);
    await operator.locator("#browserList").screenshot({path:path.resolve(__dirname,"../../help-assets/command-delivery.png")});
    await server.action({type:"language",language:"en"});
    await expect(operator.locator('.browser-delivery-status[data-delivery-status="applied"]').first()).toHaveAttribute("title",/^Applied\./);
    await operator.locator("#browserList").screenshot({path:path.resolve(__dirname,"../../help-assets/command-delivery-en.png")});
    await operator.evaluate(()=>revealControlsIfAllowed());
    await operator.locator('[data-audio-client="clock-test"]').click();
    await server.action({type:"language",language:"ru"});
    await expect(operator.locator('[data-delivery-client="clock-test"]')).toHaveAttribute("title",/^Применено\./);
    await expect(operator.locator('[data-delivery-client="clock-test"]')).toHaveText("");
  });
});


test("unacknowledged commands repair the stream in three seconds and HTTP remains a bounded fallback",async({browser})=>{
  await setup(browser,async({server,phone,client,errors})=>{
    await phone.evaluate(()=>{dropStateEvents=true;});
    await phone.route("**/api/state?**",route=>route.abort());
    const before=await phone.evaluate(()=>eventStreamGeneration),began=Date.now();
    const command=await server.action({type:"language",language:"en"});
    await expect.poll(()=>phone.evaluate(()=>eventStreamGeneration),{timeout:6000}).toBeGreaterThan(before);
    expect(Date.now()-began).toBeLessThan(6000);
    expect((await client()).delivery.status).not.toBe("applied");
    await phone.unroute("**/api/state?**");
    await phone.evaluate(()=>{dropStateEvents=false;});
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    expect((await server.state()).version).toBe(command.version);
    expect(errors).toEqual([]);
  });
});


test("visible start-list edits are confirmed after their actual deferred render",async({browser})=>{
  await setup(browser,async({server,phone,client,errors})=>{
    await server.action({type:"startLists",startLists:[{headers:["#","ФИО"],rows:[["1","Список до изменения"]],routeCount:4}]});
    await server.action({type:"startListEnabled",enabled:true});
    await server.action({type:"startListDisplay",targetClientId:"delivery-phone",listIndex:0,enabled:true});
    await expect(phone.locator("#startListPanel")).toContainText("Список до изменения");
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    const next=await server.action({type:"startLists",startLists:[{headers:["#","ФИО"],rows:[["1","Изменение подтверждено"]],routeCount:4}]});
    await expect.poll(async()=>{const c=await client();return c.delivery.version===next.version?c.delivery.status:"old";}).toBe("applied");
    await expect(phone.locator("#startListPanel")).toContainText("Изменение подтверждено");
    expect(errors).toEqual([]);
  });
});


test("a blocked fullscreen command stays received and does not block confirmation of a later valid setting",async({browser})=>{
  await setup(browser,async({server,phone,client,errors})=>{
    await phone.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.reject(Error("gesture required"));});
    await server.action({type:"instancesFullscreen",enabled:true});
    await expect.poll(async()=>{const c=await client();return c.delivery.status+":"+c.delivery.blocked;}).toBe("received:fullscreen");
    await server.action({type:"instancesFullscreen",enabled:false});
    await expect.poll(async()=>(await client()).delivery.status).toBe("applied");
    expect(errors).toEqual([]);
  });
});
