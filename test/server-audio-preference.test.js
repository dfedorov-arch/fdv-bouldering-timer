"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers/controlled-clock-server");

test("native preference is per browser and survives client expiry, reconnect and server restoration",async t=>{
  const s=await fixture(t,"darwin");
  let response=await s.action({clientId:"audio-a",type:"serverAudioMode",targetClientId:"audio-a",enabled:false});
  assert.equal(response.serverAudio.enabled,false);
  await s.action({clientId:"audio-b",type:"audioOffset",targetClientId:"audio-a",offset:-300});
  let clients=(await s.state()).clients;
  assert.equal(clients.find(c=>c.id==="audio-a").serverAudioDisabled,true);
  assert.equal(clients.find(c=>c.id==="audio-b").serverAudioDisabled,false);
  s.frame(31001);assert.equal((await s.state()).clients.some(c=>c.id==="audio-a"),false);
  response=await s.action({clientId:"audio-a",type:"audioOffset",targetClientId:"audio-b",offset:10});
  assert.equal(response.serverAudio.enabled,false);
  const deadline=Date.now()+3000;
  while(true){
    try{if(s.snapshot().serverAudioDisabledClients.includes("audio-a"))break;}catch{}
    assert.ok(Date.now()<deadline,"Preference must be persisted");
    await new Promise(r=>setTimeout(r,30));
  }
  await s.restart();
  response=await s.action({clientId:"audio-a",type:"audioOffset",targetClientId:"audio-b",offset:20});
  assert.equal(response.serverAudio.enabled,false);
  assert.equal(response.clients.find(c=>c.id==="audio-a").audioUserOffset,-300);
  response=await s.action({clientId:"audio-a",type:"serverAudioMode",targetClientId:"audio-a",enabled:true});
  assert.equal(response.serverAudio.enabled,true);
});
