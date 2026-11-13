"use strict";

const { test, expect } = require("@playwright/test");
const { fixture } = require("../helpers/controlled-clock-server");

async function withDisplays(browser, run) {
  const cleanup = [], contexts = [], pages = [], errors = [];
  try {
    const server = await fixture({after:fn => cleanup.push(fn)}, "darwin", {liveClocks:true});
    for (const id of ["final-operator", "final-screen"]) {
      const context = await browser.newContext(); contexts.push(context);
      await context.addInitScript(c=>{sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);},await server.credentials(id));
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

test("clock refinements cannot replay the same manual start event, but a new run can sound",async({browser})=>{
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);
    const ids=[];
    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await reset(server,pages);
      await manualStart(pages);
      const id=(await server.state()).audioRunId;expect(id).toMatch(/^[0-9a-f-]{36}$/);ids.push(id);
      await pages[0].waitForTimeout(250);
      for(const page of pages)await page.evaluate(()=>{
        state.serverStartedAt+=3;rescheduleStandaloneSignals({includeRecentPhaseSignal:true});
        for(const item of scheduledAudioNodes)if(item.signalKey?.includes(":rotation:start:"))clearTimeout(item.playedTimer);
      });
      await pages[0].waitForTimeout(450);
      for(const page of pages)await page.evaluate(()=>rescheduleStandaloneSignals({forceStopAudio:true,includeRecentPhaseSignal:true}));
      await pages[0].waitForTimeout(1350);
      for(const page of pages)await page.evaluate(()=>{state.serverStartedAt+=40;rescheduleStandaloneSignals({includeRecentPhaseSignal:true});});
      await pages[0].waitForTimeout(500);
      for(const page of pages){const result=await signals(page);expect(result.starts).toHaveLength(1);expect(result.starts[0].key).toContain(id);}
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});

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

async function suspendBeforeStart(pages, delayMs) {
  for (const page of pages) await page.evaluate(async delay => {
    window.recoveryStartCalls = [];
    window.recoveryWarmCalls = 0;
    const realWake = wakeAudioOutput;
    for(const name of ["playBuffer","beepSynthetic"]){
      const original = window[name];
      window[name] = function(kind,...args){
        const at = serverNow(), target = audioServerTime(state.serverStartedAt);
        const accepted = original(kind,...args);
        if(kind === "start" && accepted)recoveryStartCalls.push({at,target});
        return accepted;
      };
    }
    wakeAudioOutput = function(...args) { recoveryWarmCalls++; return realWake(...args); };
    const resume = audioContext.resume.bind(audioContext);
    let gate;
    audioContext.resume = () => gate ||= new Promise((resolve,reject) => {
      setTimeout(() => resume().then(resolve,reject), delay);
    });
    await audioContext.suspend();
    activeSettingsFromDraft = () => ({...state.activeSettings,rotationSeconds:60});
  }, delayMs);
}

for (const final of [false,true]) for (const delay of [950,2600,4200]) {
  test((final?"Final":"Classic")+" idle audio resume "+delay+"ms respects the three-second start window",async({browser})=>{
    await withDisplays(browser,async(server,pages)=>{
      await reset(server,pages,final);
      await suspendBeforeStart(pages,delay);
      const warmedSynchronously = await pages[0].evaluate(async()=>{
        const started = startTimer(), warmed = recoveryWarmCalls;
        await started; return warmed;
      });
      expect(warmedSynchronously).toBeGreaterThan(0);
      await Promise.all(pages.map(p=>p.waitForFunction(()=>state.running)));
      const anchor = (await server.state()).timerClock.startedAt;
      await pages[0].waitForTimeout(delay+600);
      for(const p of pages){
        await p.waitForFunction(()=>audioContext.state==="running");
        const calls=await p.evaluate(()=>recoveryStartCalls);
        expect(calls).toHaveLength(delay<3600?1:0);
        for(const call of calls)expect(call.at-call.target).toBeLessThanOrEqual(3000);
        await p.evaluate(()=>{checkAudioSchedulerHealth(true);rescheduleStandaloneSignals({futureOnly:true});});
        await p.waitForTimeout(100);
        expect(await p.evaluate(()=>recoveryStartCalls.length)).toBe(calls.length);
      }
      expect(Math.abs((await server.state()).timerClock.startedAt-anchor)).toBeLessThan(1);
      expect((await server.state()).running).toBe(true);
    });
  });
}

test("a manual start is never replayed after a thirty-second audio resume",async({browser})=>{
  test.setTimeout(60000);
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);
    await suspendBeforeStart(pages,30500);
    await manualStart(pages);
    await pages[0].waitForTimeout(31200);
    for(const p of pages){
      await p.waitForFunction(()=>audioContext.state==="running");
      expect(await p.evaluate(()=>recoveryStartCalls)).toEqual([]);
    }
    expect((await server.state()).running).toBe(true);
  });
});

for(const action of ["pause","reset"])test(action+" during audio resume cancels the pending manual start",async({browser})=>{
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);
    await suspendBeforeStart(pages,1800);
    await manualStart(pages);
    await pages[0].waitForTimeout(800);
    await server.action({type:action});
    await Promise.all(pages.map(p=>p.waitForFunction(()=>!state.running)));
    await pages[0].waitForTimeout(1500);
    for(const p of pages)expect(await p.evaluate(()=>recoveryStartCalls)).toEqual([]);
  });
});

test("recovering a manual start without a decoded file uses synthesis instead of unbounded HTML loading",async({browser})=>{
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);
    await suspendBeforeStart(pages,950);
    for(const p of pages)await p.evaluate(()=>{
      audioBuffers.start=null;window.htmlStartAttempts=0;
      const original=playHtmlAudio;
      playHtmlAudio=function(kind){if(kind==="start")htmlStartAttempts++;return original(kind);};
    });
    await manualStart(pages);await pages[0].waitForTimeout(1700);
    for(const p of pages){
      expect(await p.evaluate(()=>htmlStartAttempts)).toBe(0);
      expect(await p.evaluate(()=>recoveryStartCalls.length)).toBe(1);
    }
  });
});

test("changing sound correction after a manual start does not replay that run's cue",async({browser})=>{
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);await manualStart(pages);await pages[0].waitForTimeout(1100);
    for(const offset of [100,-300]){
      for(const p of pages){
        await server.action({type:"audioOffset",targetClientId:await p.evaluate(()=>clientId),offset});
        await p.waitForFunction(value=>audioUserOffsetMs===value,offset);
      }
      await pages[0].waitForTimeout(150);
      for(const p of pages)expect((await signals(p)).starts).toHaveLength(1);
    }
  });
});

test("Final readiness repeats quiet warm-up every ten seconds and Start ends the repetition",async({browser})=>{
  await withDisplays(browser,async(server,pages)=>{
    await reset(server,pages);
    for(const p of pages)await p.evaluate(()=>{
      window.waitWarmCalls=[];const original=wakeAudioOutput;
      wakeAudioOutput=function(kind,isCurrent){
        if(kind==="prewarm"&&typeof isCurrent==="function"&&finalStartPrewarmEligible())waitWarmCalls.push(performance.now());
        return original(kind,isCurrent);
      };
    });
    await server.start({activePreset:"final",startMode:"scheduled",startHours:"",startMinutes:"",settings:{rotationSeconds:60,breakSeconds:0,oneShot:true}});
    await Promise.all(pages.map(p=>p.waitForFunction(()=>state.waitingForManualStart)));
    for(const p of pages){
      await expect.poll(()=>p.evaluate(()=>waitWarmCalls.length),{timeout:12500}).toBeGreaterThanOrEqual(2);
      const calls=await p.evaluate(()=>waitWarmCalls);expect(calls[1]-calls[0]).toBeGreaterThanOrEqual(9900);
    }
    for(const p of pages)await p.evaluate(()=>{activeSettingsFromDraft=()=>({...state.activeSettings,rotationSeconds:60});});
    await manualStart(pages);
    const counts=await Promise.all(pages.map(p=>p.evaluate(()=>waitWarmCalls.length)));
    await pages[0].waitForTimeout(11000);
    for(let i=0;i<pages.length;i++)expect(await pages[i].evaluate(()=>waitWarmCalls.length)).toBe(counts[i]);
  });
});

test("Final warm-up planner is embedded in standalone HTML and Android",async({browser})=>{
 for(const android of [false,true]){
  const context=await browser.newContext({offline:true});
  try{const p=await context.newPage();
   const file=require("node:path").resolve(__dirname,android?"../../android/app/src/main/assets/timer.html":"../../docs/standalone.html");
   await p.goto(require("node:url").pathToFileURL(file).href);await p.waitForFunction(()=>standaloneMode);
   expect(await p.evaluate(()=>FDVFinalStartPrewarm.intervalMs)).toBe(10000);
   const result=await p.evaluate(()=>{
    const originalNow=serverNow;let now=serverNow();serverNow=()=>now;
    let calls=0;wakeAudioOutput=()=>{calls++;};state.activeSettings={rotationSeconds:60,breakSeconds:0,oneShot:true};
    state.running=true;state.countdownOnly=true;state.waitingForManualStart=false;
    state.serverStartedAt=serverNow()+10001;tickFinalStartPrewarm();const before=calls;
    now+=2;tickFinalStartPrewarm();serverNow=originalNow;
    return {before,after:calls};
   });expect(result).toEqual({before:0,after:1});
  }finally{await context.close();}
 }
});
