"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {create,settings}=require("../lib/speaker-keep-awake");
const {syntheticWave}=require("../lib/server-audio-native");
const {fixture}=require("./helpers/controlled-clock-server");
test("quiet pulses wait for an idle interval and never catch up in a burst",()=>{
 const p=create();assert.equal(p.tick(1000,true),null);assert.equal(p.tick(180999,true),null);
 assert.equal(p.tick(181000,true).at,181200);assert.equal(p.tick(181001,true),null);
 assert.equal(p.tick(600000,true).at,600200);assert.equal(p.tick(600001,true),null);
 p.tick(600100,false);assert.equal(p.tick(600101,true),null);
 assert.equal(p.tick(1000,true),null);assert.equal(p.tick(181000,true).at,181200);
});
test("real and diagnostic playback postpone quiet pulses without changing their targets",()=>{
 const p=create();p.tick(1000,true);p.note(180800,181800);
 assert.equal(p.tick(181000,true),null);assert.equal(p.tick(361799,true),null);
 assert.equal(p.tick(361800,true).at,362000);
});
test("quiet settings are bounded and generate a faded low-level PCM tone",()=>{
 const cfg={speakerKeepAwakeGain:.012,speakerKeepAwakeFrequencyHz:600,speakerKeepAwakeIntervalSeconds:45};
 assert.equal(settings(cfg).intervalMs,45000);
 const wav=syntheticWave("keep-awake",cfg);let peak=0;
 for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
 assert.ok(peak<=.012*32767+1 && peak>.011*32767);
 assert.equal(wav.readInt16LE(44),0);assert.equal(settings({speakerKeepAwakeGain:1}).gain,.1);
});
test("speaker keep-awake is default-on, shared and restored without moving the clock",async t=>{
 const s=await fixture(t,"darwin");let state=await s.state();assert.equal(state.speakerKeepAwake,true);
 assert.equal(state.config.speakerKeepAwakeIntervalSeconds,180);assert.equal(state.config.speakerKeepAwakeGain,.006);
 state=await s.start();const anchor=state.timerClock.startedAt;
 state=await s.action({type:"speakerKeepAwake",enabled:false});assert.equal(state.timerClock.startedAt,anchor);
 assert.equal(state.speakerKeepAwake,false);
 const deadline=Date.now()+3000;
 while(true){
  try{if(s.snapshot().timerState.speakerKeepAwake===false)break;}catch{}
  assert.ok(Date.now()<deadline,"keep-awake preference was not persisted");await new Promise(r=>setTimeout(r,30));
 }
 await s.restart();assert.equal((await s.state()).speakerKeepAwake,false);
});
