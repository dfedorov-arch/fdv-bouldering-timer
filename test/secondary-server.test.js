"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const { createReplicaClock, serverAddress, primaryNetworkAddress } = require("../lib/secondary-server");
const { fixture, clockOrigin } = require("./helpers/controlled-clock-server");

async function sec(server, action, body = {}, options = {}) {
  const response = await fetch(`${server.baseUrl}/api/sec/${action}`, {
    method: "POST", headers: { "content-type": "application/json", ...options.headers },
    body: JSON.stringify({ clientId: "clock-test", ...body })
  });
  return { status: response.status, body: await response.json() };
}

async function until(predicate) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await predicate();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail("SEC state did not converge");
}

async function actionThroughStandby(server, body) {
  const response = await fetch(server.baseUrl + "/api/action", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "clock-test", ...body }), signal: AbortSignal.timeout(2000)
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("SEC addresses reject credentials and non-server URL paths", () => {
  assert.equal(serverAddress("http://example.test:8008"), "http://example.test:8008");
  for (const address of ["file:///tmp/timer", "http://user:secret@example.test/", "http://host/api/action", "http://host/?a=1"]) {
    assert.throws(() => serverAddress(address));
  }
});

test("primary advertisement uses the selected route only for local HTTP origins, preserving HTTPS names and ports", () => {
  const reserve = "http://192.168.1.222:8008";
  assert.equal(primaryNetworkAddress("http://127.0.0.1:8123", reserve, "192.168.1.10"), "http://192.168.1.10:8123");
  assert.equal(primaryNetworkAddress("http://localhost:8123", reserve, "::ffff:10.0.0.8"), "http://10.0.0.8:8123");
  assert.equal(primaryNetworkAddress("http://[::1]:8123", reserve, "fd00::12"), "http://[fd00::12]:8123");
  assert.equal(primaryNetworkAddress("https://timer.example:8443", reserve, "10.0.0.8"), "https://timer.example:8443");
  assert.equal(primaryNetworkAddress("http://192.168.1.10:8123", reserve, "10.0.0.8"), "http://192.168.1.10:8123");
  assert.equal(primaryNetworkAddress("http://127.0.0.1:8123", "http://127.0.0.1:8124"), "http://127.0.0.1:8123");
  for (const local of [undefined, "127.0.0.1", "0.0.0.0", "::1", "fe80::1234", "fe80::1%4"]) {
    assert.throws(() => primaryNetworkAddress("http://localhost:8123", reserve, local), {code:"PRIMARY_NETWORK_ADDRESS_REQUIRED"});
  }
  assert.throws(() => primaryNetworkAddress("https://localhost:8443", reserve, "192.168.1.10"), {code:"PRIMARY_NETWORK_ADDRESS_REQUIRED"});
});

function lanAddress(t) {
  const address = Object.values(os.networkInterfaces()).flat().find(item => item && item.family === "IPv4" && !item.internal)?.address;
  if (!address) t.skip("A LAN IPv4 interface is required for cross-origin network advertisement");
  return address;
}

test("localhost operator advertises a verified LAN primary and can return a reserve display", {timeout:20000}, async t => {
  const address = lanAddress(t); if (!address) return;
  const primary = await fixture(t,null,{listenHost:"0.0.0.0"});
  const backup = await fixture(t,null,{listenHost:"0.0.0.0"});
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:20});
  const secondaryUrl = backup.baseUrl.replace("127.0.0.1",address);
  const paired = await sec(primary,"configure",{address:secondaryUrl});
  assert.equal(paired.status,200,JSON.stringify(paired.body));
  assert.equal(paired.body.sec.primaryUrl,primary.baseUrl.replace("127.0.0.1",address));
  assert.notEqual(paired.body.sec.primaryUrl,primary.baseUrl);
  const anchor = paired.body.timerClock.startedAt;
  const moved = await sec(primary,"switch",{targetClientId:"screen",destination:"primary"});
  await until(async()=>(await backup.state()).sec.switchRequests.some(request=>request.clientId === "screen" && request.destination === "primary"));
  const returned = await (await fetch(moved.body.sec.primaryUrl+"/api/state")).json();
  assert.equal(returned.serverInstanceId,paired.body.serverInstanceId);
  assert.equal(returned.timerClock.startedAt,anchor);
});

test("a network primary address resolving to a different process is rejected without disturbing either competition", {timeout:15000}, async t => {
  const address = lanAddress(t); if (!address) return;
  const primary = await fixture(t,null), backup = await fixture(t,null,{listenHost:"0.0.0.0"});
  const wrong = await fixture(t,null,{listenHost:"0.0.0.0"});
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:20});
  const before = await primary.state();
  const result = await new Promise((resolve,reject) => {
    const request = http.request(primary.baseUrl+"/api/sec/configure", {method:"POST", headers:{
      "content-type":"application/json", host:new URL(wrong.baseUrl.replace("127.0.0.1",address)).host
    }}, response => {
      let body=""; response.on("data",chunk=>{body+=chunk;});
      response.on("end",()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
    });
    request.on("error",reject);
    request.end(JSON.stringify({clientId:"clock-test",address:backup.baseUrl.replace("127.0.0.1",address)}));
  });
  assert.equal(result.status,400);
  assert.equal(result.body.code,"PRIMARY_ADDRESS_UNREACHABLE",JSON.stringify(result.body));
  assert.equal((await primary.state()).sec,null);
  assert.equal((await backup.state()).sec,null);
  assert.equal((await primary.state()).timerClock.startedAt,before.timerClock.startedAt);
  assert.equal((await wrong.state()).running,false);
});

test("disconnect checks the reserve registry immediately, reports only active browsers and succeeds after they expire", {timeout:20000}, async t => {
  const primary = await fixture(t,null), backup = await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:20});
  const paired = await sec(primary,"configure",{address:backup.baseUrl});
  assert.equal(paired.status,200);
  await fetch(backup.baseUrl+"/api/state?clientId=screen",{headers:{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0 Safari/537.36"}});
  const refused = await sec(primary,"remove");
  assert.equal(refused.status,400);
  assert.equal(refused.body.code,"SECONDARY_HAS_CLIENTS");
  assert.equal(refused.body.clients.length,1);
  assert.equal(refused.body.clients[0].id,"screen");
  assert.match(refused.body.clients[0].label,/Chrome 155/);
  assert.ok((await primary.state()).sec);
  assert.ok((await backup.state()).sec);
  await new Promise(resolve=>setTimeout(resolve,6300));
  const removed = await sec(primary,"remove");
  assert.equal(removed.status,200,JSON.stringify(removed.body));
  assert.equal(removed.body.sec,null);
  assert.equal((await backup.state()).sec,null);
  assert.equal(removed.body.timerClock.startedAt,paired.body.timerClock.startedAt);
  assert.equal(removed.body.running,true);
});

test("replica clock learns an independent monotonic rate and holds its timeline without packets", () => {
  let local = 100;
  const clock = createReplicaClock(() => local);
  assert.equal(clock.measure({ local, remote: 100000, rtt: 1000 }), false);
  for (let i = 0; i < 80; i++) {
    local = 100 + i * 1000;
    clock.measure({ local, remote: 100000 + i * 1000 * 1.001, rtt: 4 });
  }
  assert.ok(Math.abs(clock.rate - 1.001) < 0.000001);
  const before = clock.now();
  local += 30000;
  assert.ok(Math.abs(clock.now() - before - 30030) < 0.001);
});

test("SEC baseline and forwarded changes retain per-browser native audio preference",async t=>{
  const primary=await fixture(t,null),backup=await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.action({type:"serverAudioMode",targetClientId:"clock-test",enabled:false});
  await primary.action({type:"speakerKeepAwake",enabled:false});
  const paired=await sec(primary,"configure",{address:backup.baseUrl});
  assert.equal(paired.status,200,JSON.stringify(paired.body));
  assert.equal((await backup.state()).speakerKeepAwake,false);
  await until(async()=>{try{return backup.snapshot().serverAudioDisabledClients.includes("clock-test");}catch{return false;}});
  const forwarded=await actionThroughStandby(backup,{type:"serverAudioMode",targetClientId:"clock-test",enabled:true});
  assert.equal(forwarded.serverAudio.enabled,true);
  await actionThroughStandby(backup,{type:"speakerKeepAwake",enabled:true});
  await until(async()=>(await backup.state()).speakerKeepAwake===true);
  await until(async()=>!backup.snapshot().serverAudioDisabledClients.includes("clock-test"));
});

test("hot SEC mirrors state, preserves clock anchors, proxies commands once, and fences the old server on takeover", { timeout: 25000 }, async t => {
  const primary = await fixture(t, null);
  const backup = await fixture(t, null);
  await primary.action({ type: "primary", primaryClientId: "clock-test" });
  await primary.action({ type: "primaryPin", pin: "1234" });
  await primary.action({ type: "startLists", startLists: [{headers:["#","ФИО"],rows:[["1","Тест"]],routeCount:5}] });
  await primary.start({ elapsedBeforePause: 30, settings:{rotationSeconds:125,breakSeconds:15,oneShot:false} });
  const paired = await sec(primary, "configure", { address: backup.baseUrl });
  assert.equal(paired.status, 200, JSON.stringify(paired.body));
  assert.equal(paired.body.sec.ready, true);
  const secondary = await backup.state();
  assert.equal(secondary.sec.role, "secondary");
  assert.equal(secondary.primaryClientId, "clock-test");
  assert.equal(secondary.primaryPinSet, true);
  assert.equal(secondary.startLists[0].rows[0][1], "Тест");
  assert.equal(secondary.timerClock.startedAt, paired.body.timerClock.startedAt);
  assert.ok(Math.abs(secondary.elapsed - paired.body.elapsed) < 0.1);
  assert.notEqual(secondary.serverInstanceId, paired.body.serverInstanceId);
  assert.equal((await fetch(backup.baseUrl + "/runtime-state/timer-state.json")).status, 403);
  const cors = await fetch(`${backup.baseUrl}/api/sec/status?session=${secondary.sec.session}`, {headers:{Origin:primary.baseUrl}});
  assert.equal(cors.headers.get("access-control-allow-origin"), primary.baseUrl);
  const foreign = await fetch(`${backup.baseUrl}/api/sec/status?session=${secondary.sec.session}`, {headers:{Origin:"https://unrelated.invalid"}});
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  const replay = await actionThroughStandby(backup, { type:"pause", commandId:"sec-pause", baseVersion:secondary.version,
    baseServerInstanceId:secondary.serverInstanceId, intendedTimerTime:secondary.timerClock.now });
  assert.equal(replay.running, false);
  const sourcePaused = await primary.state();
  assert.equal(sourcePaused.running, false);
  assert.equal(sourcePaused.version, replay.version);
  assert.ok(replay.timerClock.sentAt - replay.timerClock.receivedAt > 0);
  assert.ok(replay.timerClock.sentAt - replay.timerClock.receivedAt < 700,
    "operator RPC must wake immediately instead of waiting for a one-second clock heartbeat");
  const duplicate = await actionThroughStandby(backup, {type:"pause",commandId:"sec-pause"});
  assert.equal(duplicate.commandDuplicate, true);
  const beforeRoutes = await backup.state();
  const changedRoutes = await actionThroughStandby(backup, {type:"startListRoutes",listIndex:0,routeCount:4,
    expectedStartListRevision:beforeRoutes.startListRevision});
  assert.equal(changedRoutes.startLists[0].routeCount,4);
  assert.equal((await primary.state()).startLists[0].routeCount,4);
  await primary.action({type:"seek",elapsed:44});
  await until(async () => (await backup.state()).elapsed === 44);
  const refused = await sec(primary, "configure", {address:primary.baseUrl});
  assert.equal(refused.status, 400);
  const switched = await sec(primary, "switch", { targetClientId:"clock-test" });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.sec.switchAll, true);
  const activeBackup = await backup.state();
  assert.equal(activeBackup.sec.switchAll, true);
  await backup.start({ elapsedBeforePause:44 });
  const after = await backup.state();
  assert.equal(after.running, true);
  await until(async()=>{try { return (await primary.state()).sec.role === "secondary" && (await backup.state()).sec.role === "primary"; } catch (_) { return false; }});
  await actionThroughStandby(primary,{type:"pause",commandId:"reversed-pause"});
  assert.equal((await backup.state()).running,false);
  assert.equal((await primary.state()).elapsed,(await backup.state()).elapsed);
});

test("SEC rejects a nonempty standby instead of overwriting its competition", { timeout:15000 }, async t => {
  const primary = await fixture(t, null);
  const backup = await fixture(t, null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await backup.action({type:"seek",elapsed:12});
  const result = await sec(primary,"configure",{address:backup.baseUrl});
  assert.equal(result.status,400);
  assert.equal((await backup.state()).elapsed,12);
  assert.equal((await primary.state()).sec,null);
});

test("screen destinations toggle both ways and following-server requests execute at the current authority",{timeout:20000},async t=>{
  const primary=await fixture(t,null),backup=await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:10});
  await fetch(primary.baseUrl+"/api/state?clientId=screen");
  await sec(primary,"configure",{address:backup.baseUrl});
  const anchor=(await primary.state()).timerClock.startedAt;
  let moved=await sec(primary,"switch",{targetClientId:"screen"});
  assert.equal(moved.status,200);
  const first=moved.body.sec.switchRequests.find(item=>item.clientId === "screen");
  assert.equal(first.destination,"secondary");
  await until(async()=>(await backup.state()).sec.switchRequests.some(item=>item.sequence === first.sequence));
  moved=await sec(primary,"switch",{targetClientId:"screen",destination:"primary"});
  const back=moved.body.sec.switchRequests.find(item=>item.clientId === "screen");
  assert.equal(back.destination,"primary");
  assert.ok(back.sequence>first.sequence);
  await until(async()=>(await backup.state()).sec.switchRequests.some(item=>item.sequence === back.sequence));
  const groupBack=await sec(backup,"switch",{targetClientId:"clock-test",destination:"primary"});
  assert.equal(groupBack.status,200,JSON.stringify(groupBack.body));
  assert.equal((await primary.state()).sec.epoch,0);
  assert.equal((await primary.state()).timerClock.startedAt,anchor);
  assert.equal((await primary.state()).sec.switchRequests.find(item=>item.clientId === "screen").destination,"primary");
});

test("SEC restores its clock, configuration, PIN and command ledger after process restart", {timeout:25000}, async t => {
  const primary = await fixture(t,null);
  const backup = await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.action({type:"primaryPin",pin:"1234"});
  await primary.start({elapsedBeforePause:20});
  await sec(primary,"configure",{address:backup.baseUrl});
  await actionThroughStandby(backup,{type:"pause",commandId:"persisted-sec-pause"});
  await until(async()=>backup.snapshot().secondary?.appliedCommands?.includes("persisted-sec-pause"));
  const saved = backup.snapshot();
  const before = await backup.state();
  await backup.restart();
  await until(async()=>(await backup.state()).sec?.ready);
  let restored = await backup.state();
  assert.equal(restored.sec.session,before.sec.session);
  assert.equal(restored.running,false);
  assert.equal(restored.elapsed,before.elapsed);
  assert.equal(restored.primaryPinSet,true);
  assert.deepEqual(backup.snapshot().secondary.config,saved.secondary.config);
  await sec(primary,"switch",{targetClientId:"clock-test"});
  const duplicate = await backup.action({type:"pause",commandId:"persisted-sec-pause"});
  assert.equal(duplicate.commandDuplicate,true);
  await backup.start({elapsedBeforePause:30});
  restored = await backup.state();
  await backup.restart();
  const running = await backup.state();
  assert.equal(running.sec.activeUrl,backup.baseUrl);
  assert.equal(running.running,true);
  assert.equal(running.timerClock.startedAt,restored.timerClock.startedAt);
  assert.ok(running.elapsed>=restored.elapsed && running.elapsed-restored.elapsed<3);
});

test("a returning primary becomes the reserve of the new authority, including a changed operator and a second takeover", {timeout:30000},async t=>{
  const primary=await fixture(t,null);
  const backup=await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:10});
  await sec(primary,"configure",{address:backup.baseUrl});
  const originalPair=primary.snapshot().secondary.pair;
  await primary.stop();
  const takeover=await sec(backup,"takeover",{session:(await backup.state()).sec.session},{headers:{Origin:primary.baseUrl}});
  assert.equal(takeover.status,200);
  await backup.action({clientId:"replacement",type:"primary",primaryClientId:"replacement"});
  await backup.action({clientId:"replacement",type:"primaryPin",pin:"5678"});
  await backup.action({clientId:"replacement",type:"startLists",startLists:[{headers:["#","ФИО"],rows:[["1","После отказа"]],routeCount:4}]});
  const active=await backup.state();
  await primary.restart();
  const returned=await until(async()=>{try { const state=await primary.state(); return state.sec.epoch === 1 && state.sec.role === "secondary" && state.sec.ready && state; } catch (_) { return false; }});
  assert.equal(returned.primaryClientId,"replacement");
  assert.equal(returned.primaryPinSet,true);
  assert.equal(returned.startLists[0].rows[0][1],"После отказа");
  assert.equal(returned.timerClock.startedAt,active.timerClock.startedAt);
  const stalePacket=await fetch(primary.baseUrl+"/api/sec/replicate",{method:"POST",
    headers:{"content-type":"application/json","x-fdv-secondary-key":originalPair.key},
    body:JSON.stringify({session:originalPair.session,epoch:0,sourceInstanceId:"obsolete-source",sequence:999})});
  assert.equal(stalePacket.status,409);
  assert.equal((await primary.state()).sec.ready,true,"old epoch must not reset the current replica clock");
  assert.ok(Math.abs(returned.elapsed-(await backup.state()).elapsed)<0.1);
  const main=await backup.state();
  assert.equal(main.sec.primaryUrl,backup.baseUrl);
  assert.equal(main.sec.secondaryUrl,primary.baseUrl);
  assert.equal(main.sec.switchAll,false);
  assert.equal(backup.snapshot().secondary.pair.epoch,1);
  await backup.restart();
  await until(async()=>(await backup.state()).sec.ready);
  assert.equal((await backup.state()).sec.role,"primary");
  assert.equal((await backup.state()).primaryClientId,"replacement");
  assert.equal((await backup.state()).timerClock.startedAt,active.timerClock.startedAt);
  const second=await sec(backup,"switch",{clientId:"replacement",targetClientId:"replacement"});
  assert.equal(second.status,200,JSON.stringify(second.body));
  const reversed=await until(async()=>{try { const state=await backup.state(); return state.sec.epoch === 2 && state.sec.role === "secondary" && state.sec.ready && state; } catch (_) { return false; }});
  assert.equal((await primary.state()).sec.role,"primary");
  assert.equal(reversed.timerClock.startedAt,active.timerClock.startedAt);
  assert.equal(reversed.primaryClientId,"replacement");
});

test("promoted SEC preserves a pending Final start through restart and completes the countdown independently", {timeout:20000}, async t => {
  const primary = await fixture(t,"linux");
  const backup = await fixture(t,"linux");
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  const target = new Date(clockOrigin+60000);
  await primary.start({startMode:"scheduled",activePreset:"final",startHours:target.getHours(),startMinutes:target.getMinutes(),
    settings:{rotationSeconds:60,breakSeconds:0,oneShot:true}});
  const paired = await sec(primary,"configure",{address:backup.baseUrl});
  assert.equal(paired.status,200,JSON.stringify(paired.body));
  const anchor = (await backup.state()).timerClock.startedAt;
  await sec(primary,"switch",{targetClientId:"clock-test"});
  await primary.stop();
  backup.frame(20000);
  await backup.restart();
  const pending = await backup.state();
  assert.equal(pending.countdownOnly,true);
  assert.equal(pending.timerClock.startedAt,anchor);
  assert.ok(Math.abs(anchor-pending.timerClock.now-40000)<1);
  backup.frame(63240);
  const completed = await backup.state();
  assert.equal(completed.running,false);
  assert.equal(completed.countdownOnly,false);
  assert.equal(completed.waitingForManualStart,true);
});

test("role reversal retries safely when its committed acknowledgement is lost",{timeout:20000},async t=>{
  const primary=await fixture(t,null);
  const backup=await fixture(t,null);
  let dropped=0;
  const proxy=http.createServer((req,res)=>{
    const upstream=http.request(new URL(req.url,backup.baseUrl),{method:req.method,headers:req.headers},response=>{
      if (req.url === "/api/sec/rejoin" && dropped === 0 && response.statusCode === 200) {
        dropped++;
        response.resume(); response.on("end",()=>res.destroy());
      } else {res.writeHead(response.statusCode,response.headers);response.pipe(res);}
    });
    upstream.on("error",()=>res.destroy());
    res.on("close",()=>upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise(resolve=>proxy.listen(0,"127.0.0.1",resolve));
  t.after(()=>new Promise(resolve=>{proxy.closeAllConnections();proxy.close(resolve);}));
  const secondaryUrl=`http://127.0.0.1:${proxy.address().port}`;
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:12});
  await sec(primary,"configure",{address:secondaryUrl});
  const anchor=(await backup.state()).timerClock.startedAt;
  await sec(primary,"switch",{targetClientId:"clock-test"});
  await until(async()=>{try { const s=await primary.state();return s.sec.epoch === 1 && s.sec.role === "secondary" && s.sec.ready;}catch(_){return false;}});
  assert.equal(dropped,1);
  assert.equal((await backup.state()).sec.epoch,1,"retry must not create another authority epoch");
  assert.equal((await backup.state()).sec.role,"primary");
  assert.equal((await primary.state()).timerClock.startedAt,anchor);
});

test("an unreachable return address leaves the old server fenced, not a falsely ready reserve",{timeout:20000},async t=>{
  const primary=await fixture(t,null);
  const backup=await fixture(t,null);
  await primary.action({type:"primary",primaryClientId:"clock-test"});
  await primary.start({elapsedBeforePause:5});
  const paired=await new Promise((resolve,reject)=>{
    const request=http.request(primary.baseUrl+"/api/sec/configure",{method:"POST",
      headers:{"content-type":"application/json",host:"127.0.0.1:1"}},response=>{
      let body="";response.on("data",chunk=>{body+=chunk;});
      response.on("end",()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
    });
    request.on("error",reject);
    request.end(JSON.stringify({clientId:"clock-test",address:backup.baseUrl}));
  });
  assert.equal(paired.status,200,JSON.stringify(paired.body));
  assert.equal(paired.body.sec.primaryUrl,"http://127.0.0.1:1");
  await primary.stop();
  const takeover=await sec(backup,"takeover",{session:paired.body.sec.session},{headers:{Origin:"http://127.0.0.1:1"}});
  assert.equal(takeover.status,200);
  await backup.action({type:"pause"});
  const paused=(await backup.state()).elapsed;
  await primary.restart();
  await until(async()=>(await primary.state()).sec.switchAll);
  await new Promise(resolve=>setTimeout(resolve,1400));
  const stillActive=await backup.state();
  assert.equal(stillActive.sec.role,"secondary");
  assert.equal(stillActive.sec.switchAll,true);
  assert.equal(stillActive.elapsed,paused);
  assert.equal((await primary.state()).sec.role,"primary");
  const refused=await fetch(primary.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({clientId:"clock-test",type:"reset"})});
  assert.equal(refused.status,409);
});
