"use strict";

const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { fixture } = require("../helpers/controlled-clock-server");

async function withClockServer(run, options = {}) {
  const cleanup = [];
  try {
    const server = await fixture({ after: callback => cleanup.push(callback) }, "darwin", { liveClocks: true, ...options });
    await run(server);
  } finally {
    for (const callback of cleanup.reverse()) await callback();
  }
}

test("hidden audio prepares ten seconds ahead and accepts delayed technical wakes without moving signal targets", async ({browser}) => {
  await withClockServer(async server => {
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:40});
    const context=await browser.newContext();
    try {
      const page=await context.newPage(),errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.addInitScript(()=>sessionStorage.setItem("boulderingTimerClientId","clock-test"));
      await page.goto(server.baseUrl+"/?perf=3",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>!clockCalibrationPending);
      await page.evaluate(async()=>{await unlockAudio(false);await loadAudioBuffers();});
      await page.waitForFunction(()=>audioContext?.state==="running"&&audioContext.currentTime>0.3);
      const before=await page.evaluate(()=>{
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});
        document.dispatchEvent(new Event("visibilitychange"));
        window.warmupProbe={events:[],tones:[]};
        const originalFinish=finishPerformancePrewarmPlan,originalTone=playSoundWarmTone;
        finishPerformancePrewarmPlan=(key,stage,details={})=>{
          window.warmupProbe.events.push({key,stage,...details});return originalFinish(key,stage,details);
        };
        playSoundWarmTone=kind=>{window.warmupProbe.tones.push(kind);return originalTone(kind);};
        rescheduleStandaloneSignals();
        const segment=getCurrentSegment(elapsedSeconds());
        const warningTarget=serverTimeForElapsed(segment.end-5);
        const earlyTarget=audioServerTime(warningTarget)-10000;
        const plan=Array.from(performancePendingPrewarmPlans.values()).find(p=>p.kind==="prewarm"&&Math.abs(p.targetServerTimeMs-earlyTarget)<0.01);
        window.warmupProbe.earlyKey=plan?.planKey;
        window.warmupProbe.anchor=state.serverStartedAt;
        return {hasEarly:Boolean(plan),lead:warningTarget+audioUserOffsetMs-plan?.targetServerTimeMs};
      });
      expect(before.hasEarly).toBe(true);expect(Math.abs(before.lead-10000)).toBeLessThan(0.01);
      await page.evaluate(()=>{
        const segment=getCurrentSegment(elapsedSeconds()),target=serverNow()+100;
        window.warmupProbe.lateKey=performancePrewarmPlanKey(segment,audioServerTime(target),"warm");
        scheduleSignalAt(segment,target,"warm",false);
        const until=performance.now()+1000;while(performance.now()<until){}
      });
      await page.waitForFunction(()=>window.warmupProbe.events.some(e=>e.key===window.warmupProbe.lateKey&&e.stage==="prewarm-fire"&&e.latenessMs>500));
      await page.waitForFunction(()=>window.warmupProbe.events.some(e=>e.key===window.warmupProbe.earlyKey&&e.stage==="prewarm-fire"));
      const result=await page.evaluate(()=>({anchor:state.serverStartedAt===window.warmupProbe.anchor,
        warnGrace:signalLateGraceMs.warn,minuteGrace:signalLateGraceMs.minute,hidden:document.hidden}));
      expect(result).toEqual({anchor:true,warnGrace:300,minuteGrace:2000,hidden:true});
      await server.action({type:"pause"});await page.waitForFunction(()=>!state.running);
      const paused=await page.evaluate(()=>{
        const count=window.warmupProbe.tones.length;
        scheduleSignalAt(getCurrentSegment(elapsedSeconds()),serverNow()+50,"prewarm",false);return count;
      });
      await page.waitForTimeout(200);
      expect(await page.evaluate(()=>window.warmupProbe.tones.length)).toBe(paused);
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

for (const mobile of [false,true]) test(`hidden ${mobile?"mobile":"desktop"} playback retains Web Audio nodes, survives a JS gap and obeys remote Pause/Stop`, async ({browser}) => {
  await withClockServer(async server => {
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:68});
    const context = await browser.newContext(mobile ? {
      userAgent:"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
      viewport:{width:393,height:852},isMobile:true,hasTouch:true
    } : {});
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(() => sessionStorage.setItem("boulderingTimerClientId","clock-test"));
      await page.goto(server.baseUrl+"/?perf=3",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(() => !clockCalibrationPending);
      await page.evaluate(async () => {
        await unlockAudio(false); await loadAudioBuffers();
        rescheduleStandaloneSignals();
        scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()),serverNow()+20000,"minute",false,true);
        checkAudioSchedulerHealth(true);
        const beforeHide = scheduledAudioNodes.slice(), beforeHideGeneration = audioScheduleGeneration;
        // Simulate visibility deterministically; audio nodes and the JS stall
        // below are real. Headless tab activation does not model OS suspension.
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});
        window.backgroundTest = {generation:audioScheduleGeneration,context:audioContext,anchor:state.serverStartedAt};
        document.dispatchEvent(new Event("visibilitychange"));
        if (resumeSnapPending) throw new Error("Ordinary hiding blocked background phase planning behind a display snap");
        if (audioScheduleGeneration!==beforeHideGeneration || !beforeHide.every(n=>scheduledAudioNodes.includes(n))) {
          throw new Error("Visibility alone cancelled a submitted sound");
        }
      });
      await page.waitForFunction(() => scheduledAudioNodes.filter(n=>n.kind==="warn").length>=3);
      const gap = await page.evaluate(() => {
        checkAudioSchedulerHealth(true);
        const nodes = scheduledAudioNodes.slice();
        const before = audioSchedulerHealth.recoveries;
        const generation = audioScheduleGeneration;
        const until = performance.now()+4400;
        while (performance.now()<until) {} // Delay JS, not the audio thread.
        checkAudioSchedulerHealth(true);
        return {same:nodes.every(n=>scheduledAudioNodes.includes(n)&&!n.cancelled),
          recovered:audioSchedulerHealth.recoveries-before,
          generation:audioScheduleGeneration-generation,
          context:audioContext===window.backgroundTest.context,
          anchor:state.serverStartedAt===window.backgroundTest.anchor,
          audioClockError:audioSchedulerHealth.audioClockErrorMs};
      });
      expect(gap).toMatchObject({recovered:1,context:true,anchor:true});
      // The real headless audio clock can itself lose progress under load.
      // Assert the matching recovery policy from its measured progress.
      if (Math.abs(gap.audioClockError)>250) {
        expect(gap.generation).toBe(1);
        expect(gap.same).toBe(false);
      } else {
        expect(gap.generation).toBe(0);
        expect(gap.same).toBe(true);
      }
      await page.waitForFunction(() => Array.from(playedSignalKeys).some(key=>key.startsWith("rotationBoundary:2:rotation:")),null,{timeout:12000});
      const result = await page.evaluate(() => {
        const events = performanceAudioScheduleEvents;
        const starts = events.filter(e=>e.stage==="node"&&e.signalKey.startsWith("rotationBoundary:2:rotation:"));
        return {starts:starts.length,maxError:Math.max(...starts.map(e=>Math.abs(e.targetErrorMs))),
          hidden:document.hidden,pending:clockCalibrationPending};
      });
      expect(result.starts).toBe(1);
      expect(result.maxError).toBeLessThan(50);
      expect(result.hidden).toBe(true);
      expect(result.pending).toBe(false);
      for (const type of ["pause","reset"]) {
        await page.evaluate(() => scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()),serverNow()+20000,"minute",false,true));
        await expect.poll(()=>page.evaluate(()=>scheduledAudioNodes.some(n=>n.kind==="minute"))).toBe(true);
        await server.action({type});
        await page.waitForFunction(()=>!state.running&&scheduledAudioNodes.length===0);
        if (type==="pause") { await server.start(); await page.waitForFunction(()=>state.running); }
      }
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

test("suspended audio is cancelled before resume and freeze blocks hidden scheduling until resume", async ({browser}) => {
  await withClockServer(async server => {
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.start({settings:{rotationSeconds:120,breakSeconds:15,oneShot:false}});
    const context = await browser.newContext();
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror",e=>errors.push(e.message));
      await page.addInitScript(()=>sessionStorage.setItem("boulderingTimerClientId","clock-test"));
      await page.goto(server.baseUrl+"/",{waitUntil:"domcontentloaded"});
      await page.waitForFunction(()=>!clockCalibrationPending);
      const result = await page.evaluate(async () => {
        await unlockAudio(false); await loadAudioBuffers();
        scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()),serverNow()+20000,"minute",false,true);
        const old = scheduledAudioNodes.slice();
        await audioContext.suspend();
        checkAudioSchedulerHealth(true);
        await audioContext.resume();
        checkAudioSchedulerHealth(true);
        const cancelled = old.every(n=>n.cancelled&&!scheduledAudioNodes.includes(n));
        Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});
        Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>"hidden"});
        document.dispatchEvent(new Event("freeze"));
        rescheduleStandaloneSignals();
        const frozen = pageAudioSuspended&&scheduledAudioNodes.length===0;
        document.dispatchEvent(new Event("resume"));
        return {cancelled,frozen,resumed:!pageAudioSuspended,playing:audioContext.state==="running"};
      });
      expect(result).toEqual({cancelled:true,frozen:true,resumed:true,playing:true});
      expect(errors).toEqual([]);
    } finally {await context.close();}
  });
});

test("new screen does not display or schedule a wrong timer when SSE precedes clock calibration", async ({ browser }) => {
  await withClockServer(async server => {
    await server.start({ elapsedBeforePause: 52 });
    const context = await browser.newContext();
    let release;
    try {
      await context.addInitScript(() => {
        const originalNow = Date.now.bind(Date);
        Date.now = () => originalNow() + 5000;
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const held = new Promise(resolve => { release = resolve; });
      await page.route("**/api/state?**", async route => { await held; await route.continue().catch(() => {}); });
      await page.goto(server.baseUrl + "/?perf=3", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(lastServerInstanceId) && state.running);
      await page.evaluate(() => unlockAudio(false));
      await expect(page.locator("#time")).toHaveAttribute("aria-label", "--:--");
      await expect(page.locator("#serverConnectionWarningTitle")).toHaveText("Синхронизация времени");
      expect(await page.evaluate(() => ({pending:clockCalibrationPending,
        nodes:scheduledAudioNodes.length, plans:scheduledSignalKeys.size, played:playedSignalKeys.size})))
        .toEqual({pending:true,nodes:0,plans:0,played:0});
      expect(await page.evaluate(() => {
        saveOfflineSnapshot();
        return localStorage.getItem(offlineSnapshotKey);
      })).toBeNull();
      await page.screenshot({ path: path.resolve(__dirname, "../../help-assets/initial-clock-sync.png") });
      release();
      await page.unroute("**/api/state?**");
      await page.waitForFunction(() => !clockCalibrationPending && state.timerClockVersion === 1);
      await expect(page.locator("#time")).not.toHaveAttribute("aria-label", "--:--");
      await expect(page.locator("#timeMinutes")).not.toHaveText("--");
      expect(await page.evaluate(() => {
        saveOfflineSnapshot();
        return JSON.parse(localStorage.getItem(offlineSnapshotKey)).timerClockVersion;
      })).toBe(1);
      const remote = await server.state();
      expect(Math.abs(await page.evaluate(() => elapsedSeconds()) - remote.elapsed)).toBeLessThan(0.25);
      expect(errors).toEqual([]);
    } finally {
      release?.();
      await context.close();
    }
  });
});

test("launcher language updates Modern and Legacy without moving clock or sound targets",async({browser})=>{
  const token="a".repeat(64);
  await withClockServer(async server=>{
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.start({settings:{rotationSeconds:70,breakSeconds:15,oneShot:false}});
    const context=await browser.newContext();
    try{
      await context.addInitScript(()=>sessionStorage.setItem("boulderingTimerClientId","clock-test"));
      const page=await context.newPage(), legacy=await context.newPage();
      await page.goto(server.baseUrl+"/?perf=3",{waitUntil:"domcontentloaded"});
      await legacy.goto(server.baseUrl+"/legacy.html?clientId=language-legacy",{waitUntil:"domcontentloaded"});
      await page.bringToFront();
      await page.waitForFunction(()=>!clockCalibrationPending);
      await page.waitForFunction(()=>!document.hidden && canPlaySound() && elapsedSeconds()>7.3);
      await page.evaluate(async()=>{
        for(let i=0;i<4;i++)await syncFromServer({skipBurst:true});
        await unlockAudio(false);await loadAudioBuffers();
      });
      // Measure language changes after real audio-device startup settles;
      // startup-clock recovery is independently exercised above.
      await page.waitForFunction(()=>audioContext?.state==="running"&&audioContext.currentTime>0.3
        &&!audioSchedulerHealth.needsReschedule);
      await page.evaluate(()=>{
        checkAudioSchedulerHealth(true);
        const elapsed=elapsedSeconds(), segment=getCurrentSegment(elapsed);
        scheduleSegmentSignals(segment,segment.end-elapsed,segment.end-segment.start,false);
        const minute=scheduledAudioNodes.find(node=>node.kind==="minute");
        window.launcherLanguageTest={key:minute?.signalKey,target:minute?.targetDetails?.targetServerTimeMs,
          anchor:state.serverStartedAt,generation:audioScheduleGeneration};
      });
      expect(await page.evaluate(()=>Boolean(window.launcherLanguageTest.key))).toBe(true);
      const before=await server.state();
      for(const locale of ["en","ru"]){
        const response=await fetch(server.baseUrl+"/api/launcher/language",{method:"POST",headers:{"content-type":"application/json","x-fdv-launcher-token":token},body:JSON.stringify({language:locale})});
        expect(response.status).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang",locale);
        await expect(legacy).toHaveTitle(locale==="en"?/Bouldering timer/:/Таймер болдеринга/);
        expect((await server.state()).timerClock.startedAt).toBe(before.timerClock.startedAt);
        // As with the ordinary browser language button, an SSE version change
        // may rebuild future nodes. The sound target/key and clock must not move.
        const audio=await page.evaluate(()=>({anchor:state.serverStartedAt-window.launcherLanguageTest.anchor,
          same:scheduledAudioNodes.some(node=>node.signalKey===window.launcherLanguageTest.key
            &&node.targetDetails?.targetServerTimeMs===window.launcherLanguageTest.target),
          generation:audioScheduleGeneration-window.launcherLanguageTest.generation}));
        expect(audio).toEqual({anchor:0,same:true,generation:0});
      }
    }finally{await context.close();}
  },{launcherToken:token});
});

test("calendar changes preserve a running screen's clock, timers and already scheduled Web Audio nodes", async ({ browser }) => {
  await withClockServer(async server => {
    await server.start({ settings:{rotationSeconds:125,breakSeconds:15,oneShot:false} });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(server.baseUrl + "/?perf=3", { waitUntil:"domcontentloaded" });
      await page.waitForFunction(() => !clockCalibrationPending && state.timerClockVersion === 1);
      await page.waitForFunction(() => !syncRequestInFlight);
      await page.evaluate(async () => {
        for (let i = 0; i < 6; i += 1) await syncFromServer({skipBurst:true});
        await unlockAudio(false);
        await loadAudioBuffers();
        // A real Web Audio node far enough ahead to survive the assertions.
        scheduleBufferedSignalAt(getCurrentSegment(elapsedSeconds()), serverNow()+30000, "minute", false, true);
        window.clockTest = {
          nodes: scheduledAudioNodes.slice(), clears:0,
          generation: audioScheduleGeneration, startedAt: state.serverStartedAt,
          version: lastServerVersion, elapsed: elapsedSeconds(), perf:performance.now()
        };
        const originalClear = clearSignalTimers;
        clearSignalTimers = (...args) => { window.clockTest.clears += 1; return originalClear(...args); };
      });
      expect(await page.evaluate(() => window.clockTest.nodes.length)).toBeGreaterThan(0);
      for (const offset of [120000, -120000, 0]) {
        server.frame(offset, 0, 0);
        await server.state();
        await page.evaluate(() => syncFromServer({skipBurst:true}));
        const result = await page.evaluate(() => ({
          pending:clockCalibrationPending,
          sameNodes:window.clockTest.nodes.every(node => scheduledAudioNodes.includes(node)),
          clears:window.clockTest.clears,
          generation:audioScheduleGeneration-window.clockTest.generation,
          startShift:state.serverStartedAt-window.clockTest.startedAt,
          versionShift:lastServerVersion-window.clockTest.version,
          elapsedError:elapsedSeconds()-window.clockTest.elapsed-(performance.now()-window.clockTest.perf)/1000,
          syncError:syncQuality.error,
          wallOffset:state.serverWallOffset
        }));
        expect(result.pending).toBe(false);
        expect(result.sameNodes).toBe(true);
        expect(result.clears).toBe(0);
        expect(result.generation).toBe(0);
        expect(Math.abs(result.startShift)).toBeLessThan(0.01);
        expect(result.versionShift).toBe(0);
        expect(Math.abs(result.elapsedError)).toBeLessThan(0.1);
        expect(result.syncError).toBeLessThan(100);
        expect(Math.abs(result.wallOffset-offset)).toBeLessThan(10);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
});
