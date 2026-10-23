"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { launcherLanguageAllowed, validLauncherLanguage } = require("../lib/launcher-language");
const { fixture } = require("./helpers/controlled-clock-server");

function command(server, token, body = {language:"en"}, headers = {}) {
  return fetch(server.baseUrl+"/api/launcher/language", {method:"POST",
    headers:{"content-type":"application/json","x-fdv-launcher-token":token,...headers},body:JSON.stringify(body)});
}
async function until(predicate) {
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}
  assert.fail("Language did not converge");
}
function unchanged(before, after) {
  for(const field of ["running","elapsedBeforePause","activePreset","primaryClientId","primaryPinSet","completed","soundProfile"])
    assert.deepEqual(after[field],before[field],field+" must not change");
  // startedAt is the legacy wall-clock projection and may jitter normally.
  // The canonical monotonic signal identity must remain exactly unchanged.
  assert.equal(after.timerClock.startedAt,before.timerClock.startedAt,"Monotonic anchor changed");
}

test("launcher capability permits only non-browser loopback requests and strict language-only bodies",()=>{
  const token=crypto.randomBytes(32).toString("hex");
  const request={headers:{"x-fdv-launcher-token":token},socket:{remoteAddress:"127.0.0.1"}};
  assert.equal(launcherLanguageAllowed(request,token),true);
  for(const address of ["::1","::ffff:127.0.0.1"])
    assert.equal(launcherLanguageAllowed({...request,socket:{remoteAddress:address}},token),true);
  for(const address of ["192.168.1.2","127.0.0.2",undefined])
    assert.equal(launcherLanguageAllowed({...request,socket:{remoteAddress:address}},token),false);
  for(const name of ["origin","referer","sec-fetch-site"])
    assert.equal(launcherLanguageAllowed({...request,headers:{...request.headers,[name]:"null"}},token),false);
  for(const bad of ["",token.slice(1),"x".repeat(64),"0".repeat(64)])assert.equal(launcherLanguageAllowed(request,bad),false);
  for(const body of [{language:"ru"},{language:"en"}])assert.ok(validLauncherLanguage(body));
  for(const body of [null,[],{},"en",{language:"EN"},{language:"en",type:"start"},{language:"ru",clientId:"operator"}])
    assert.ok(!validLauncherLanguage(body));
});

test("local launcher language preserves running clock/PIN/primary, publishes state and persists without leaking capability",async t=>{
  const token=crypto.randomBytes(32).toString("hex"), server=await fixture(t,"darwin",{launcherToken:token});
  await server.action({type:"primary",primaryClientId:"clock-test"});
  await server.action({type:"primaryPin",enabled:true,pin:"1234"});
  await server.start();server.frame(5000);
  const before=await server.state();
  for(const headers of [{"x-fdv-launcher-token":"wrong"},{origin:"http://localhost"},{referer:"http://localhost"}])
    assert.equal((await command(server,token,{language:"en"},headers)).status,403);
  assert.equal((await command(server,token,{language:"en",type:"reset"})).status,400);
  const denied=await fetch(server.baseUrl+"/api/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"screen",type:"language",language:"en"})});
  assert.equal(denied.status,403,"Ordinary browser control protection remains");
  assert.equal((await server.state()).language,before.language);
  assert.equal((await command(server,token)).status,200);
  const after=await server.state();
  assert.equal(after.language,"en");unchanged(before,after);
  assert.equal(after.version,before.version+1);
  assert.equal((await command(server,token)).status,200);
  assert.equal((await server.state()).version,after.version,"Duplicate desired language is a no-op");
  assert.ok(!JSON.stringify(after).includes(token));
  assert.ok(!server.output.join("").includes(token));
  await until(()=>{try{return server.snapshot().timerState.language==="en";}catch(_){return false;}});
  await server.restart();
  assert.equal((await server.state()).language,"en");
  const disabled=await fixture(t,null);
  assert.equal((await command(disabled,token)).status,403,"No launcher capability for manually started servers");
});

test("a following reserve forwards only authenticated language to authority and mirrors the change",{timeout:20000},async t=>{
  const primaryToken=crypto.randomBytes(32).toString("hex"), backupToken=crypto.randomBytes(32).toString("hex");
  const primary=await fixture(t,null,{launcherToken:primaryToken});
  const backup=await fixture(t,null,{launcherToken:backupToken});
  await primary.action({type:"primary",primaryClientId:"clock-test"});await primary.start();
  const paired=await fetch(primary.baseUrl+"/api/sec/configure",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({clientId:"clock-test",address:backup.baseUrl})});
  assert.equal(paired.status,200,await paired.text());
  await until(async()=>(await backup.state()).running);
  const before=await primary.state(), secondaryBefore=await backup.state();
  assert.equal((await command(backup,primaryToken)).status,403,"Capabilities are bound to the local process");
  assert.equal((await command(backup,backupToken,{language:"en",type:"reset"})).status,400);
  assert.equal((await command(backup,backupToken)).status,200);
  await until(async()=>(await primary.state()).language==="en"&&(await backup.state()).language==="en");
  unchanged(before,await primary.state());unchanged(secondaryBefore,await backup.state());
  assert.equal((await primary.state()).primaryClientId,"clock-test");
  assert.equal((await command(primary,primaryToken,{language:"ru"})).status,200);
  await until(async()=>(await backup.state()).language==="ru");
});
