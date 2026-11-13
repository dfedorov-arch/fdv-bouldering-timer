"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {signalsBetween,localSoundAllowed}=require("../lib/server-audio-plan");
const {createServerAudio}=require("../lib/server-audio");
const {create}=require("../lib/client-server-audio");
const {NativeAudio}=require("../lib/server-audio-native");
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test("native event identities survive clock/offset refinement and distinguish a new run",()=>{
 const s={running:true,audioRunId:"run-one",activeSettings:{rotationSeconds:90,breakSeconds:15,oneShot:false}};
 const a=signalsBetween(s,100000,99999,205000),b=signalsBetween(s,100040,99999,205100,15);
 assert.deepEqual(a.map(c=>c.key),b.map(c=>c.key));
 assert.equal(new Set(a.map(c=>c.key)).size,a.length);
 assert.notDeepEqual(a.map(c=>c.key),signalsBetween({...s,audioRunId:"run-two"},100000,99999,205000).map(c=>c.key));
});
const state=()=>({running:true,completed:false,countdownOnly:false,activeSettings:{rotationSeconds:60,breakSeconds:15,oneShot:false},
  primaryClientId:"a",globalSound:true,instancesSound:true,soundProfile:"p",language:"ru",runtimePreset:"classic",festivalAnnouncements:true,muteBreakWarnings:false});
function harness(options={}){
  const c={state:state(),clients:new Map([["a",{id:"a",computerKey:"server-host",order:1}],["b",{id:"b",computerKey:"server-host",order:2}]]),
    offsets:new Map([["a",-250],["b",100]]),profiles:[{id:"p",sources:{}}],now:100000,startedAt:50000,instanceId:"server",rate:1,fenced:false};
  const calls=[],events=[];
  const player={supported:true,async prepare(...args){calls.push(["prepare",...args]);},async stop(g){calls.push(["stop",g]);},
    async replace(...args){calls.push(["replace",...args]);},async cancel(flags){calls.push(["cancel",flags]);},async keepalive(){},async close(){},fail(){}};
  const route=createServerAudio({player,context:()=>c,setTimer:()=>({unref(){}}),clearTimer(){},...options});
  return {c,player,calls,events,route,async claim(id="a"){
    const offer=await route.prepare(id,{wanted:true});assert.ok(offer.token);
    assert.equal(await route.activate(id,offer.token,v=>events.push(v),()=>{}),true);return offer.token;
  },queues:()=>calls.filter(call=>call[0]==="replace")};
}

test("a lost browser and expired registry do not cancel native cues or their saved correction",async()=>{
  const h=harness(),token=await h.claim();h.calls.length=0;
  const generation=h.route.snapshot().generation;
  h.route.disconnected("a",token);h.c.clients.clear();
  h.c.now=179000;await h.route.reconcile();
  assert.equal(h.route.snapshot().clients,0);
  assert.equal(h.route.snapshot().ownerClientId,"a");
  assert.equal(h.route.snapshot().generation,generation);
  assert.equal(h.calls.some(c=>c[0]==="stop"),false);
  assert.ok(h.queues().at(-1)[1].some(c=>c.key.startsWith("2:rotation:warn")&&c.at===179750));
});

test("pagehide cleanup and browser reattachment preserve native generation and reject a stale release",async()=>{
  const h=harness(),old=await h.claim(),generation=h.route.snapshot().generation;h.calls.length=0;
  const response=await h.route.release("a",old,{detach:true});
  assert.equal(response.active,false);assert.equal(response.outputActive,true);
  const current=await h.claim();assert.notEqual(current,old);
  await h.route.release("a",old);
  assert.equal(h.route.status("a").active,true);
  assert.equal(h.route.snapshot().generation,generation);
  assert.equal(h.calls.some(c=>c[0]==="stop"),false);
});

test("the primary sound checkbox mutes and resumes a detached native output without changing shared sound",async()=>{
  const h=harness(),token=await h.claim();h.route.disconnected("a",token);h.c.clients.clear();
  h.calls.length=0;h.route.sound("a",false);await settle();await settle();
  assert.equal(h.route.status("a").active,false);assert.equal(h.c.state.globalSound,true);
  assert.ok(h.calls.some(call=>call[0]==="stop"));
  h.route.sound("a",true);await settle();await settle();
  assert.equal(h.route.status("a").active,true);assert.ok(h.queues().at(-1)[1].length>0);
});

test("shared permissions, native opt-out and authority fencing control output after the browser disappears",async()=>{
  const h=harness();h.c.state.primaryClientId="remote";const token=await h.claim();h.route.disconnected("a",token);
  h.c.clients.clear();h.c.serverAudioDisabledClients=new Set();
  for(const field of ["shared","opt-out","fence"]){
    if(field==="shared")h.c.state.instancesSound=false;
    if(field==="opt-out")h.c.serverAudioDisabledClients.add("a");
    if(field==="fence")h.c.fenced=true;
    h.route.changed();await settle();await settle();assert.equal(h.route.status("a").active,false,field);
    if(field==="shared")h.c.state.instancesSound=true;
    if(field==="opt-out")h.c.serverAudioDisabledClients.clear();
    if(field==="fence")h.c.fenced=false;
    h.route.changed();await settle();await settle();assert.equal(h.route.status("a").active,true,field);
  }
});

test("server output selection restores without browser tokens and retains a muted primary choice",async()=>{
  const first=harness();await first.claim();first.route.sound("a",false);await settle();
  const saved=JSON.parse(JSON.stringify(first.route.savedSelection()));
  assert.equal(JSON.stringify(saved).includes("token"),false);
  const next=harness({restore:saved});next.c.clients.clear();await next.route.reconcile();
  assert.equal(next.route.status("a").active,false);assert.equal(next.route.snapshot().clients,0);
  next.route.sound("a",true);await settle();await settle();assert.equal(next.route.status("a").active,true);
  assert.ok(next.queues().at(-1)[1].some(c=>c.at===104750));
});

test("a remembered same-host primary keeps duplicate output blocked after registry expiry",async()=>{
  const h=harness();h.c.state.primaryClientId="remote";await h.claim();
  h.c.state.primaryClientId="b";h.route.changed();await settle();await settle();
  h.c.clients.clear();await h.route.reconcile();assert.equal(h.route.status("a").active,false);
});

test("a selected host keeps output if its controlling browser changes network path, but rejects new remote claims",async()=>{
  const h=harness(),token=await h.claim();h.route.disconnected("a",token);
  h.c.clients.get("a").computerKey="192.168.1.44";h.calls.length=0;
  await h.route.reconcile();assert.equal(h.route.status("a").active,true);
  assert.equal(h.calls.some(call=>call[0]==="stop"),false);
  assert.equal((await h.route.prepare("a",{wanted:true})).available,false);
});

test("native Final prewarm begins ten seconds before countdown end, repeats while waiting and stops on Start",async()=>{
 const h=harness();h.c.state={...state(),countdownOnly:true,runtimePreset:"final",activeSettings:{rotationSeconds:60,breakSeconds:0,oneShot:true}};
 h.c.now=100000;h.c.startedAt=120000;await h.claim();
 const warm=()=>h.queues().at(-1)[1].filter(c=>c.kind==="prewarm");assert.equal(warm().length,0);
 h.c.now=110000;await h.route.reconcile();assert.equal(warm().length,1);assert.equal(warm()[0].at,110020);
 h.c.now=120000;h.c.state.running=false;h.c.state.countdownOnly=false;h.c.state.waitingForManualStart=true;h.c.startedAt=0;
 h.route.changed();await settle();await settle();assert.equal(warm().length,1);assert.equal(warm()[0].at,120020);
 h.c.now=129999;await h.route.reconcile();assert.equal(warm().length,0);
 h.c.now=130000;await h.route.reconcile();assert.equal(warm().length,1);assert.equal(warm()[0].maxDurationMs,80);
 h.c.state.running=true;h.c.state.waitingForManualStart=false;h.c.startedAt=130600;
 h.route.changed();await settle();await settle();assert.equal(warm().length,0);
 h.c.now=150000;await h.route.reconcile();assert.equal(warm().length,0);
});

test("native Final prewarm respects no_sound_warm and never applies to ordinary paused Classic",async()=>{
 const h=harness();h.c.state={...state(),running:false,waitingForManualStart:true,runtimePreset:"final",activeSettings:{rotationSeconds:60,breakSeconds:0,oneShot:true}};
 h.c.keepAwakeConfig={noSoundWarm:true};await h.claim();
 assert.equal(h.queues().at(-1)[1].some(c=>c.kind==="prewarm"),false);
 h.c.keepAwakeConfig.noSoundWarm=false;h.c.now+=10000;await h.route.reconcile();assert.equal(h.queues().at(-1)[1].some(c=>c.kind==="prewarm"),true);
 h.c.state={...state(),running:false};h.route.changed();await settle();await settle();
 assert.equal(h.queues().at(-1)[1].some(c=>c.kind==="prewarm"),false);
});

test("canonical Classic signals retain all five warnings, boundaries and cycles with per-browser offsets",()=>{
  const cues=signalsBetween(state(),100000,100000,250000,-250);
  assert.equal(cues.filter(c=>c.kind==="warn" && c.key.startsWith("1:rotation")).length,5);
  assert.deepEqual(cues.filter(c=>c.kind==="warn" && c.key.startsWith("1:rotation")).map(c=>c.at),[154750,155750,156750,157750,158750]);
  assert.equal(cues.find(c=>c.key.startsWith("boundary:1:rotation")).at,159750);
  assert.equal(cues.find(c=>c.key.startsWith("boundary:1:break")).at,174750);
  assert.equal(cues.filter(c=>c.key.startsWith("2:rotation:warn")).length,5);
  assert.ok(cues.filter(c=>c.kind==="warn").every(c=>c.grace===300 && c.maxDurationMs===960));
});
test("break muting removes only break warnings",()=>{
  const muted=signalsBetween({...state(),muteBreakWarnings:true},100000,100001,180000);
  assert.equal(muted.filter(c=>c.key.startsWith("1:break:warn")).length,0);
  assert.equal(muted.filter(c=>c.kind==="warn").length,5);assert.equal(muted.filter(c=>c.key.startsWith("boundary")).length,2);
});
test("scheduled-start MINUTE, ordinary MINUTE, Final completion and countdown-only stay distinct",()=>{
  const base=state();base.activeSettings.rotationSeconds=120;
  const cues=signalsBetween(base,200000,100000,400000,125);
  assert.equal(cues.find(c=>c.key.startsWith("pendingStart")).at,140125);
  assert.equal(cues.find(c=>c.key.startsWith("1:rotation:minute")).at,260125);
  const countdown=signalsBetween({...base,countdownOnly:true},200000,100000,400000,125);
  assert.equal(countdown.length,1);assert.equal(countdown[0].kind,"minute");
  const final=signalsBetween({...state(),activeSettings:{rotationSeconds:60,breakSeconds:0,oneShot:true}},100000,100001,300000);
  assert.equal(final.filter(c=>c.kind==="end").length,1);assert.equal(final.filter(c=>c.kind==="start").length,0);
});
test("short phases cannot schedule a warning at or before their own start",()=>{
  const cues=signalsBetween({...state(),activeSettings:{rotationSeconds:3,breakSeconds:2}},100000,100000,105000);
  assert.deepEqual(cues.filter(c=>c.key.startsWith("1:rotation:warn")).map(c=>c.at),[101000,102000]);
  assert.deepEqual(cues.filter(c=>c.key.startsWith("1:break:warn")).map(c=>c.at),[104000]);
});
test("Festival announcements preserve targets and the shared switch",()=>{
  const s={...state(),runtimePreset:"festival",activeSettings:{rotationSeconds:7200,breakSeconds:0}};
  const cues=signalsBetween(s,100000,100000,7300001);
  assert.deepEqual(cues.filter(c=>c.kind.startsWith("festival")).map(c=>c.kind),["festival60","festival30","festival10","festival5"]);
  assert.equal(signalsBetween({...s,festivalAnnouncements:false},100000,100000,7300001).filter(c=>c.kind.startsWith("festival")).length,0);
});
test("native output cannot be claimed by remote, legacy or same-host non-primary screens",()=>{
  const clients=new Map([["a",{id:"a",computerKey:"server-host"}]]),s=state();
  for(const client of [{id:"r",computerKey:"192.168.1.10"},{id:"l",computerKey:"server-host",legacyViewer:true},{id:"b",computerKey:"server-host"}])
    assert.equal(localSoundAllowed(client,s,clients),false);
  assert.equal(localSoundAllowed(clients.get("a"),s,clients),true);
});
test("prepare stays silent; only a valid stream activation transfers output and preserves the owner's offset",async()=>{
  const h=harness(),offer=await h.route.prepare("a",{wanted:true});
  assert.equal(h.queues().length,0);assert.equal(h.route.status("a").active,false);
  assert.equal(await h.route.activate("b",offer.token,()=>{},()=>{}),false);
  assert.equal(await h.route.activate("a",offer.token,v=>h.events.push(v),()=>{}),true);
  assert.equal(h.route.status("a").active,true);
  assert.ok(h.queues().at(-1)[1].some(c=>c.kind==="warn" && c.at===104750));
});
test("offset changes cancel obsolete native targets before replacement",async()=>{
  const h=harness();await h.claim();h.calls.length=0;h.c.now+=200;h.c.offsets.set("a",100);h.route.changed();await settle();
  assert.equal(h.calls[0][0],"stop");
  assert.ok(h.queues().at(-1)[1].every(c=>c.at>=h.c.now));
  assert.ok(h.queues().at(-1)[1].some(c=>c.at===105100));
});

test("per-browser native opt-out cancels output without denying browser audio or losing offsets",async()=>{
  const h=harness();h.c.serverAudioDisabledClients=new Set();
  const token=await h.claim();h.calls.length=0;
  h.c.serverAudioDisabledClients.add("a");h.route.changed();await settle();await settle();
  assert.equal(h.route.status("a").active,false);
  assert.equal(h.route.status("a").enabled,false);
  assert.equal(h.route.status("a").browserAllowed,true);
  assert.ok(h.calls.some(c=>c[0]==="stop"));
  assert.equal((await h.route.prepare("a",{wanted:true,forced:true})).token,undefined);
  assert.equal(h.route.status("b").enabled,true);
  h.c.serverAudioDisabledClients.delete("a");await h.claim();
  assert.equal(h.route.status("a").active,true);
  assert.ok(h.queues().at(-1)[1].some(c=>c.at===104750));
  assert.equal(h.c.offsets.get("a"),-250);
});

test("native opt-out invalidates pending reservations and asynchronous preparation",async()=>{
  const h=harness();h.c.serverAudioDisabledClients=new Set();
  const offer=await h.route.prepare("a",{wanted:true});
  h.c.serverAudioDisabledClients.add("a");
  assert.equal(await h.route.activate("a",offer.token,()=>{},()=>{}),false);
  h.c.serverAudioDisabledClients.clear();
  let complete;h.player.prepare=()=>new Promise(resolve=>complete=resolve);
  const preparing=h.route.prepare("a",{wanted:true});
  h.c.serverAudioDisabledClients.add("a");complete();
  assert.equal((await preparing).token,undefined);
  assert.equal(h.route.status("a").active,false);
});

test("calendar-start sampling jitter cannot repeatedly stop an already submitted minute warning",async()=>{
  const h=harness();h.c.startedAt=164000;h.c.state.startedAt=164000;h.c.now=100000;
  await h.claim();const submitted=h.queues().at(-1)[1];assert.ok(submitted.some(c=>c.key.startsWith("pendingStart:minute:")));
  h.calls.length=0;h.c.now=100100;h.c.startedAt+=.25;
  h.route.changed();await settle();
  assert.equal(h.calls.some(c=>c[0]==="stop"),false,"sub-ms reprojection must retain the native queue");
  h.c.now=103800;h.c.startedAt-=.4;await h.route.reconcile();
  assert.equal(h.calls.some(c=>c[0]==="stop"),false);
  assert.ok((h.queues().at(-1)?.[1]||submitted).some(c=>c.key.startsWith("pendingStart:minute:")&&c.at===103750));
  h.c.startedAt+=2000;h.route.changed();await settle();
  assert.ok(h.calls.some(c=>c[0]==="stop"),"a real calendar-clock correction still replaces the queue");
});
test("Pause/Stop and a late prepare completion cannot revive native playback",async()=>{
  const h=harness();await h.claim();h.calls.length=0;
  h.c.state.running=false;h.c.startedAt=0;h.route.changed();await settle();
  assert.equal(h.calls[0][0],"stop");assert.deepEqual(h.queues().at(-1)[1],[]);
  const gate={};h.player.prepare=()=>new Promise(resolve=>gate.resolve=resolve);
  h.c.state.running=true;h.c.startedAt=60000;h.route.changed();await settle();
  h.c.state.running=false;h.c.startedAt=0;h.route.changed();gate.resolve();await settle();await settle();
  assert.deepEqual(h.queues().at(-1)[1],[]);
});

for(const direction of [-1,1])test(`native anchor tolerance includes10ms in direction ${direction} without accumulating drift`,async()=>{
  const h=harness(),anchor=164000;h.c.startedAt=anchor;h.c.now=100000;await h.claim();
  const original=h.queues().at(-1)[1].find(c=>c.key.startsWith("pendingStart:minute:"));h.calls.length=0;
  for(const delta of [3,7,10]){
    h.c.startedAt=anchor+direction*delta;h.route.changed();await settle();
    assert.equal(h.calls.some(c=>c[0]==="stop"),false,`accepted delta ${direction*delta}`);
  }
  h.c.startedAt=anchor+direction*10.25;h.route.changed();await settle();
  assert.ok(h.calls.some(c=>c[0]==="stop"),"compare against the accepted anchor, not the previous sample");
  const moved=h.queues().at(-1)[1].find(c=>c.key.startsWith("pendingStart:minute:"));
  assert.equal(moved.at,original.at+direction*10.25);
  h.c.state.running=false;h.c.startedAt=0;h.route.changed();await settle();
  h.c.state.running=true;h.c.startedAt=anchor+7;h.route.changed();await settle();
  assert.equal(h.queues().at(-1)[1].find(c=>c.key.startsWith("pendingStart:minute:")).at,original.at+7);
});
test("release ACK and native inactive event wait for actual cancellation",async()=>{
  const h=harness(),token=await h.claim();h.events.length=0;
  let stop,first=true;h.player.stop=()=>{if(!first)return Promise.resolve();first=false;return new Promise(resolve=>{stop=resolve;});};
  let done=false;const released=h.route.release("a",token).then(()=>done=true);
  await settle();assert.equal(done,false);assert.equal(h.events.length,0);
  stop();await released;assert.equal(done,true);assert.equal(h.events[0].active,false);
});
test("disconnected observers preserve server output, but local role loss still stops it",async()=>{
  const h=harness(),token=await h.claim();h.calls.length=0;h.route.disconnected("a",token);await settle();
  assert.equal(h.route.status("a").active,true);assert.equal(h.calls.some(c=>c[0]==="stop"),false);
  await h.claim();h.c.state.primaryClientId="b";h.route.changed();await settle();assert.equal(h.route.status("a").active,false);
});
test("native queue preserves a submitted deadline across a late server tick without replaying missed cues",async()=>{
  const h=harness();await h.claim();h.c.now=104800;await h.route.reconcile();
  assert.ok(h.queues().at(-1)[1].some(c=>c.at===104750));
  h.c.now=130000;await h.route.reconcile();assert.ok(h.queues().at(-1)[1].every(c=>c.at>=128000));
});

function clientHarness(){
  const calls=[],listeners={};let resolvePrepare;
  const route=create({post:body=>{calls.push([body.op,body]);return body.op==="prepare"?new Promise(resolve=>resolvePrepare=resolve):Promise.resolve({serverInstanceId:"s",active:false});},
    connect:()=>{calls.push(["connect"]);return {addEventListener:(name,callback)=>listeners[name]=callback,close:()=>calls.push(["close"])};},
    stopLocal:()=>calls.push(["stopLocal"]),resumeLocal:options=>calls.push(["resumeLocal",options])});
  return {route,calls,listeners,offer:()=>resolvePrepare({available:true,token:"token",serverInstanceId:"s"}),
    start:()=>route.update({wanted:true,available:true,instance:"s"})};
}

test("fresh HTTP confirmation suppresses duplicate browser playback after observer loss without trusting a stale sample",async()=>{
  const h=clientHarness();
  h.route.update({wanted:true,available:true,instance:"s",outputActive:false,outputRevision:1});h.offer();await settle();
  h.listeners.route({data:JSON.stringify({active:false,serverInstanceId:"s"})});await settle();
  assert.equal(h.route.suppressed(),false);
  h.route.update({wanted:true,available:true,instance:"s",outputActive:true,outputRevision:1});
  assert.equal(h.route.suppressed(),false,"the pre-failure sample cannot suppress fallback");
  h.route.update({wanted:true,available:true,instance:"s",outputActive:true,outputRevision:2});
  assert.equal(h.route.suppressed(),true,"fresh server confirmation works without an observer stream");
  h.route.update({wanted:true,available:false,instance:"s",outputActive:false,outputRevision:3});await settle();
  assert.equal(h.route.suppressed(),false,"a failed backend still returns playback immediately");
  h.route.suspend();
});

test("primary sound changes serialize and failed preference requests do not flood ordinary updates",async()=>{
  let time=0;const calls=[];
  const route=create({now:()=>time,post:async body=>{calls.push(body);throw Error("offline");},stopLocal(){},resumeLocal(){}});
  const update=enabled=>route.update({wanted:false,available:false,instance:"s",endpoint:"local",primarySoundEnabled:enabled});
  update(false);await settle();
  for(time=100;time<5000;time+=100)update(false);
  await settle();assert.equal(calls.length,1);
  update(true);await settle();assert.equal(calls.length,2);assert.equal(calls[1].enabled,true);
  time=10000;update(true);await settle();assert.equal(calls.length,3);
  route.suspend();
});
test("browser prepares native ownership and requests release before immediate fallback",async()=>{
  const h=clientHarness();h.start();h.offer();await settle();
  assert.deepEqual(h.calls.map(c=>c[0]),["prepare","stopLocal","connect"]);assert.equal(h.route.suppressed(),true);
  h.listeners.route({data:JSON.stringify({active:false,serverInstanceId:"s"})});await settle();
  assert.ok(h.calls.findIndex(c=>c[0]==="release")<h.calls.findIndex(c=>c[0]==="resumeLocal"));assert.equal(h.route.suppressed(),false);
});
test("muting during asynchronous native preparation cannot activate stale output",async()=>{
  const h=clientHarness();h.start();h.route.update({wanted:false,available:true,instance:"s"});h.offer();await settle();
  assert.equal(h.calls.filter(c=>c[0]==="connect").length,0);assert.equal(h.calls.filter(c=>c[0]==="release").length,1);
});

test("an inactive stream identifies a manual choice before the HTTP action response arrives",async()=>{
 const h=clientHarness();h.start();h.offer();await settle();
 h.listeners.route({data:JSON.stringify({active:false,serverPreferred:false,serverInstanceId:"s"})});
 assert.equal(h.route.suppressed(),false);
 assert.deepEqual(h.calls.find(c=>c[0]==="resumeLocal")[1],{reason:"manual",recoverRecent:false});
 await settle();h.route.suspend();
});

test("native opt-out restores browser audio without waiting for cancellation acknowledgement",async()=>{
  const calls=[];let acknowledge;
  const route=create({post:async body=>body.op==="prepare"
    ? {available:true,token:"t",serverInstanceId:"s"}
    : new Promise(resolve=>acknowledge=()=>resolve({serverInstanceId:"s",active:false})),
    connect:()=>({addEventListener(){},close(){calls.push("close");}}),
    stopLocal:()=>calls.push("mute"),resumeLocal:options=>calls.push(["resume",options])});
  route.update({wanted:true,available:true,serverPreferred:true,instance:"s"});await settle();
  route.update({wanted:true,available:false,serverPreferred:false,instance:"s"});await settle();
  assert.equal(route.suppressed(),false);assert.deepEqual(calls.at(-1),["resume",{reason:"manual",recoverRecent:false}]);
  acknowledge();await settle();
  assert.equal(route.suppressed(),false);assert.equal(calls.filter(c=>Array.isArray(c)&&c[0]==="resume").length,1);
});
test("ordinary background visibility never releases a native route",async()=>{
  const h=clientHarness();h.start();h.offer();await settle();h.start();await settle();
  assert.equal(h.calls.filter(c=>c[0]==="release").length,0);
  h.route.suspend();assert.equal(h.calls.filter(c=>c[0]==="close").length,1);
});

test("failed native output returns to browser before hanging release and state refresh finish",async()=>{
 const calls=[],listeners={};let release,refresh;
 const route=create({post:body=>body.op==="prepare"?Promise.resolve({available:true,token:"t",serverInstanceId:"s"})
   :new Promise(resolve=>release=()=>resolve({active:false,serverInstanceId:"s"})),
  connect:()=>({addEventListener:(name,fn)=>listeners[name]=fn,close:()=>calls.push("close")}),
  stopLocal:()=>calls.push("mute"),resumeLocal:options=>calls.push(options),
  refreshState:()=>new Promise(resolve=>refresh=resolve)});
 route.update({wanted:true,available:true,serverPreferred:true,instance:"s"});await settle();
 listeners.route({data:JSON.stringify({active:false,serverInstanceId:"s"})});
 assert.equal(route.suppressed(),false);assert.deepEqual(calls.at(-1),{reason:"failure",recoverRecent:true});
 await settle();assert.equal(typeof release,"function");assert.equal(typeof refresh,"function");
 refresh();release();await settle();route.suspend();
});

test("manual START retains a negative offset even when it precedes the command lead",async()=>{
  const h=harness();h.c.state.running=false;h.c.startedAt=0;await h.claim();
  h.c.offsets.set("a",-750);h.c.state.running=true;h.c.state.manualStartLeadMs=600;
  h.c.startedAt=h.c.now+600;h.route.changed();await settle();
  assert.ok(h.queues().at(-1)[1].some(c=>c.kind==="start" && c.at===h.c.now-150));
});

test("natural Final completion preserves its submitted END instead of cutting it off",async()=>{
  const h=harness();h.c.state.activeSettings={rotationSeconds:60,breakSeconds:0,oneShot:true};
  h.c.now=109500;await h.claim();assert.ok(h.queues().at(-1)[1].some(c=>c.kind==="end"));
  h.calls.length=0;h.c.now=110010;h.c.state.running=false;h.c.state.completed=true;h.c.startedAt=0;
  h.route.changed();await settle();
  assert.equal(h.calls.some(c=>c[0]==="stop"),false);
  assert.ok(h.queues().at(-1)[1].some(c=>c.kind==="end" && c.at===109750));
});

test("one native speaker elects a single local owner and releasing another claim cannot interrupt it",async()=>{
  const h=harness();h.c.state.primaryClientId="remote";await h.claim();const tokenB=await h.claim("b");
  assert.equal(h.route.snapshot().ownerClientId,"a");h.calls.length=0;
  await h.route.release("b",tokenB);assert.equal(h.calls.some(c=>c[0]==="stop"),false);
  assert.equal(h.route.status("a").active,true);
  h.c.now+=200;h.c.state.primaryClientId="b";await h.claim("b");h.route.changed();await settle();
  assert.equal(h.route.snapshot().ownerClientId,"b");assert.equal(h.route.status("a").active,false);
  assert.ok(h.queues().at(-1)[1].some(c=>c.at===105100));
});

test("native signal tests use the owner's saved correction and unsaved correction preview",async()=>{
  const h=harness();h.c.state.running=false;h.c.startedAt=0;await h.claim();
  h.route.audioTest({id:"saved",kind:"warn",timerTime:101000,targetClientId:"a"});await settle();
  assert.deepEqual(h.queues().at(-1)[1].map(c=>c.at),[100750,101750,102750,103750,104750]);
  h.route.audioTest({id:"preview",kind:"start",timerTime:102000,targetClientId:"a",previewTargetClientId:"a",previewAudioOffset:400});await settle();
  assert.ok(h.queues().at(-1)[1].some(c=>c.key==="test:preview:0" && c.at===102400));
});

test("switching servers releases the old endpoint and refreshes state after immediate browser fallback",async()=>{
  const calls=[],listeners={};
  const route=create({post:async(body,endpoint)=>{calls.push([body.op,endpoint]);return body.op==="prepare"?{available:true,token:"t",serverInstanceId:"old"}:{active:false,serverInstanceId:"old"};},
    connect:()=>({addEventListener:(n,f)=>listeners[n]=f,close:()=>calls.push(["close"])}),stopLocal:()=>calls.push(["stop"]),
    refreshState:async()=>calls.push(["refresh"]),resumeLocal:()=>calls.push(["resume"])});
  route.update({wanted:true,available:true,instance:"old",endpoint:"http://old/api/server-audio"});await settle();
  route.update({wanted:true,available:false,instance:"new",endpoint:"http://new/api/server-audio"});await settle();
  assert.deepEqual(calls.find(c=>c[0]==="release"),["release","http://old/api/server-audio"]);
  assert.ok(calls.findIndex(c=>c[0]==="resume")<calls.findIndex(c=>c[0]==="refresh"));assert.equal(route.suppressed(),false);
});

test("failed stream construction requests release and immediately restores browser audio",async()=>{
  const calls=[];
  const route=create({post:async body=>{calls.push(body.op);return body.op==="prepare"?{available:true,token:"t",serverInstanceId:"s"}:{active:false,serverInstanceId:"s"};},
    connect:()=>{throw new Error("EventSource rejected");},stopLocal:()=>calls.push("stop"),resumeLocal:()=>calls.push("resume")});
  route.update({wanted:true,available:true,instance:"s"});await settle();
  assert.deepEqual(calls,["prepare","stop","release","resume"]);assert.equal(route.suppressed(),false);
});

test("native clock projection keeps the sampled instant and Secondary clock rate",async()=>{
  const player=new NativeAudio("unused"),requests=[];player.clockOffset=1234;
  player.request=async(op,data)=>requests.push({op,data});
  await player.replace([{key:"corrected",kind:"warn",at:100150,grace:300}],7,100000,1.001,10000);
  assert.equal(requests[0].data.cues[0].at,11234+150/1.001);
  assert.equal(requests[0].data.generation,"7");
});

test("native quiet pulses run while stopped and cancellation never resets work audio",async()=>{
 const h=harness();h.c.state.running=false;h.c.startedAt=0;h.c.state.speakerKeepAwake=true;
 await h.claim();const generation=h.route.snapshot().generation;h.calls.length=0;
 h.c.now+=180001;await h.route.reconcile();
 assert.ok(h.route.snapshot().queued.some(c=>c.kind==="keep-awake"));
 assert.equal(h.route.snapshot().generation,generation);assert.equal(h.calls.some(c=>c[0]==="stop"),false);
 h.calls.length=0;h.c.state.speakerKeepAwake=false;h.route.changed();await settle();
 assert.equal(h.route.snapshot().queued.some(c=>c.kind==="keep-awake"),false);
 assert.equal(h.calls.some(c=>c[0]==="stop"),false);
 assert.ok(h.calls.some(c=>c[0]==="cancel" && c[1].keepAwake));
});


test("native clock discontinuity is checked before cue submission and cancels obsolete native plans",async()=>{
  const h=harness();await h.claim();h.calls.length=0;h.c.now=105200;
  let changed=false;
  h.player.keepalive=async()=>{
    h.calls.push(["keepalive"]);
    if(!changed){changed=true;h.player.onEvent({stage:"clock-reanchor",correctionMs:-3600000});}
  };
  await h.route.reconcile();await settle();
  const replaceAt=h.calls.findIndex(call=>call[0]==="replace");
  assert.ok(replaceAt>=0);
  assert.ok(h.calls.findIndex(call=>call[0]==="keepalive")<replaceAt);
  assert.ok(h.calls.some(call=>call[0]==="stop"));
  assert.ok(h.queues().at(-1)[1].every(cue=>cue.at>h.c.now),"do not replay pre-wake cues");
});


test("a recovered native process resumes its saved output without a browser and schedules only future cues",async()=>{
  const h=harness();await h.claim();h.player.supported=false;h.player.onFailure("player-timeout");await settle();
  assert.equal(h.route.status("a").active,false);h.calls.length=0;
  h.c.now=105200;h.c.clients.clear();h.player.supported=true;h.player.onEvent({stage:"recovered",epoch:1});await settle();await settle();
  assert.ok(h.queues().length>0,"the server resumes without a new browser lease");
  assert.ok(h.queues().at(-1)[1].every(cue=>cue.at>h.c.now));
});

test("browser reconnects after recovery even if availability changed while release was pending",async()=>{
  const calls=[];let release;
  const route=create({post:async body=>{calls.push(body.op);return body.op==="prepare"
    ? {available:true,token:"t"+calls.length,serverInstanceId:"s"}
    : new Promise(resolve=>release=()=>resolve({active:false,serverInstanceId:"s"}));},
    connect:()=>({addEventListener(){},close(){}}),stopLocal:()=>calls.push("mute"),resumeLocal:()=>calls.push("resume")});
  route.update({wanted:true,available:true,instance:"s",recoveryEpoch:0});await settle();
  route.update({wanted:true,available:false,instance:"s",recoveryEpoch:0});await settle();
  route.update({wanted:true,available:true,instance:"s",recoveryEpoch:1});await settle();
  assert.equal(calls.filter(c=>c==="prepare").length,1);
  release();await settle();await settle();
  assert.equal(calls.filter(c=>c==="prepare").length,2);assert.equal(route.suppressed(),true);
});

test("a browser that missed the unavailable sample still releases the old native lease on recovery",async()=>{
  const h=clientHarness();h.route.update({wanted:true,available:true,instance:"s",recoveryEpoch:0});h.offer();await settle();
  h.route.update({wanted:true,available:true,instance:"s",recoveryEpoch:1});await settle();
  assert.equal(h.calls.filter(c=>c[0]==="release").length,1);
  assert.equal(h.calls.filter(c=>c[0]==="prepare").length,2);
});


test("a stale prepare failure cannot block a newly recovered audio route",async()=>{
  const calls=[];let fail;
  const route=create({post:body=>{calls.push(body.op);return new Promise((resolve,reject)=>fail=reject);},
    connect(){},stopLocal(){},resumeLocal(){}});
  route.update({wanted:true,available:true,instance:"s",recoveryEpoch:0});
  route.update({wanted:true,available:false,instance:"s",recoveryEpoch:0});
  route.update({wanted:true,available:true,instance:"s",recoveryEpoch:1});
  fail(new Error("old request failed"));await settle();
  assert.equal(calls.filter(c=>c==="prepare").length,2);route.suspend();
});

test("browser audio channel retries failed transport at most three times and cancels on suspension",async()=>{
  const jobs=new Set(),calls=[];
  const route=create({setTimer:(fn,ms)=>{const job={fn,ms};jobs.add(job);return job;},clearTimer:job=>jobs.delete(job),
    post:async body=>{calls.push(body.op);throw new Error("local transport lost");},
    connect(){},stopLocal(){},resumeLocal(){}});
  const policy={wanted:true,available:true,instance:"s",recoveryEpoch:0};route.update(policy);await settle();
  for(const ms of [1000,3000,10000]){
    assert.equal(jobs.size,1);const job=[...jobs][0];assert.equal(job.ms,ms);jobs.delete(job);job.fn();await settle();
  }
  assert.equal(calls.length,4);assert.equal(jobs.size,0);assert.equal(route.snapshot().recoveryExhausted,true);
  for(let i=0;i<10;i++)route.update(policy);
  assert.equal(calls.length,4,"ordinary state updates do not reset the retry budget");route.suspend();
});

test("native stream errors release audio before retrying and suspension cancels scheduled retry",async()=>{
  const jobs=new Set(),calls=[],listeners={};let release,stream;
  const route=create({setTimer:(fn,ms)=>{const job={fn,ms};jobs.add(job);return job;},clearTimer:job=>jobs.delete(job),
    post:async body=>{calls.push(body.op);return body.op==="prepare"?{available:true,token:"t",serverInstanceId:"s"}
      : new Promise(resolve=>release=()=>resolve({active:false,serverInstanceId:"s"}));},
    connect:()=>stream={addEventListener:(name,fn)=>listeners[name]=fn,close(){}},
    stopLocal:()=>calls.push("mute"),resumeLocal:()=>calls.push("resume")});
  route.update({wanted:true,available:true,instance:"s"});await settle();stream.onerror();await settle();
  assert.equal(route.suppressed(),false);assert.ok(calls.includes("resume"));assert.equal(jobs.size,0);
  release();await settle();assert.equal(route.suppressed(),false);assert.equal(jobs.size,1);
  route.suspend();assert.equal(jobs.size,0);assert.equal(calls.filter(c=>c==="prepare").length,1);
});


test("native process failure holds browser release ACK until the old helper closes",async()=>{
  const h=harness(),token=await h.claim();let exit;
  h.player.retiring=new Promise(resolve=>exit=resolve);h.player.supported=false;
  h.player.onFailure("player-timeout");let released=false;
  const pending=h.route.release("a",token).then(()=>released=true);
  await settle();assert.equal(released,false);exit();await pending;assert.equal(released,true);
});

test("browser channel retry budget resets only after a continuous healthy minute",async()=>{
  let at=0,first=true,stream;const jobs=new Set(),listeners={};
  const route=create({now:()=>at,setTimer:(fn,ms)=>{const j={fn,ms};jobs.add(j);return j;},clearTimer:j=>jobs.delete(j),
    post:async body=>{
      if(body.op==="release")return {active:false,serverInstanceId:"s"};
      if(first){first=false;throw new Error("transport");}
      return {available:true,token:"t",serverInstanceId:"s"};
    },connect:()=>stream={addEventListener:(name,fn)=>listeners[name]=fn,close(){}},stopLocal(){},resumeLocal(){}});
  const policy={wanted:true,available:true,instance:"s"};route.update(policy);await settle();
  const job=[...jobs][0];jobs.delete(job);job.fn();await settle();
  listeners.route({data:JSON.stringify({active:true,serverInstanceId:"s"})});
  at=3600000;route.update(policy);assert.equal(route.snapshot().recoveryAttempt,1,"sleep does not count");
  for(let i=1;i<=60;i++){at=3600000+i*1000;route.update(policy);}
  assert.equal(route.snapshot().recoveryAttempt,0);stream.onerror();await settle();
  assert.equal([...jobs][0].ms,1000);route.suspend();
});
