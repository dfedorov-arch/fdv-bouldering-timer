"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function source(name) {
  const match = html.match(new RegExp(`function ${name}\\([\\s\\S]*?\\) \\{[\\s\\S]*?\\n    \\}`));
  assert.ok(match, name);
  return match[0];
}
function harness({ hidden = true, offset = 0 } = {}) {
  let now = 100000, id = 0, resolveResume;
  const timers = new Map(), tones = [], events = [], resumes = [];
  const segment = {cycle:1, type:"rotation", start:0, end:120};
  const context = vm.createContext({
    document:{hidden}, serverNow:()=>now, performance:{now:()=>now},
    audioUserOffsetMs:offset, audioScheduleGeneration:0,
    state:{running:true,serverStartedAt:300}, pageAudioSuspended:false, clockCalibrationPending:false,
    elapsedSeconds:()=> (now-context.state.serverStartedAt)/1000,
    getCurrentSegment:elapsed=>elapsed<120?segment:{cycle:2,type:"rotation",start:120,end:240},
    canPlaySound:()=>true, serverTimerLookaheadSeconds:1.25, staleSignalGraceMs:500,
    signalTimers:[], transitionSignalTimers:[], performancePendingPrewarmPlans:new Map(),
    performancePrewarmPlanKey:(s,t,k)=>`${k}:${t}`,
    recordPerformancePrewarmLifecycle(){}, observePerformanceAudioContext(){}, recordPerformanceAudioClock(){},
    finishPerformancePrewarmPlan:(key,stage,details)=>events.push({key,stage,...details}),
    playSoundWarmTone:kind=>tones.push({kind,at:now}),
    window:{
      setTimeout(callback,ms) {
        const at=now+Math.max(0,ms);
        timers.set(++id,{callback,at:hidden?Math.ceil(at/1000)*1000:at}); return id;
      }, clearTimeout:id=>timers.delete(id)
    },
    audioContext:{state:"running",resume(){
      resumes.push(now);
      return new Promise(resolve=>{resolveResume=()=>{context.audioContext.state="running";resolve();};});
    }}
  });
  vm.runInContext(`${html.match(/const signalLateGraceMs = \{[\s\S]*?\n    \};/)[0]}
    ${["serverTimeForElapsed","audioServerTime","delayUntilServerTime","isServerSignalCurrent",
      "lateGraceForSignal","scheduleServerTimeoutAt","scheduleSignalAt","wakeAudioOutput"].map(source).join("\n")}`,context);
  function next() {return [...timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];}
  return {context,segment,tones,events,resumes,
    schedule(target,kind="prewarm") {context.scheduleSignalAt(segment,target,kind,false);},
    advance(at) {let t;while((t=next())&&t[1].at<=at){now=t[1].at;timers.delete(t[0]);t[1].callback();}now=at;},
    late(at) {now=at;let t;while((t=next())&&t[1].at<=at){timers.delete(t[0]);t[1].callback();}},
    async resume() {resolveResume();await Promise.resolve();},
    get:expression=>vm.runInContext(expression,context)
  };
}

test("one-second hidden timer batching no longer discards both close warmups", () => {
  const h=harness();
  h.schedule(113300);h.schedule(114500,"warm");h.advance(115000);
  assert.deepEqual(h.tones,[{kind:"prewarm",at:114000},{kind:"warm",at:115000}]);
  assert.deepEqual(h.events.map(e=>e.latenessMs),[700,500]);
  assert.ok(h.events.every(e=>e.stage==="prewarm-fire"));
});

test("a very late technical warmup still runs in its current phase without replaying warnings", () => {
  const h=harness();h.schedule(101000);h.late(110000);
  assert.deepEqual(h.tones,[{kind:"prewarm",at:110000}]);
  assert.equal(h.events[0].latenessMs,9000);
  assert.equal(h.get("signalLateGraceMs.warn"),300);
  assert.equal(h.get("signalLateGraceMs.minute"),2000);
  assert.equal(h.get("signalLateGraceMs.rotationBoundary"),1200);
  assert.equal(h.get("signalLateGraceMs.start"),1500);
  h.schedule(90000);h.advance(110000);
  assert.equal(h.tones.length,2,"a join after the early point should prepare immediately");
});

const invalidations = {
  pause:h=>{h.context.state.running=false;},
  phase:h=>{h.context.getCurrentSegment=()=>({cycle:2,type:"break"});},
  generation:h=>{h.context.audioScheduleGeneration++;},
  freeze:h=>{h.context.pageAudioSuspended=true;},
  calibration:h=>{h.context.clockCalibrationPending=true;},
  restart:h=>{h.context.state.serverStartedAt=400;}
};
test("queued late warmups cannot cross Pause, phase/run changes, suspension or calibration", () => {
  for(const [reason,invalidate] of Object.entries(invalidations)) {
    const h=harness();h.schedule(101000);invalidate(h);h.late(110000);
    assert.equal(h.tones.length,0,reason);
    assert.equal(h.events[0].stage,"prewarm-stale",reason);
  }
});

test("an asynchronous context resume cannot resurrect a warmup invalidated while it waited", async () => {
  for(const [reason,invalidate] of Object.entries(invalidations)) {
    const h=harness();h.context.audioContext.state="suspended";
    h.schedule(101000);h.advance(101000);assert.equal(h.resumes.length,1);
    invalidate(h);await h.resume();assert.equal(h.tones.length,0,reason);
  }
});

test("normal and hidden warmups retain positive/negative per-browser audio offsets", () => {
  for(const hidden of [false,true])for(const offset of [-500,250]) {
    const h=harness({hidden,offset});h.schedule(110000);h.advance(111000);
    const target=110000+offset;
    assert.equal(h.tones[0].at,hidden?Math.ceil(target/1000)*1000:target);
  }
});

test("a sub-ms reprojection of the same calendar start does not cancel its technical preparation", () => {
  const h=harness();
  h.context.state.serverStartedAtWall=1791460800000;
  h.schedule(101000);
  h.context.state.serverStartedAt+=0.001;
  h.advance(101000);
  assert.equal(h.tones.length,1);
});

test("browser technical preparation accepts10ms inclusive, rejecting larger or different-calendar changes", () => {
  for(const shift of [-10,-7,7,10,-10.25,10.25]){
    const h=harness();h.context.state.serverStartedAtWall=1791460800000;
    h.schedule(101000);h.context.state.serverStartedAt+=shift;h.advance(101000);
    assert.equal(h.tones.length,Math.abs(shift)<=10?1:0,`shift ${shift}`);
  }
  const h=harness();h.context.state.serverStartedAtWall=1791460800000;h.schedule(101000);
  h.context.state.serverStartedAt+=7;h.context.state.serverStartedAtWall+=1;h.advance(101000);
  assert.equal(h.tones.length,0,"a different calendar target must invalidate preparation");
});
