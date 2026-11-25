"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const slots=require("../lib/rotation-slots"),ar=require("../lib/final-appeals"),display=require("../lib/start-list-display");
const {signalsBetween}=require("../lib/server-audio-plan");
const {createTimerTransitions}=require("../lib/timer-transitions"),{createTimerDomain}=require("../lib/timer-domain");
const {fixture}=require("./helpers/controlled-clock-server");
const lists=()=>[{headers:["#","Bib","Name"],rows:Array.from({length:12},(_,i)=>[String(i+1),String(100+i),"Athlete "+i]),routeCount:4}];
const state=()=>({activePreset:"classic",runtimePreset:"classic",running:false,completed:false,elapsedBeforePause:0,activeSettings:{rotationSeconds:240,breakSeconds:15,oneShot:false},draftSettings:{rotationMinutes:4,breakSeconds:15,oneShot:false},startLists:lists(),finalAppealRotations:[],version:1});
const entry=(pi=0,route=1,timeSeconds=90,startSignal=false)=>({listIndex:0,participantIndex:pi,route,timeSeconds,startSignal});
const plan=(id="repeat",afterCycle=2,placement="flow",solo=false,entries=[entry()])=>({id,afterCycle,placement,solo,entries});
const empty=(id="gap",afterCycle=2)=>({id,afterCycle,kind:"empty",listIndex:0,entries:[]});
const tx=createTimerTransitions(createTimerDomain({classicRotationMinutes:4,classicBreakSeconds:15}),{manualStartAudioLeadMs:600});
const start={type:"start",activePreset:"classic",startMode:"manual",startHours:"",startMinutes:"",startAudioLead:true};

test("Classic front slots shift the field and arrive at the assigned route with the flow",()=>{
 const s=ar.replaceQueue(state(),[plan()]),p=slots.build(s,0,s.startLists[0]);
 assert.equal(ar.active(s),null);assert.equal(s.activeSettings.oneShot,false);
 assert.deepEqual(p.normalCycles[2],[4,6,8,10]);assert.deepEqual(p.slots[0].cycles,[3,5,7,9]);
 assert.equal(slots.marker(p.slots[0],1,4,"rotation",10,240),"ready");
 assert.equal(slots.marker(p.slots[0],1,5,"rotation",149.9,240),"ready");
 assert.equal(slots.marker(p.slots[0],1,5,"rotation",150,240),"active");
 assert.equal(slots.marker(p.slots[0],0,5,"rotation",150,240),"empty");
 const schedule=slots.decorateSchedule(s,0,s.startLists[0],{});
 assert.equal(display.attemptCycle(2,1,schedule),6);assert.equal(display.marker(2,1,5,"rotation",[],schedule),"ready");
});
test("a waiting two-minute repeat in rotation ten dims preparation for the regular starter for eleven",()=>{
 const s=state();s.activeSettings.rotationSeconds=300;s.draftSettings.rotationMinutes=5;
 const next=ar.replaceQueue(s,[empty("gap",5),plan("repeat",9,"immediate",false,[entry(0,0,120)])]);
 const p=slots.build(next,0,next.startLists[0]);assert.equal(p.normalCycles[8][0],11);
 const before=slots.decorateSchedule(next,0,next.startLists[0],{},9*315+179.9);
 assert.equal(slots.marker(p.slots.find(slot=>slot.kind==="attempt"),0,10,"rotation",179.9,300),"ready");
 assert.equal(display.marker(8,0,10,"rotation",[],before),"ready");
 assert.equal(display.preparationDeferred(0,10,"rotation",before),true);
 const started=slots.decorateSchedule(next,0,next.startLists[0],{},9*315+180);
 assert.equal(display.marker(8,0,10,"rotation",[],started),"ready");
 assert.equal(display.preparationDeferred(0,10,"rotation",started),false);
 assert.equal(display.marker(8,0,10,"break",[],before),"ready");
});
test("Classic immediate slots reserve only the chosen route then propagate the delay downstream",()=>{
 const s=ar.replaceQueue(state(),[plan("now",4,"immediate")]),p=slots.build(s,0,s.startLists[0]);
 assert.equal(p.slots[0].cycles[1],5);assert.equal(p.slots[0].beforeIndex,2);
 assert.deepEqual(p.normalCycles[2],[3,6,8,10]);assert.deepEqual(p.normalCycles[1],[2,4,6,8]);
 assert.equal(p.normalCycles[3][0],4);assert.equal(p.normalCycles[3][1],7);
});
test("a route pause from seven to nine is resolved before reserving route five in rotation fifteen",()=>{
 const s=state();s.startLists[0].routeCount=5;s.startLists[0].incidents=[{kind:"pause",route:2,startCycle:7,resumeCycle:9,participantIndex:4,resolution:"resume"}];
 const next=ar.replaceQueue(s,[plan("repeat",14,"immediate",false,[entry(3,4,60)])]);
 const list=next.startLists[0],schedule=slots.decorateSchedule(next,0,list,{},14*255+61),p=slots.build(next,0,list),incidents=display.calculationIncidents(list.incidents,[],list.rows.length,schedule);
 assert.equal(display.marker(4,4,15,"rotation",incidents,schedule),"ready");assert.equal(display.marker(4,4,16,"rotation",incidents,schedule),"active");
 assert.equal(slots.marker(p.slots[0],4,15,"rotation",181,240),"active");assert.deepEqual(p.conflicts,[]);
 for(let cycle=1;cycle<45;cycle++)for(let route=0;route<5;route++){
  const count=list.rows.filter((_,pi)=>display.marker(pi,route,cycle,"rotation",incidents,schedule)==="active").length+p.slots.filter(slot=>slots.marker(slot,route,cycle,"rotation",239,240)==="active").length;
  assert.ok(count<=1,`route ${route+1}, cycle ${cycle}: ${count}`);
 }
 const moved={...list,incidents:[{...list.incidents[0],resumeCycle:10}]};const movedSchedule=slots.decorateSchedule(next,0,moved,{});assert.notEqual(movedSchedule.slotKey,schedule.slotKey);
});
test("an immediate repeat in a naturally empty route window leaves the normal field unchanged",()=>{
 const s=ar.replaceQueue(state(),[plan("early",0,"immediate",false,[entry(0,3,90)])]),p=slots.build(s,0,s.startLists[0]);
 assert.equal(p.slots[0].beforeIndex,0);assert.equal(p.slots[0].cycles[3],1);assert.deepEqual(p.normalCycles[0],[1,3,5,7]);
});
test("multiple flow gaps have stable ordering and exclusions retain canonical athlete references",()=>{
 const s=state();s.startLists[0].excludedParticipants=[1];
 const next=ar.replaceQueue(s,[empty("first",2),empty("second",2),plan("third",2)]),p=slots.build(next,0,next.startLists[0]);
 assert.deepEqual(p.slots.map(s=>s.id),["first","second","third_0"]);
 assert.deepEqual(p.slots.map(s=>s.frontCycle),[3,4,5]);
 assert.equal(p.normalCycles[2][0],6);assert.equal(p.slots[2].participantIndex,0);
 assert.equal(p.slots[0].displayNumber,4);assert.equal(p.rowNumbers[3],7);
 assert.equal(next.startLists[0].rows.length,12);
});
test("empty rows use serial numbers and graphical empty route markers in every format",()=>{
 for(const format of ["classic","old","new"]){const s=state();if(format!=="classic"){s.activePreset=s.runtimePreset="final";s.activeSettings.finalRoundFormat=format;s.draftSettings.finalRoundFormat=format;s.activeSettings.oneShot=true;s.startListFinalCycle=2;}
  const next=ar.replaceQueue(s,[empty()]),p=slots.build(next,0,next.startLists[0]),slot=p.slots[0];
  assert.equal(slots.text(slot,1,next.startLists[0]),"-");assert.equal(slots.text(slot,2,next.startLists[0]),"-");assert.equal(slots.marker(slot,0,3,"rotation",0,240),"empty");
  if(format!=="classic"){assert.equal(ar.active(next).kind,"empty");assert.equal(ar.duration(ar.active(next)),240);assert.deepEqual(ar.startOffsets(ar.active(next)),[]);
   const future=ar.replaceQueue({...s,startListFinalCycle:0},[empty()]);future.startListFinalCycle=2;future.draftSettings.rotationMinutes=5;assert.equal(ar.stage(future).activeSettings.rotationSeconds,300);
  }
 }
});
test("Old Final permits exactly one athlete, rejects route pause and retains route stop",()=>{
 const s={...state(),activePreset:"final",runtimePreset:"final",startListFinalCycle:0};s.activeSettings={...s.activeSettings,oneShot:true,finalRoundFormat:"old"};s.draftSettings.finalRoundFormat="old";
 assert.throws(()=>ar.replaceQueue(s,[plan("bad",0,"flow",false,[entry(),entry(1,2)])]),/one-athlete/);
 const next=ar.replaceQueue(s,[plan("good",0)]);assert.equal(ar.active(next).entries.length,1);assert.equal(next.activeSettings.rotationSeconds,90);
 const list={...s.startLists[0],incidents:[{kind:"pause",route:0,startCycle:1,participantIndex:0}]};assert.equal(ar.listUpdateError(s,[list]),"route-pause-unavailable");
});
test("Classic solo automatically stages at the regular boundary and resumes the same flow coordinate",()=>{
 let s=ar.replaceQueue(state(),[plan("solo",2,"flow",true)]);
 assert.equal(ar.interruption(s),510);s=tx.applyTimerAction(s,start,{now:100000}).state;assert.equal(s.startedAt,100600);
 assert.equal(ar.interrupt(s,509.99),s);s=ar.interrupt(s,510);
 assert.equal(s.finalAppealActiveId,"solo");assert.equal(s.running,false);assert.equal(s.finalAppealClassicElapsed,510);assert.equal(s.activeSettings.rotationSeconds,90);
 s=tx.applyTimerAction(s,start,{now:620000}).state;assert.equal(s.startedAt,620600);assert.equal(s.activeSettings.oneShot,true);
 s=tx.applyTimerAction(s,{type:"pause"},{now:640600,elapsedAtAction:20}).state;
 s=tx.applyTimerAction(s,start,{now:650000}).state;assert.equal(s.manualStartLeadMs,0);assert.equal(s.finalAppealSignalFloor,20);
 s={...s,running:false,completed:true,elapsedBeforePause:90};s=tx.applyTimerAction(s,start,{now:750000}).state;
 assert.equal(s.finalAppealActiveId,"");assert.equal(s.startedAt,240600);assert.equal(s.manualStartLeadMs,600);assert.equal(s.activeSettings.oneShot,false);assert.equal(s.activeSettings.rotationSeconds,240);assert.equal(s.finalAppealRotations[0].completed,true);
 assert.equal(s.classicCueFloor,510);assert.equal(ar.interruption(s),null);
});
test("Classic solo Stop returns to the boundary; reset and rewind rearm the queue",()=>{
 let s=ar.replaceQueue(state(),[plan("solo",0,"flow",true)]);s=tx.applyTimerAction(s,start,{now:100000}).state;
 s=tx.applyTimerAction(s,{type:"reset"},{now:110000}).state;
 assert.equal(s.finalAppealActiveId,"");assert.equal(s.elapsedBeforePause,0);assert.equal(s.finalAppealRotations[0].completed,true);
 const rewind=ar.reposition(s,1);assert.equal(rewind.finalAppealRotations[0].completed,true);
 const future={...s,finalAppealRotations:[{...plan("later",2,"flow",true),completed:true}]};assert.equal(ar.reposition(future,2).finalAppealRotations[0].completed,false);
});
test("Classic flow cues use actual cycle, keep opt-in starts, deduplicate and never replay elapsed starts",()=>{
 let s=ar.replaceQueue(state(),[plan("a",2,"immediate",false,[entry(0,0,90,true),entry(1,1,90,true)])]);s={...s,running:true};
 const cues=signalsBetween(s,100000,99999,100000+5*255000);
 const extra=cues.filter(c=>c.key.startsWith("flowStart:"));assert.equal(extra.length,1);assert.equal(extra[0].at,100000+2*255000+150000);assert.equal(extra[0].grace,3000);
 assert.equal(signalsBetween({...s,classicCueFloor:660},100000,99999,1500000).filter(c=>c.key.startsWith("flowStart:")).length,0);
 const solo={...s,finalAppealRotations:[plan("solo",2,"flow",true)]};const cutoff=signalsBetween(solo,100000,99999,100000+3*255000);
 assert.equal(cutoff.some(c=>c.at>610000),false);assert.equal(cutoff.some(c=>c.kind==="start"&&c.at===610000),false);
 const noBreak={...solo,activeSettings:{rotationSeconds:240,breakSeconds:0}};assert.equal(signalsBetween(noBreak,100000,579999,580001)[0].kind,"end");
});
test("conflicting repeats are rejected without changing the regular timeline",()=>{
 const s=state();assert.throws(()=>ar.replaceQueue(s,[plan("a",2,"immediate"),plan("b",2,"immediate")]),/rotation-conflict/);
 assert.deepEqual(s.finalAppealRotations,[]);
});
test("editing a Classic solo into the past cannot rewind the running timer; forward seek and reset reconcile pending solos",()=>{
 const queued=ar.replaceQueue(state(),[plan("later",8,"flow",true)]);
 const running={...queued,running:true,elapsed:1000,startedAt:123456};
 const edited=ar.replaceQueue(running,[plan("later",2,"flow",true)]);
 assert.equal(edited.finalAppealRotations[0].completed,true);assert.equal(ar.interruption(edited),null);assert.equal(edited.startedAt,123456);
 const jumped=tx.applyTimerAction(queued,{type:"seek",elapsed:2500}).state;assert.equal(jumped.finalAppealRotations[0].completed,true);
 const reset=tx.applyTimerAction(jumped,{type:"reset"}).state;assert.equal(reset.finalAppealRotations[0].completed,false);assert.equal(reset.elapsedBeforePause,0);
});
test("Classic next-cycle seek follows the solo queue and then returns to the regular rotation", async t => {
 const server = await fixture(t, "darwin");
 await server.action({type:"settings",activePreset:"classic",settings:{rotationMinutes:4,breakSeconds:15,oneShot:false}});
 await server.action({type:"startLists",startLists:lists()});
 await server.action({type:"finalAppeals",rotations:[
  plan("first",2,"flow",true,[entry(0,0,60)]),
  plan("second",2,"flow",true,[entry(1,1,90)])
 ]});

 // A direct jump skips earlier solos. Moving one rotation follows the boundary.
 let state = await server.action({type:"seekCycle",cycle:3});
 assert.equal(state.finalAppealActiveId,"");
 assert.equal(state.finalAppealRotations[0].completed,true);
 state = await server.action({type:"seekCycle",cycle:2});
 assert.equal(state.finalAppealRotations[0].completed,false);

 state = await server.action({type:"seekCycle",cycle:3});
 assert.equal(state.finalAppealActiveId,"first");
 assert.equal(state.finalAppealClassicElapsed,510);
 assert.equal(state.activeSettings.rotationSeconds,60);
 assert.equal(state.elapsedBeforePause,0);
 assert.equal(state.running,false);

 // Both solos display the next regular rotation number (3).
 state = await server.action({type:"seekCycle",cycle:4});
 assert.equal(state.finalAppealActiveId,"second");
 assert.equal(state.finalAppealRotations[0].completed,true);
 assert.equal(state.activeSettings.rotationSeconds,90);

 state = await server.action({type:"seekCycle",cycle:4});
 assert.equal(state.finalAppealActiveId,"");
 assert.equal(state.elapsedBeforePause,510);
 assert.equal(state.running,false);
 assert.equal(state.activeSettings.rotationSeconds,240);
 assert.deepEqual(state.finalAppealRotations.map(plan => plan.completed),[true,true]);

 state = await server.action({type:"seekCycle",cycle:2});
 assert.deepEqual(state.finalAppealRotations.map(plan => plan.completed),[false,false]);
});

test("server stages Classic solo without a browser, persists its resume coordinate and continues normally",{timeout:12000},async t=>{
 const server=await fixture(t,"darwin");await server.action({type:"primary",primaryClientId:"clock-test"});
 await server.action({type:"settings",activePreset:"classic",settings:{rotationMinutes:1,breakSeconds:5,oneShot:false}});await server.action({type:"startLists",startLists:lists()});
 await server.action({type:"finalAppeals",rotations:[plan("solo",1,"flow",true,[entry(0,0,30)])]});await server.start({settings:{rotationSeconds:60,breakSeconds:5,oneShot:false}});
 await server.frame(65001);let s=await server.state();assert.equal(s.running,false);assert.equal(s.finalAppealActiveId,"solo");assert.equal(s.finalAppealClassicElapsed,65);
 await server.restart();s=await server.state();assert.equal(s.finalAppealClassicElapsed,65);assert.equal(s.activeSettings.rotationSeconds,30);
 await server.start();await server.frame(95002);s=await server.state();assert.equal(s.completed,true);
 await server.start();s=await server.state();assert.equal(s.finalAppealActiveId,"");assert.equal(s.activeSettings.oneShot,false);assert.ok(s.now-s.startedAt>=65000&&s.now-s.startedAt<66000);
});
test("SEC retains Classic solo's regular coordinate and both placement choices through takeover",{timeout:15000},async t=>{
 const primary=await fixture(t,"linux",{requestTimeoutMs:3000}),backup=await fixture(t,"linux",{requestTimeoutMs:3000});
 await primary.action({type:"primary",primaryClientId:"clock-test"});await primary.action({type:"settings",activePreset:"classic",settings:{rotationMinutes:4,breakSeconds:15,oneShot:false}});await primary.action({type:"startLists",startLists:lists()});
 await primary.action({type:"finalAppeals",rotations:[plan("solo",2,"flow",true),plan("flow",5),plan("now",9,"immediate")]});await primary.start({settings:{rotationSeconds:240,breakSeconds:15,oneShot:false}});primary.frame(510001);backup.frame(510001);assert.equal((await primary.state()).finalAppealActiveId,"solo");await primary.start();
 const auth=require("./helpers/browser-session").authenticatedFetch;
 const response=await auth(primary.baseUrl+"/api/sec/configure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",address:backup.baseUrl})});assert.equal(response.status,200);
 let mirrored;const deadline=Date.now()+5000;while(Date.now()<deadline){mirrored=await backup.state();if(mirrored.finalAppealActiveId==="solo")break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(mirrored.finalAppealActiveId,"solo");assert.equal(mirrored.finalAppealClassicElapsed,510);assert.equal(mirrored.finalAppealRegularSettings.rotationSeconds,240);assert.deepEqual(mirrored.finalAppealRotations.map(p=>p.placement),["flow","flow","immediate"]);
 await primary.stop();backup.frame(512101);const result=await auth(backup.baseUrl+"/api/sec/takeover",{method:"POST",headers:{"content-type":"application/json",Origin:primary.baseUrl},body:JSON.stringify({clientId:"clock-test",automatic:true,session:mirrored.sec.session})});assert.equal(result.status,200);
 const promoted=await backup.state();assert.equal(promoted.runtimePreset,"classic");assert.equal(promoted.finalAppealActiveId,"solo");assert.equal(promoted.finalAppealClassicElapsed,510);assert.equal(promoted.finalAppealRegularSettings.rotationSeconds,240);
});
