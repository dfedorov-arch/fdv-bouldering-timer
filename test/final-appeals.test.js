"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const ar=require("../lib/final-appeals"),{signalsBetween}=require("../lib/server-audio-plan");
const {createTimerTransitions}=require("../lib/timer-transitions"),{fixture}=require("./helpers/controlled-clock-server");
const domain=require("../lib/timer-domain").createTimerDomain({classicRotationMinutes:4,classicBreakSeconds:15});
const settings={rotationSeconds:240,breakSeconds:0,oneShot:true,finalRoundFormat:"new",finalRestRotations:3};
const list=()=>({headers:["#","Name"],rows:Array.from({length:8},(_,i)=>[String(i+1),"Athlete "+(i+1)]),routeCount:4,excludedParticipants:[]});
const state=()=>({activePreset:"final",runtimePreset:"final",activeSettings:{...settings},draftSettings:{rotationMinutes:4,breakSeconds:0,oneShot:true,finalRoundFormat:"new"},startLists:[list()],startListFinalCycle:2,version:1,elapsedBeforePause:0,running:false,completed:false});
const entry=(pi,route,timeSeconds,startSignal=false)=>({listIndex:0,participantIndex:pi,route,timeSeconds,startSignal});
const plan=(id="ar1",afterCycle=2,entries=[entry(0,0,120),entry(1,1,90)])=>({id,afterCycle,entries,completed:false});
const transitions=createTimerTransitions(domain,{manualStartAudioLeadMs:600});
const start={type:"start",activePreset:"final",settings,startAudioLead:true,startMode:"manual",startHours:"",startMinutes:""};

test("A/R queue uses maximum time, permits several athletes and keeps all start signals opt-in",()=>{
 const s=ar.replaceQueue(state(),[plan("ar1",2,[entry(0,0,90),entry(1,1,120),entry(2,2,45)])]);
 assert.equal(s.activeSettings.rotationSeconds,120);assert.equal(s.finalAppealRegularSettings.rotationSeconds,240);
 assert.deepEqual(ar.startOffsets(ar.active(s)),[]);assert.equal(ar.initialStartAllowed(s),false);
 assert.equal(ar.marker(s,0,0,0,0,"done"),"ready");
 const running={...s,running:true};assert.equal(ar.marker(running,0,1,1,0,""),"active");
 assert.equal(ar.marker(running,0,0,0,29.999,""),"ready");assert.equal(ar.marker(running,0,0,0,30,""),"active");
 assert.equal(ar.marker({...running,completed:true},0,0,0,120,""),"done");
});

test("A/R validation rejects duplicate athletes/routes, empty/missing/invalid time, past anchors and DNS",()=>{
 for(const entries of [[entry(0,0,120),entry(0,1,90)],[entry(0,0,120),entry(1,0,90)],[],[entry(0,0,0)],[entry(0,0,3601)],[entry(0,9,120)]])assert.throws(()=>ar.normalize([plan("ar1",2,entries)],state()));
 assert.throws(()=>ar.normalize([plan("ar1",1)],state()),/rotation-after/);
 const dns=state();dns.startLists[0].excludedParticipants=[0];assert.throws(()=>ar.normalize([plan()],dns),/rotation-athlete/);
 assert.throws(()=>ar.normalize([plan()],{...state(),activePreset:"festival"}),/final-required/);
});

test("staged A/R remains editable/removable; an actually running attempt is immutable",()=>{
 let s=ar.replaceQueue(state(),[plan()]);s=ar.replaceQueue(s,[plan("ar1",2,[entry(0,0,75)])]);
 assert.equal(s.activeSettings.rotationSeconds,75);
 const cleared=ar.replaceQueue(s,[]);assert.equal(cleared.activeSettings.rotationSeconds,240);assert.equal(ar.active(cleared),null);
 s={...s,running:true};assert.throws(()=>ar.replaceQueue(s,[]),/rotation-locked/);
 assert.throws(()=>ar.replaceQueue(s,[plan("ar1",2,[entry(0,0,80)])]),/rotation-locked/);
 assert.equal(ar.replaceQueue(s,s.finalAppealRotations).finalAppealActiveId,"ar1");
});

test("A/R times are bounded by the ordinary draft even while a shorter A/R is staged",()=>{
 const s=ar.replaceQueue(state(),[plan()]);assert.equal(ar.maximumTime(s),240);
 assert.throws(()=>ar.replaceQueue(s,[plan("ar1",2,[entry(0,0,241)])]),/rotation-time/);
 assert.equal(ar.replaceQueue(s,[plan("ar1",2,[entry(0,0,240)])]).activeSettings.rotationSeconds,240);
 const short={...s,draftSettings:{...s.draftSettings,rotationMinutes:1.5}};
 assert.equal(ar.maximumTime(short),90);assert.throws(()=>ar.replaceQueue(short,[plan("ar1",2,[entry(0,0,91)])]),/rotation-time/);
 const long={...s,draftSettings:{...s.draftSettings,rotationMinutes:75}};
 assert.equal(ar.replaceQueue(long,[plan("ar1",2,[entry(0,0,4200)])]).activeSettings.rotationSeconds,4200);
});

test("preparation selects the actual next A/R, retaining current climbers and replacing ordinary ready markers",()=>{
 const s={...state(),startListFinalCycle:9,running:true,finalAppealRotations:[plan("after10",10,[entry(7,3,120)])]};
 assert.equal(ar.upcoming(s).id,"after10");
 assert.equal(ar.marker(s,0,7,3,30,""),"ready");
 assert.equal(ar.marker(s,0,6,1,30,"ready"),"");
 assert.equal(ar.marker(s,0,5,1,30,"active"),"active");
 assert.equal(ar.marker(s,0,7,0,30,"done"),"done");
 const previous={...s,startListFinalCycle:8};assert.equal(ar.upcoming(previous),null);assert.equal(ar.marker(previous,0,6,1,30,"ready"),"ready");
 const changed={...s,finalAppealRotations:[plan("after10",10,[entry(6,3,120)])]};assert.notEqual(ar.progress(s,30),ar.progress(changed,30));
 const staged=ar.replaceQueue({...state(),startListFinalCycle:10},s.finalAppealRotations);
 assert.equal(ar.marker(staged,0,6,1,0,"ready"),"");
 assert.equal(ar.marker({...staged,running:true},0,6,1,1,"ready"),"ready");
 const two=ar.replaceQueue({...state(),startListFinalCycle:10},[...s.finalAppealRotations,plan("second",10,[entry(3,2,90)])]);
 assert.equal(ar.marker({...two,running:true},0,6,1,1,"ready"),"");
 assert.equal(ar.marker({...two,running:true},0,3,2,1,""),"ready");
});

test("completed A/R records can be edited/deleted, while rewinding re-arms their original position",()=>{
 const completed={...plan("history",10),completed:true};
 const s={...state(),startListFinalCycle:12,finalAppealRotations:[completed]};
 assert.equal(ar.locked(s,completed),false);assert.equal(ar.replaceQueue(s,[]).finalAppealRotations.length,0);
 const edited=ar.replaceQueue(s,[{...completed,entries:[entry(0,0,60)]}]);
 assert.equal(edited.finalAppealRotations[0].entries[0].timeSeconds,60);assert.equal(edited.finalAppealRotations[0].completed,true);
 const rewound=ar.reposition(edited,9);assert.equal(rewound.finalAppealRotations[0].completed,false);
 assert.equal(rewound.finalAppealRotations[0].afterCycle,10);
 const atTen={...rewound,startListFinalCycle:9,running:true};assert.equal(ar.upcoming(atTen).id,"history");
});

test("restoring a snapshot from an older backwards seek re-arms future A/R without changing its clock",()=>{
 const done={...plan("old",10),completed:true};
 const before={...state(),startListFinalCycle:8,elapsedBeforePause:0.001,startedAt:12345,finalAppealRotations:[done]};
 const restored=ar.restoreTimeline(before);assert.equal(restored.finalAppealRotations[0].completed,false);assert.equal(restored.startedAt,12345);assert.equal(restored.elapsedBeforePause,0.001);assert.equal(restored.startListFinalCycle,8);
 assert.equal(ar.restoreTimeline({...before,startListFinalCycle:10,elapsedBeforePause:0}).finalAppealRotations[0].completed,true);
 const active={...before,finalAppealActiveId:"old",completed:true};assert.equal(ar.restoreTimeline(active),active);
});

test("editing a different block cannot reset a paused A/R; editing that A/R restages it with a fresh cue floor",()=>{
 const staged=ar.replaceQueue(state(),[plan(),plan("later",5)]);
 const paused={...staged,running:false,elapsedBeforePause:31,finalAppealSignalFloor:30};
 const other=ar.replaceQueue(paused,[staged.finalAppealRotations[0],plan("later",6)]);
 assert.equal(other.elapsedBeforePause,31);assert.equal(other.finalAppealSignalFloor,30);assert.equal(other.finalAppealActiveId,"ar1");
 const edit=ar.replaceQueue(paused,[plan("ar1",2,[entry(0,0,100)]),staged.finalAppealRotations[1]]);
 assert.equal(edit.elapsedBeforePause,0);assert.equal(edit.finalAppealSignalFloor,0);assert.equal(edit.activeSettings.rotationSeconds,100);
});

test("Start, pause/resume, Stop, consecutive A/R and regular next start keep the ordinary counter",()=>{
 let s=ar.replaceQueue(state(),[plan(),plan("ar2")]);
 let r=transitions.applyTimerAction(s,start,{now:100000,actionNow:100000});s=r.state;
 assert.equal(s.startedAt,100600);assert.equal(r.effects.audioWakeCommand.kind,"prewarm");
 assert.equal(s.startListFinalCycle,2);assert.equal(s.activeSettings.rotationSeconds,120);
 s=transitions.applyTimerAction(s,{type:"pause"},{now:110600,elapsedAtAction:10}).state;
 s=transitions.applyTimerAction(s,{...start,elapsedBeforePause:10},{now:120000}).state;
 assert.equal(s.manualStartLeadMs,0);assert.equal(s.activeSettings.rotationSeconds,120);assert.equal(s.startListFinalCycle,2);
 s=transitions.applyTimerAction(s,{type:"reset",settings,activePreset:"final"},{now:125000}).state;
 assert.equal(s.finalAppealRotations[0].completed,true);assert.equal(s.finalAppealActiveId,"ar2");assert.equal(s.startListFinalCycle,2);
 s=transitions.applyTimerAction(s,start,{now:130000}).state;
 s={...s,running:false,completed:true,elapsedBeforePause:120};
 s=transitions.applyTimerAction(s,start,{now:260000}).state;
 assert.equal(s.finalAppealActiveId,"");assert.equal(s.startListFinalCycle,2);assert.equal(s.activeSettings.rotationSeconds,240);
 assert.equal(s.finalAppealRotations.every(p=>p.completed),true);
 // Completing the next ordinary rotation advances exactly once.
 s={...s,running:false,completed:true,elapsedBeforePause:240};
 s=transitions.applyTimerAction(s,start,{now:510000}).state;assert.equal(s.startListFinalCycle,3);
});

test("ordinary completion inserts A/R before the next regular rotation without renumbering",()=>{
 const initial={...state(),running:false,completed:true,elapsedBeforePause:240,finalAppealRotations:[plan("ar1",3)]};
 const r=transitions.applyTimerAction(initial,start,{now:100000});
 assert.equal(r.state.startListFinalCycle,3);assert.equal(r.state.finalAppealActiveId,"ar1");assert.equal(r.state.startedAt,100600);
 assert.equal(r.effects.finalAppealCycleHandled,true);
});

test("returning from the last A/R applies the current ordinary draft, retaining the counter",()=>{
 const staged=ar.replaceQueue(state(),[plan()]);
 const completed={...staged,running:false,completed:true,elapsedBeforePause:120};
 const r=transitions.applyTimerAction(completed,{...start,settings:{...settings,rotationSeconds:300}},{now:200000});
 assert.equal(r.state.finalAppealActiveId,"");assert.equal(r.state.activeSettings.rotationSeconds,300);assert.equal(r.state.startListFinalCycle,2);
});

test("scheduled A/R keeps the existing silent preliminary countdown and manual-start warm-up",()=>{
 let s=ar.replaceQueue(state(),[plan()]);
 s=transitions.applyTimerAction(s,{...start,startMode:"scheduled"},{now:100000}).state;
 assert.equal(s.countdownOnly,true);assert.equal(s.activeSettings.rotationSeconds,120);assert.equal(s.manualStartLeadMs,0);
 assert.equal(ar.marker(s,0,0,0,0,""),"ready");
 assert.equal(signalsBetween(s,s.startedAt,99999,100001).filter(c=>c.kind==="start").length,0);
 s={...s,running:false,countdownOnly:false,waitingForManualStart:true};
 const manual=transitions.applyTimerAction(s,start,{now:110000});
 assert.equal(manual.state.countdownOnly,false);assert.equal(manual.state.startListFinalCycle,2);
 assert.equal(manual.effects.audioWakeCommand.kind,"prewarm");assert.equal(manual.state.startedAt,110600);
});

test("native plan retains common minute/five/finish, suppresses unselected starts and deduplicates simultaneous starts",()=>{
 let s=ar.replaceQueue(state(),[plan("ar1",2,[entry(0,0,120),entry(1,1,90,true),entry(2,2,90,true)])]);
 s={...s,running:true,audioRunId:"stable-run"};
 const cues=signalsBetween(s,100000,99999,220001);
 assert.deepEqual(cues.filter(c=>c.kind==="start").map(c=>[c.at,c.key]),[[130000,"appealStart:ar1:30:stable-run"]]);
 assert.equal(cues.find(c=>c.kind==="minute").at,160000);
 assert.deepEqual(cues.filter(c=>c.kind==="warn").map(c=>c.at),[215000,216000,217000,218000,219000]);
 assert.equal(cues.at(-1).kind,"end");assert.equal(cues.at(-1).at,220000);
 s=ar.replaceQueue(state(),[plan("ar2",2,[entry(0,0,120,true),entry(1,1,120,true)])]);
 const starts=signalsBetween({...s,running:true},100000,99999,100001).filter(c=>c.kind==="start");assert.equal(starts.length,1);
});

test("server persists A/R state, retains warm-up lead, rejects non-primary writes and does not advance on A/R Stop",async t=>{
 const server=await fixture(t,"darwin",{requestTimeoutMs:3000});
 await server.action({type:"primary",primaryClientId:"clock-test"});
 await server.action({type:"startLists",startLists:[list()]});
 await server.action({type:"settings",activePreset:"final",settings:state().draftSettings});
 const saved=await server.action({type:"finalAppeals",rotations:[plan("ar_live",0)]});
 assert.equal(saved.finalAppealActiveId,"ar_live");assert.equal(saved.activeSettings.rotationSeconds,120);
 const response=await require("./helpers/browser-session").authenticatedFetch(server.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:"finalAppeals",rotations:[],clientId:"ar-viewer"})});
 assert.equal(response.status,403);assert.equal((await server.state()).finalAppealActiveId,"ar_live");
 const running=await server.start({...start});assert.equal(running.manualStartLeadMs,600);assert.equal(running.startListFinalCycle,0);
 const stopped=await server.action({type:"reset",settings,activePreset:"final"});
 assert.equal(stopped.finalAppealRotations[0].completed,true);assert.equal(stopped.startListFinalCycle,0);assert.equal(stopped.activeSettings.rotationSeconds,240);
 await server.restart();const restored=await server.state();assert.equal(restored.finalAppealRotations[0].completed,true);
 assert.equal(restored.startListFinalCycle,0);
});

test("a paused A/R never replays elapsed start cues and keeps future selected starts",()=>{
 let s=ar.replaceQueue(state(),[plan("resume",2,[entry(0,0,120,true),entry(1,1,90,true),entry(2,2,60,true)])]);
 s={...s,running:false,elapsedBeforePause:31};
 s=transitions.applyTimerAction(s,{...start,elapsedBeforePause:31},{now:200000}).state;
 assert.equal(s.finalAppealSignalFloor,31);assert.equal(ar.initialStartAllowed(s),false);
 const cues=signalsBetween(s,s.startedAt,s.startedAt-1,s.startedAt+120001).filter(c=>c.kind==="start");
 assert.deepEqual(cues.map(c=>c.at-s.startedAt),[60000]);assert.equal(cues[0].grace,3000);
});

test("list changes cannot invalidate pending A/R assignments; New Final route pause is rejected but permanent stop remains",()=>{
 const s=ar.replaceQueue(state(),[plan()]);
 const renamed=list();renamed.rows[0][1]="Another athlete";assert.equal(ar.listUpdateError(s,[renamed]),"rotation-list-locked");
 const dns=list();dns.excludedParticipants=[0];assert.equal(ar.listUpdateError(s,[dns]),"rotation-athlete-locked");
 const stopped=list();stopped.incidents=[{kind:"stop",route:1,startCycle:3}];assert.equal(ar.listUpdateError(s,[stopped]),"");
 const paused=list();paused.incidents=[{kind:"pause",route:1,startCycle:3,participantIndex:0,resumeCycle:null}];assert.equal(ar.listUpdateError(s,[paused]),"route-pause-unavailable");
 const mixed={...stopped,incidents:[...stopped.incidents,...paused.incidents]};
 assert.deepEqual(ar.retainedIncidents(s,mixed),stopped.incidents);
 assert.deepEqual(ar.retainedIncidents({...s,activeSettings:{...settings,finalRoundFormat:"old"},draftSettings:{finalRoundFormat:"old"}},mixed),stopped.incidents);
});

test("SEC transfers the active A/R queue, cue floor and run identity before takeover",{timeout:15000},async t=>{
 const primary=await fixture(t,"linux",{requestTimeoutMs:3000}),backup=await fixture(t,"linux",{requestTimeoutMs:3000});
 await primary.action({type:"primary",primaryClientId:"clock-test"});await primary.action({type:"startLists",startLists:[list()]});
 await primary.action({type:"settings",activePreset:"final",settings:state().draftSettings});
 await primary.action({type:"finalAppeals",rotations:[plan("ar_sec",0,[entry(0,0,120,true),entry(1,1,90,true)])]});
 await primary.start({...start});primary.frame(31000);
 await primary.action({type:"pause"});await primary.start({...start});
 const original=await primary.state();assert.ok(original.finalAppealSignalFloor>0);
 const response=await require("./helpers/browser-session").authenticatedFetch(primary.baseUrl+"/api/sec/configure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",address:backup.baseUrl})});
 assert.equal(response.status,200);
 const until=async fn=>{const deadline=Date.now()+5000;while(Date.now()<deadline){const result=await fn();if(result)return result;await new Promise(resolve=>setTimeout(resolve,40));}assert.fail("SEC did not converge");};
 const mirrored=await until(async()=>{const s=await backup.state();return s.finalAppealActiveId==="ar_sec"&&s;});
 assert.deepEqual(mirrored.finalAppealRotations,original.finalAppealRotations);assert.equal(mirrored.finalAppealSignalFloor,original.finalAppealSignalFloor);assert.equal(mirrored.audioRunId,original.audioRunId);
 await primary.stop();backup.frame(2100);
 const takeover=await require("./helpers/browser-session").authenticatedFetch(backup.baseUrl+"/api/sec/takeover",{method:"POST",headers:{"content-type":"application/json",Origin:primary.baseUrl},body:JSON.stringify({clientId:"clock-test",automatic:true,session:mirrored.sec.session})});
 assert.equal(takeover.status,200);const promoted=await backup.state();assert.equal(promoted.finalAppealActiveId,"ar_sec");assert.equal(promoted.audioRunId,original.audioRunId);assert.equal(promoted.startListFinalCycle,0);
});

test("server enforces the round cap and supports completed editing, rewind and removal without changing ordinary numbering",async t=>{
 const server=await fixture(t,"darwin",{requestTimeoutMs:3000});
 await server.action({type:"primary",primaryClientId:"clock-test"});await server.action({type:"startLists",startLists:[list()]});
 await server.action({type:"settings",activePreset:"final",settings:state().draftSettings});
 const invalid=await require("./helpers/browser-session").authenticatedFetch(server.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",type:"finalAppeals",rotations:[plan("over",10,[entry(0,0,241)])]})});
 assert.equal(invalid.status,400);assert.equal((await invalid.json()).finalAppealError,"rotation-time");
 await server.action({type:"finalAppeals",rotations:[plan("again",10,[entry(0,0,2)])]});
 await server.action({type:"seekCycle",cycle:10});await server.start({...start});await server.action({type:"reset",activePreset:"final",settings});
 assert.equal((await server.state()).startListFinalCycle,10);
 await server.start({...start});server.frame(4000);assert.equal((await server.state()).completed,true);
 let s=await server.action({type:"reset",activePreset:"final",settings});assert.equal(s.finalAppealRotations[0].completed,true);
 s=await server.action({type:"finalAppeals",rotations:[{...s.finalAppealRotations[0],entries:[entry(0,0,1)]}]});
 assert.equal(s.finalAppealActiveId,"again");assert.equal(s.activeSettings.rotationSeconds,1);assert.equal(s.startListFinalCycle,10);
 await server.start({...start});server.frame(7000);assert.equal((await server.state()).completed,true);
 s=await server.action({type:"seekCycle",cycle:9});assert.equal(s.finalAppealActiveId,"");assert.equal(s.finalAppealRotations[0].completed,false);
 assert.equal(s.startListFinalCycle,8);assert.equal(s.activeSettings.rotationSeconds,240);
 s=await server.action({type:"finalAppeals",rotations:[{...s.finalAppealRotations[0],entries:[entry(1,1,60)]}]});
 assert.equal(s.finalAppealRotations[0].entries[0].participantIndex,1);
 s=await server.action({type:"finalAppeals",rotations:[]});assert.deepEqual(s.finalAppealRotations,[]);assert.equal(s.startListFinalCycle,8);
});

test("selecting rotation 9 in New Final stages the queued extra rotation after 8", async t => {
 const server = await fixture(t, "darwin", { requestTimeoutMs: 3000 });
 await server.action({ type: "primary", primaryClientId: "clock-test" });
 await server.action({ type: "startLists", startLists: [list()] });
 await server.action({ type: "settings", activePreset: "final", settings: state().draftSettings });
 await server.action({ type: "seekCycle", cycle: 8 });
 const before = await server.action({ type: "finalAppeals", rotations: [plan("after8", 8, [entry(1, 0, 120)])] });
 assert.equal(ar.upcoming(before).id, "after8");
 assert.equal(before.activeSettings.rotationSeconds, 240);

 const staged = await server.action({ type: "seekCycle", cycle: 9 });
 assert.equal(staged.finalAppealActiveId, "after8");
 assert.equal(staged.startListFinalCycle, 8);
 assert.equal(staged.activeSettings.rotationSeconds, 120);
 assert.equal(staged.elapsedBeforePause, 0);
 assert.equal(staged.running, false);

 const running = await server.start({ ...start });
 assert.equal(running.finalAppealActiveId, "after8");
 assert.equal(running.activeSettings.rotationSeconds, 120);
 assert.equal(ar.initialStartAllowed(running), false);
 const stopped = await server.action({ type: "reset", activePreset: "final", settings });
 assert.equal(stopped.finalAppealActiveId, "");
 assert.equal(stopped.startListFinalCycle, 8);
 assert.equal(stopped.activeSettings.rotationSeconds, 240);
 assert.equal(stopped.finalAppealRotations[0].completed, true);
 const ordinary = await server.action({ type: "seekCycle", cycle: 9 });
 assert.equal(ordinary.finalAppealActiveId, "");
 assert.equal(ordinary.activeSettings.rotationSeconds, 240);
});
