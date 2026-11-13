"use strict";
const {test,expect}=require("@playwright/test");
const currentBuild=Number(require("node:fs").readFileSync(require("node:path").resolve(__dirname,"../../serve-bouldering-timer.js"),"utf8").match(/const BUILD_NUMBER = (\d+);/)[1]);
const {fixture}=require("../helpers/controlled-clock-server");
async function run(browser, fn, {touch=false,ios=false}={}) {
  const cleanups=[];
  const context=await browser.newContext({hasTouch:touch,isMobile:touch,viewport:{width:393,height:852},...(ios?{userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"}:{})});
  try {
    const server=await fixture({after:f=>cleanups.push(f)},"darwin",{liveClocks:true});
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await context.addInitScript(c=>{
      sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);
      const Real=window.AudioContext;
      window.unlockProbe={mode:"pending",calls:[],pending:[],primeThrows:false};
      window.AudioContext=class extends Real {
        constructor(){super();this.blocked=true;window.unlockProbe.contexts=(window.unlockProbe.contexts||0)+1;}
        get state(){return super.state === "closed" ? "closed" : this.blocked ? "suspended" : super.state;}
        resume(){
          const p=window.unlockProbe;
          p.calls.push({active:navigator.userActivation?.isActive,mode:p.mode});
          if(p.mode==="reject")return Promise.reject(new DOMException("blocked","NotAllowedError"));
          if(p.mode==="resolved-suspended")return Promise.resolve();
          if(p.mode==="pending")return new Promise((resolve,reject)=>p.pending.push({resolve,reject}));
          this.blocked=false;
          return super.resume().then(()=>this.dispatchEvent(new Event("statechange")));
        }
        createBufferSource(){if(window.unlockProbe.primeThrows)throw new DOMException("prime failure","InvalidStateError");return super.createBufferSource();}
      };
    },await server.credentials("clock-test"));
    const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(server.baseUrl+"/?perf=1",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>!clockCalibrationPending);
    await fn(page,server);expect(errors).toEqual([]);
  } finally {await context.close();for(const f of cleanups.reverse())await f();}
}

test("pending/rejected/resolved-but-suspended audio stays red and is recorded in perf=1",async({browser})=>{
  await run(browser,async(page,server)=>{
    for(const mode of ["pending","reject","resolved-suspended"]) {
      await page.evaluate(async mode=>{unlockProbe.mode=mode;await unlockAudio(false,"test-"+mode);await syncFromServer();},mode);
      const diag=await page.evaluate(()=>({d:clientDiagnostics(),s:FDVPerformanceDiagnostics.snapshot()}));
      expect(diag.d.audioUnlocked).toBe(false);expect(diag.d.audioContextState).toBe("suspended");
      expect(diag.s.audio.unlock.result).toBe(mode==="pending"?"resume-pending":mode==="reject"?"resume-rejected":"resume-not-running");
      expect(diag.s.audio.forcedByDiagnostics).toBe(false);
      await expect(page.locator('[data-audio-client="clock-test"]')).toHaveClass(/bad/);
      if(mode==="reject")expect(diag.d.audioUnlockError).toBe("NotAllowedError");
    }
    expect(await page.evaluate(()=>audioUnlockEvents.length)).toBeGreaterThan(0);
    expect((await server.state()).running).toBe(false);
    // A stale rejection must not undo a later successful gesture/context state.
    await page.evaluate(async()=>{unlockProbe.mode="run";await unlockAudio(false,"retry");unlockProbe.pending[0].reject(new DOMException("old","NotAllowedError"));await Promise.resolve();await syncFromServer();});
    await expect(page.locator('[data-audio-client="clock-test"]')).toHaveClass(/good/);
    expect(await page.evaluate(()=>clientDiagnostics().audioUnlocked)).toBe(true);
    expect(await page.evaluate(()=>audioUnlockDiagnostics.result)).toBe("running");
    await page.evaluate(async()=>{audioContext.blocked=true;audioContext.dispatchEvent(new Event("statechange"));await syncFromServer();});
    await expect(page.locator('[data-audio-client="clock-test"]')).toHaveClass(/bad/);
    await page.evaluate(async()=>{window.oldAudioContext=audioContext;await audioContext.close();await unlockAudio(false,"closed-retry");oldAudioContext.dispatchEvent(new Event("statechange"));await syncFromServer();});
    expect(await page.evaluate(()=>unlockProbe.contexts)).toBe(2);
    await expect(page.locator('[data-audio-client="clock-test"]')).toHaveClass(/good/);
  });
});

test("a trusted mobile tap retries pending resume before a failing silent prime",async({browser})=>{
  await run(browser,async(page,server)=>{
    await page.evaluate(()=>{unlockAudio(false,"before-gesture");});
    expect(await page.evaluate(()=>clientDiagnostics().audioUnlocked)).toBe(false);
    await page.evaluate(()=>{unlockProbe.mode="run";unlockProbe.primeThrows=true;});
    await page.locator("h1").tap();
    await page.waitForFunction(()=>clientDiagnostics().audioUnlocked);
    const events=await page.evaluate(()=>audioUnlockEvents);
    expect(events.some(e=>e.stage==="resume-request" && ["pointerup","touchend"].includes(e.source) && e.userActivationActive===true)).toBe(true);
    expect(events.some(e=>e.stage==="silent-prime-rejected")).toBe(true);
    await page.evaluate(()=>{unlockProbe.primeThrows=false;});
    await server.start({settings:{rotationSeconds:60,breakSeconds:15,oneShot:false},elapsedBeforePause:10});
    await page.waitForFunction(()=>state.running);
    const before=await server.state();
    await page.evaluate(async()=>{await unlockAudio(false,"already-running");});
    expect((await server.state()).timerClock.startedAt).toBe(before.timerClock.startedAt);
    expect((await server.state()).version).toBe(before.version);
    expect(await page.evaluate(()=>FDVPerformanceDiagnostics.snapshot().audio.forcedByDiagnostics)).toBe(false);
  },{touch:true});
});


test("iOS standalone uses confirmed HTML playback independently of a suspended Web Audio context",async({browser})=>{
  await run(browser,async(page)=>{
    const result=await page.evaluate(async()=>{
      await unlockAudio(false,"ios-suspended");
      standaloneMode=true;els.soundToggle.checked=true;
      window.htmlPlayProbe=[];
      HTMLMediaElement.prototype.play=function(){return new Promise((resolve,reject)=>htmlPlayProbe.push({resolve,reject}));};
      playImmediateGestureAudio("start");
      const before=clientDiagnostics().audioUnlocked;
      htmlPlayProbe[0].resolve();await Promise.resolve();
      const after=clientDiagnostics().audioUnlocked;
      playImmediateGestureAudio("start");htmlPlayProbe[1].reject(new DOMException("blocked","NotAllowedError"));await Promise.resolve();
      return {before,after,rejected:clientDiagnostics().audioUnlocked,context:audioContext.state};
    });
    expect(result).toEqual({before:false,after:true,rejected:false,context:"suspended"});
  },{ios:true});
});


test("audio statechange during mouse down defers standalone card refresh until click",async({browser})=>{
  await run(browser,async page=>{
    await page.evaluate(()=>{window.refreshCount=0;refreshStandaloneBrowserList=()=>{refreshCount++;};unlockProbe.mode="run";});
    await page.locator("h1").hover();await page.mouse.down();
    try {
      await page.waitForFunction(()=>audioContext?.state==="running");
      expect(await page.evaluate(()=>refreshCount)).toBe(0);
    } finally {await page.mouse.up();}
    await expect.poll(()=>page.evaluate(()=>refreshCount)).toBeGreaterThan(0);
  });
});


for (const android of [false,true]) test("standalone "+(android?"Android":"HTML")+" confirms real Web Audio readiness after a tap",async({browser})=>{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:393,height:852},offline:true});
 try {
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  const file=require("node:path").resolve(__dirname,android?"../../android/app/src/main/assets/timer.html":"../../docs/standalone.html");
  await page.goto(require("node:url").pathToFileURL(file).href,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>standaloneMode);
  await page.locator("h1").tap();
  await page.waitForFunction(()=>clientDiagnostics().audioUnlocked);
  expect(await page.evaluate(()=>({build:pageBuildNumber,backend:FDVPerformanceDiagnostics.snapshot().audio.playbackBackend,ready:clientDiagnostics().audioUnlocked}))).toEqual({build:currentBuild,backend:"web-audio",ready:true});
  expect(errors).toEqual([]);
 } finally {await context.close();}
});
