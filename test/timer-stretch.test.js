"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers/controlled-clock-server");
const {authenticatedFetch:fetch}=require("./helpers/browser-session");
async function report(server,id,supported,legacy=false){const r=await fetch(server.baseUrl+"/api/state?"+new URLSearchParams({clientId:id,timerVerticalStretchSupported:String(supported),legacy:String(Number(legacy))}));assert.equal(r.status,200);return r.json();}
async function until(read){const deadline=Date.now()+7000;while(Date.now()<deadline){const value=await read();if(value)return value;await new Promise(r=>setTimeout(r,40));}assert.fail("State did not converge");}

test("configured stretch percentage handles custom caps, disabled values and invalid defaults",()=>{
 const stretch=require("../lib/timer-stretch");
 for(const value of [undefined,null,"","invalid",Infinity])assert.equal(stretch.percent(value),200);
 assert.equal(stretch.scale(100,300,125),1.25);assert.equal(stretch.scale(100,160,200),1.6);
 for(const value of [100,80,0,-10])assert.equal(stretch.scale(100,300,value),1);
});

test("startup stretch defaults apply to new Modern/Legacy screens and explicit off survives restart",async t=>{
 const s=await fixture(t,"darwin",{startupParams:{timer_vertical_stretch:true}});
 await s.action({type:"primary",primaryClientId:"clock-test"});
 for(const legacy of [false,true])assert.equal((await report(s,legacy?"legacy":"modern",true,legacy)).timerVerticalStretch,true);
 assert.equal((await report(s,"unsupported",false)).timerVerticalStretch,false);
 const before=await s.start({elapsedBeforePause:10});
 await s.action({type:"clientTimerStretch",targetClientId:"modern",enabled:false});
 assert.equal((await report(s,"modern",true)).timerVerticalStretch,false);
 assert.equal((await report(s,"another",true)).timerVerticalStretch,true);
 assert.equal((await s.state()).timerClock.startedAt,before.timerClock.startedAt);
 await until(()=>{try{return s.snapshot().timerState.timerVerticalStretchDisabledClientIds.includes("modern");}catch{return false;}});
 await s.restart();assert.equal((await report(s,"modern",true)).timerVerticalStretch,false);
 assert.equal((await report(s,"legacy",true,true)).timerVerticalStretch,true);
 const own=await report(s,"modern",true);assert.equal(own.timerVerticalStretchDisabledClientIds,undefined);
 await s.action({type:"clientTimerStretch",targetClientId:"modern",enabled:true});assert.equal((await report(s,"modern",true)).timerVerticalStretch,true);
});

for(const percent of [125,100,80,0,-10,"invalid"])test("params.txt stretch cap "+percent+" is public and enforced",async t=>{
 const s=await fixture(t,"darwin",{startupParams:{timer_vertical_stretch_max_percent:percent}});
 await s.action({type:"primary",primaryClientId:"clock-test"});await report(s,"screen",true,true);
 const expected=percent==="invalid"?200:percent;
 assert.equal((await s.state()).config.timerVerticalStretchMaxPercent,expected);
 const state=await s.action({type:"clientTimerStretch",targetClientId:"screen",enabled:true});
 assert.equal(state.clients.find(c=>c.id==="screen").timerVerticalStretch,expected>100);
});

test("stretch is per client, permission-checked, supported-only and restored without moving its clock",async t=>{
 const s=await fixture(t,"darwin");await s.action({type:"primary",primaryClientId:"clock-test"});
 await report(s,"legacy-screen",true,true);await report(s,"other-screen",true);await report(s,"old-screen",false);
 const before=await s.start({elapsedBeforePause:12});
 let state=await s.action({type:"clientTimerStretch",targetClientId:"legacy-screen",enabled:true});
 assert.equal(state.clients.find(c=>c.id==="legacy-screen").timerVerticalStretch,true);
 assert.equal(state.clients.find(c=>c.id==="other-screen").timerVerticalStretch,false);
 assert.equal(state.timerClock.startedAt,before.timerClock.startedAt);assert.equal(state.running,true);assert.equal(state.elapsed,before.elapsed);
 const own=await report(s,"legacy-screen",true,true);assert.equal(own.timerVerticalStretch,true);assert.equal(own.timerVerticalStretchClientIds,undefined);
 const version=state.version;state=await s.action({type:"clientTimerStretch",targetClientId:"legacy-screen",enabled:true});assert.equal(state.version,version);
 state=await s.action({type:"clientTimerStretch",targetClientId:"old-screen",enabled:true});assert.equal(state.version,version);assert.equal(state.clients.find(c=>c.id==="old-screen").timerVerticalStretch,false);
 await fetch(s.baseUrl+"/api/state?clientId=legacy-screen&clientBuild=449&legacy=1");
 assert.equal((await s.state()).clients.find(c=>c.id==="legacy-screen").timerVerticalStretchSupported,false);
 await report(s,"legacy-screen",true,true);
 const denied=await fetch(s.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"other-screen",type:"clientTimerStretch",targetClientId:"legacy-screen",enabled:false})});assert.equal(denied.status,403);
 await until(()=>{try{return s.snapshot().timerState.timerVerticalStretchClientIds.includes("legacy-screen");}catch{return false;}});
 await s.restart();assert.equal((await report(s,"legacy-screen",true,true)).timerVerticalStretch,true);assert.equal((await report(s,"other-screen",true)).timerVerticalStretch,false);
 require("node:fs").appendFileSync(require("node:path").join(require("node:path").dirname(require("node:path").dirname(s.snapshotPath)),"params.txt"),"\ntimer_vertical_stretch_max_percent=80\n");
 await s.restart();assert.equal((await report(s,"legacy-screen",true,true)).timerVerticalStretch,true);assert.equal((await s.state()).config.timerVerticalStretchMaxPercent,80);
 await s.action({type:"clientTimerStretch",targetClientId:"legacy-screen",enabled:false});assert.equal((await report(s,"legacy-screen",true,true)).timerVerticalStretch,false);
});

test("stretch on a Secondary-connected screen replicates and accepts forwarded updates",async t=>{
 const p=await fixture(t,null,{startupParams:{timer_vertical_stretch:true,timer_vertical_stretch_max_percent:125}}),b=await fixture(t,null,{startupParams:{timer_vertical_stretch_max_percent:80}});await p.action({type:"primary",primaryClientId:"clock-test"});
 const paired=await fetch(p.baseUrl+"/api/sec/configure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",address:b.baseUrl})});assert.equal(paired.status,200);
 await report(b,"peer-screen",true,true);
 await until(async()=>(await p.state()).clients.find(c=>c.id==="peer-screen")?.timerVerticalStretchSupported);
 assert.equal((await b.state()).config.timerVerticalStretchMaxPercent,125);
 assert.equal((await report(b,"peer-screen",true,true)).timerVerticalStretch,true);
 await p.action({type:"clientTimerStretch",targetClientId:"peer-screen",enabled:true});
 await until(async()=>(await report(b,"peer-screen",true,true)).timerVerticalStretch);
 const response=await fetch(b.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",type:"clientTimerStretch",targetClientId:"peer-screen",enabled:false})});assert.equal(response.status,200);
 await until(async()=>!(await report(b,"peer-screen",true,true)).timerVerticalStretch);
 assert.equal((await p.state()).clients.find(c=>c.id==="peer-screen").timerVerticalStretch,false);
});
