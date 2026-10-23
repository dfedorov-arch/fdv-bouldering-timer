"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {signalsBetween,localSoundAllowed}=require("../lib/server-audio-plan");
const {createServerAudio}=require("../lib/server-audio");
const {create}=require("../lib/client-server-audio");
const {NativeAudio}=require("../lib/server-audio-native");
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const state=()=>({running:true,completed:false,countdownOnly:false,activeSettings:{rotationSeconds:60,breakSeconds:15,oneShot:false},
  primaryClientId:"a",globalSound:true,instancesSound:true,soundProfile:"p",language:"ru",runtimePreset:"classic",festivalAnnouncements:true,muteBreakWarnings:false});
function harness(){
  const c={state:state(),clients:new Map([["a",{id:"a",computerKey:"server-host",order:1}],["b",{id:"b",computerKey:"server-host",order:2}]]),
    offsets:new Map([["a",-250],["b",100]]),profiles:[{id:"p",sources:{}}],now:100000,startedAt:50000,instanceId:"server",rate:1,fenced:false};
  const calls=[],events=[];
  const player={supported:true,async prepare(...args){calls.push(["prepare",...args]);},async stop(g){calls.push(["stop",g]);},
    async replace(...args){calls.push(["replace",...args]);},async cancel(flags){calls.push(["cancel",flags]);},async keepalive(){},async close(){},fail(){}};
  const route=createServerAudio({player,context:()=>c,setTimer:()=>({unref(){}}),clearTimer(){}});
  return {c,player,calls,events,route,async claim(id="a"){
    const offer=await route.prepare(id,{wanted:true});assert.ok(offer.token);
    assert.equal(await route.activate(id,offer.token,v=>events.push(v),()=>{}),true);return offer.token;
  },queues:()=>calls.filter(call=>call[0]==="replace")};
}

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
test("local permission/role loss revokes the route, and disconnected streams stop native audio",async()=>{
  const h=harness(),token=await h.claim();h.calls.length=0;h.route.disconnected("a",token);await settle();
  assert.equal(h.route.status("a").active,false);assert.ok(h.calls.some(c=>c[0]==="stop"));
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
    stopLocal:()=>calls.push(["stopLocal"]),resumeLocal:()=>calls.push(["resumeLocal"])});
  return {route,calls,listeners,offer:()=>resolvePrepare({available:true,token:"token",serverInstanceId:"s"}),
    start:()=>route.update({wanted:true,available:true,instance:"s"})};
}
test("browser mutes submitted audio before activating server output and waits for release before fallback",async()=>{
  const h=clientHarness();h.start();h.offer();await settle();
  assert.deepEqual(h.calls.map(c=>c[0]),["prepare","stopLocal","connect"]);assert.equal(h.route.suppressed(),true);
  h.listeners.route({data:JSON.stringify({active:false,serverInstanceId:"s"})});await settle();
  assert.ok(h.calls.findIndex(c=>c[0]==="release")<h.calls.findIndex(c=>c[0]==="resumeLocal"));assert.equal(h.route.suppressed(),false);
});
test("muting during asynchronous native preparation cannot activate stale output",async()=>{
  const h=clientHarness();h.start();h.route.update({wanted:false,available:true,instance:"s"});h.offer();await settle();
  assert.equal(h.calls.filter(c=>c[0]==="connect").length,0);assert.equal(h.calls.filter(c=>c[0]==="release").length,1);
});

test("native opt-out keeps browser muted until native cancellation is acknowledged",async()=>{
  const calls=[];let acknowledge;
  const route=create({post:async body=>body.op==="prepare"
    ? {available:true,token:"t",serverInstanceId:"s"}
    : new Promise(resolve=>acknowledge=()=>resolve({serverInstanceId:"s",active:false})),
    connect:()=>({addEventListener(){},close(){calls.push("close");}}),
    stopLocal:()=>calls.push("mute"),resumeLocal:()=>calls.push("resume")});
  route.update({wanted:true,available:true,instance:"s"});await settle();
  route.update({wanted:true,available:false,instance:"s"});await settle();
  assert.equal(route.suppressed(),true);assert.equal(calls.includes("resume"),false);
  acknowledge();await settle();
  assert.equal(route.suppressed(),false);assert.equal(calls.at(-1),"resume");
});
test("ordinary background visibility never releases a native route",async()=>{
  const h=clientHarness();h.start();h.offer();await settle();h.start();await settle();
  assert.equal(h.calls.filter(c=>c[0]==="release").length,0);
  h.route.suspend();assert.equal(h.calls.filter(c=>c[0]==="close").length,1);
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

test("switching servers releases the old endpoint and refreshes state before browser fallback",async()=>{
  const calls=[],listeners={};
  const route=create({post:async(body,endpoint)=>{calls.push([body.op,endpoint]);return body.op==="prepare"?{available:true,token:"t",serverInstanceId:"old"}:{active:false,serverInstanceId:"old"};},
    connect:()=>({addEventListener:(n,f)=>listeners[n]=f,close:()=>calls.push(["close"])}),stopLocal:()=>calls.push(["stop"]),
    beforeResume:async()=>calls.push(["refresh"]),resumeLocal:()=>calls.push(["resume"])});
  route.update({wanted:true,available:true,instance:"old",endpoint:"http://old/api/server-audio"});await settle();
  route.update({wanted:true,available:false,instance:"new",endpoint:"http://new/api/server-audio"});await settle();
  assert.deepEqual(calls.find(c=>c[0]==="release"),["release","http://old/api/server-audio"]);
  assert.ok(calls.findIndex(c=>c[0]==="refresh")<calls.findIndex(c=>c[0]==="resume"));assert.equal(route.suppressed(),false);
});

test("failed stream construction releases its silent reservation before restoring browser audio",async()=>{
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
