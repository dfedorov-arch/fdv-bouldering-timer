"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture } = require("./helpers/controlled-clock-server");

async function request(server, body, status = 200) {
  const response = await fetch(server.baseUrl + "/api/action", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({clientId:"remote", ...body}) });
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
async function state(server, id = "remote", legacy = false) {
  return (await fetch(server.baseUrl + `/api/state?clientId=${id}&legacy=${legacy ? "1" : "0"}`)).json();
}
async function until(predicate) {
  const end = Date.now() + 7000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(r=>setTimeout(r,40)); }
  assert.fail("State did not converge");
}

test("CTRL delegates only manual runtime controls; authority owns settings, seeks, roles and PIN", async t => {
  const s = await fixture(t, "darwin");
  await state(s);
  await s.action({type:"settings",activePreset:"classic",settings:{rotationMinutes:2,breakSeconds:12,oneShot:false}});
  await s.action({type:"primary",primaryClientId:"clock-test"});
  await s.action({type:"primaryPin",pin:"1234"});
  await request(s,{type:"start"},403);
  await request(s,{type:"clientControl",targetClientId:"remote",enabled:true},403);
  await s.action({type:"clientControl",targetClientId:"remote",enabled:true});
  assert.equal((await state(s)).limitedControl,true);
  for (const type of ["settings","seek","seekCycle","language","sound","muteBreakWarnings","primaryPin","clientControl","legacyMode"]) {
    await request(s,{type,enabled:true,pin:"9999",elapsed:999,cycle:99},403);
  }
  let running = await request(s,{type:"start",startMode:"scheduled",startHours:23,startMinutes:59,
    activePreset:"final",settings:{rotationSeconds:999,breakSeconds:999,oneShot:true},elapsedBeforePause:500});
  assert.equal(running.running,true);
  assert.deepEqual(running.activeSettings,{rotationSeconds:120,breakSeconds:12,oneShot:false,finalRoundFormat:"old",finalRestRotations:3});
  assert.equal(running.runtimePreset,"classic");
  assert.equal(running.elapsed,0);
  assert.equal(running.primaryClientId,"clock-test");
  assert.equal(running.primaryPinSet,true);
  const anchor = running.timerClock.startedAt;
  await request(s,{type:"start"},409);
  assert.equal((await s.state()).timerClock.startedAt,anchor);
  s.frame(10000);
  const paused = await request(s,{type:"pause",intendedTimerTime:anchor+9750,baseServerInstanceId:running.serverInstanceId});
  assert.equal(paused.running,false);
  assert.ok(Math.abs(paused.elapsedBeforePause-9.75)<0.001,"delegated Pause keeps existing network-time compensation");
  running = await request(s,{type:"start",elapsedBeforePause:900,settings:{rotationSeconds:9}});
  assert.ok(Math.abs(running.elapsed-9.75)<0.001);
  assert.equal(running.activeSettings.rotationSeconds,120);
  await request(s,{type:"reset",settings:{rotationSeconds:9},activePreset:"final"});
  assert.equal((await s.state()).activeSettings.rotationSeconds,120);
  await s.action({type:"clientControl",targetClientId:"remote",enabled:false});
  await request(s,{type:"start"},403);
});

test("CTRL and break preference persist, while Legacy cannot receive or use delegated controls", async t => {
  const s = await fixture(t, "darwin");
  await state(s); await state(s,"old",true);
  await s.action({type:"primary",primaryClientId:"clock-test"});
  await s.action({type:"clientControl",targetClientId:"old",enabled:true});
  assert.equal((await state(s,"old",true)).limitedControl,false);
  await s.action({type:"clientControl",targetClientId:"remote",enabled:true});
  await s.action({type:"muteBreakWarnings",enabled:true});
  await s.start(); const before = await s.state();
  await s.action({type:"muteBreakWarnings",enabled:false});
  assert.equal((await s.state()).timerClock.startedAt,before.timerClock.startedAt);
  await s.action({type:"muteBreakWarnings",enabled:true});
  await until(()=>{ try { return s.snapshot().timerState.muteBreakWarnings; } catch { return false; } });
  await s.restart();
  const restored = await state(s);
  assert.equal(restored.muteBreakWarnings,true);
  assert.equal(restored.limitedControl,true);
  await s.action({type:"legacyMode",targetClientId:"remote",enabled:true});
  assert.equal((await state(s,"remote",true)).limitedControl,false);
  await request(s,{type:"pause",legacy:true},403);
});

test("CTRL commands and break mute use existing reverse RPC, replication and command deduplication", {timeout:20000}, async t => {
  const a = await fixture(t,null), b = await fixture(t,null);
  await a.action({type:"primary",primaryClientId:"clock-test"});
  const pair = await fetch(a.baseUrl+"/api/sec/configure",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({clientId:"clock-test",address:b.baseUrl})});
  assert.equal(pair.status,200,await pair.text());
  await state(b);
  await until(async()=> (await a.state()).clients.some(c=>c.id==="remote"));
  await a.action({type:"clientControl",targetClientId:"remote",enabled:true});
  await a.action({type:"muteBreakWarnings",enabled:true});
  await until(async()=> (await state(b)).limitedControl && (await b.state()).muteBreakWarnings);
  const first = await request(b,{type:"start",commandId:"limited-sec-start",startAudioLead:true});
  const repeat = await request(b,{type:"start",commandId:"limited-sec-start",startAudioLead:true});
  assert.equal(repeat.commandDuplicate,true);
  assert.equal(first.timerClock.startedAt,repeat.timerClock.startedAt);
  await request(b,{type:"seek",elapsed:800},403);
  await a.action({type:"clientControl",targetClientId:"remote",enabled:false});
  await until(async()=> !(await state(b)).limitedControl);
  await request(b,{type:"reset"},403);
});
