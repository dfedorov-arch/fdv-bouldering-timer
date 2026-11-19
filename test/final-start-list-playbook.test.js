"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const d = require("../lib/start-list-display");
const {fixture} = require("./helpers/controlled-clock-server");
const settings = {rotationSeconds:240,breakSeconds:0,oneShot:true,finalRoundFormat:"new",finalRestRotations:3};
const list = (count, excludedParticipants=[]) => ({headers:["#","Name"],rows:Array.from({length:count},(_,i)=>[String(i+1),"Athlete "+(i+1)]),routeCount:4,excludedParticipants});
test("exclusion display distinguishes a removed nominal rotation from a retained DNS slot",()=>{
 const schedule=d.finalSchedule(list(8,[2]),{finalRoundFormat:"new"});
 assert.equal(d.excludedCellSkipped(2,0,schedule),true);assert.equal(d.excludedCellSkipped(2,1,schedule),false);
 assert.equal(d.excludedCellSkipped(2,0,{}),true);assert.equal(d.excludedCellSkipped(2,0,{finalFormat:"old"}),true);
 const other=list(8);const shared=d.finalSchedule(list(8,[2]),{finalRoundFormat:"new"},d.finalSkippedRotations([list(8,[2]),other]));assert.equal(d.excludedCellSkipped(2,0,shared),false);
});

test("Playbook tables: all 32/36 starts match the 8- and 9-starter examples",()=>{
  for(const [count,offsets,last] of [[8,[0,4,8,12],20],[9,[0,4,9,13],22]]) {
    const s=d.finalSchedule(list(count),settings);
    for(let p=0;p<count;p++)for(let r=0;r<4;r++)
      assert.equal(d.attemptCycle(p,r,s),p+1+offsets[r],`N=${count} athlete=${p+1} B${r+1}`);
    assert.equal(d.attemptCycle(count-1,3,s),last);
  }
});

test("every rotation is occupied and at most two boulders are active for 8 through 100 starters",()=>{
  for(let n=8;n<=100;n++) {
    const s=d.finalSchedule(list(n),settings), occupied=new Map();
    for(let p=0;p<n;p++)for(let r=0;r<4;r++) {
      const c=d.attemptCycle(p,r,s);
      if(!occupied.has(c))occupied.set(c,[]);
      occupied.get(c).push(r);
      if(r)assert.ok(c>d.attemptCycle(p,r-1,s));
    }
    const end=d.attemptCycle(n-1,3,s);
    for(let c=1;c<=end;c++) {
      assert.ok(occupied.has(c),`N${n} empty rotation ${c}`);
      assert.ok(occupied.get(c).length<=2,`N${n} triple rotation ${c}`);
      assert.equal(new Set(occupied.get(c)).size,occupied.get(c).length);
    }
  }
});

test("DNS third starter: the fourth climbs on the third actual start; scheduled holes on later routes remain",()=>{
  const s=d.finalSchedule(list(8,[2]),settings);
  assert.deepEqual(s.skippedRotations,[3]);
  assert.equal(d.attemptCycle(3,0,s),3);
  assert.equal(d.attemptCycle(0,1,s),4); // nominal 5, after skipping nominal 3
  assert.equal(d.attemptCycle(3,1,s),7); // nominal 8; physical 6 is the DNS hole on B2
  assert.equal(d.participantAtCycle(1,6,[],8,s),-1);
  assert.equal(d.participantAtCycle(2,6,[],8,s),-1);
  assert.equal(d.participantAtCycle(0,6,[],8,s),6); // seventh starter is still on B1
  assert.equal(d.attemptCycle(7,3,s),19);
  assert.equal(d.marker(2,0,3,"rotation",[],s),"dns");
});

test("DNS fifth starter: rotations 5-16 stay unchanged; empty nominal 17 is omitted",()=>{
  const s=d.finalSchedule(list(8,[4]),settings);
  assert.deepEqual(s.skippedRotations,[17]);
  assert.equal(d.attemptCycle(5,0,s),6);
  assert.equal(d.participantAtCycle(1,9,[],8,s),-1);
  assert.equal(d.participantAtCycle(2,13,[],8,s),-1);
  assert.equal(d.attemptCycle(5,3,s),17);
  assert.equal(d.attemptCycle(7,3,s),19);
});

test("all DNS combinations preserve starter slots and omit only empty actual rotations",()=>{
  for(let mask=0;mask<255;mask++) {
    const dns=Array.from({length:8},(_,i)=>i).filter(i=>mask&(1<<i));
    const s=d.finalSchedule(list(8,dns),settings), counts=new Map();
    for(let p=0;p<8;p++)for(let r=0;r<4;r++) {
      if(dns.includes(p))continue;
      const c=d.attemptCycle(p,r,s);counts.set(c,(counts.get(c)||0)+1);
      assert.equal(d.participantScheduleIndex(p,dns,8,s),p);
      assert.equal(d.participantRowIndex(p,dns,8,s),p);
    }
    for(let c=1;c<=Math.max(...counts.keys());c++)assert.ok(counts.get(c)>0&&counts.get(c)<=2);
  }
});

test("shared stage mapping does not skip a slot occupied in another list; cache keys follow DNS and field size",()=>{
  const a=list(8,[2]), b=list(8);
  assert.deepEqual(d.finalSkippedRotations([a]),[3]);
  assert.deepEqual(d.finalSkippedRotations([a,b]),[]);
  const cached=d.finalSkippedRotations([a]);cached.push(999);
  assert.deepEqual(d.finalSkippedRotations([a]),[3]);
  a.excludedParticipants=[4];assert.deepEqual(d.finalSkippedRotations([a]),[17]);
  assert.deepEqual(d.finalSchedule(b,{finalRoundFormat:"old"}).skippedRotations,[]);
  assert.equal(d.participantScheduleIndex(3,[2],8,{finalFormat:"old"}),2);
});

test("server publishes one stage mapping, keeps continuous counter/clock on Start Stop seek and restart",async t=>{
  const server=await fixture(t,"darwin",{requestTimeoutMs:3000});
  await server.action({type:"primary",primaryClientId:"clock-test"});
  await server.action({type:"startLists",startLists:[list(8,[2])]});
  await server.action({type:"settings",activePreset:"final",settings:{rotationMinutes:4,breakSeconds:0,oneShot:true,finalRoundFormat:"new"}});
  const before=await server.state();assert.deepEqual(before.startListFinalSkippedRotations,[3]);
  await server.action({type:"seekCycle",cycle:3});
  const started=await server.start({activePreset:"final",settings});
  assert.equal(started.startListFinalCycle,2);
  const s=d.finalSchedule(started.startLists[0],settings,started.startListFinalSkippedRotations);
  assert.equal(d.marker(3,0,3,"rotation",[],s),"active");
  const anchor=started.timerClock.startedAt;
  const unchanged=await server.action({type:"startLists",startLists:[list(8,[2]),list(8)]});
  assert.deepEqual(unchanged.startListFinalSkippedRotations,[]);
  assert.equal(unchanged.timerClock.startedAt,anchor);
  assert.equal(unchanged.startListFinalCycle,2);
  await server.action({type:"reset",activePreset:"final",settings});
  const stopped=await server.state();assert.equal(stopped.startListFinalCycle,3);
  await server.restart();const restored=await server.state();
  assert.equal(restored.startListFinalCycle,3);assert.deepEqual(restored.startListFinalSkippedRotations,[]);
});
