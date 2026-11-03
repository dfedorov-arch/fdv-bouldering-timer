"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers/controlled-clock-server');
const launcherToken = 'a'.repeat(64);
async function command(s,id,type,payload={},secret) {
  const headers = {'content-type':'application/json'};
  if (secret !== undefined) headers['x-fdv-client-secret'] = secret;
  const response = await fetch(s.baseUrl+'/api/action',{method:'POST',headers,body:JSON.stringify({clientId:id,type,...payload})});
  return {status:response.status,body:await response.json()};
}
async function session(s,id) {
  const r=await fetch(s.baseUrl+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:id})});
  assert.equal(r.status,200); return r.json();
}
async function pin(s,value,headers={'x-fdv-launcher-token':launcherToken}) {
  const r=await fetch(s.baseUrl+'/api/launcher/pin',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({pin:value})});
  return {status:r.status,body:await r.json()};
}

test('public IDs, diagnostics and session registration cannot impersonate primary or CTRL; GET cannot rewrite metadata',async t=>{
  const s=await fixture(t,'darwin');
  const primary=await s.credentials('clock-test');
  await s.action({type:'primary',primaryClientId:'clock-test'});
  await s.action({type:'primaryPin',pin:'1234'});
  const remote=await session(s,'remote');
  await fetch(s.baseUrl+'/api/state?clientId=remote',{headers:{'x-fdv-client-secret':remote.secret}});
  await s.action({type:'clientControl',targetClientId:'remote',enabled:true});
  const intruder=await session(s,'intruder');
  for(const id of ['clock-test','remote']) {
    for(const secret of [undefined,'0'.repeat(64),intruder.secret])
      assert.equal((await command(s,id,'start',{},secret)).status,401);
    const replacement=await session(s,id);
    assert.notEqual(replacement.clientId,id);
    assert.equal((await command(s,replacement.clientId,'start',{},replacement.secret)).status,403);
  }
  await fetch(s.baseUrl+'/api/state?clientId=clock-test&legacy=1&oldBrowser=1&viewport=1x1');
  const publicState=await(await fetch(s.baseUrl+'/api/state?clientId=clock-test&diagnostics=1')).json();
  assert.equal(publicState.primaryClientId,'clock-test');
  assert.equal(publicState.clients.find(c=>c.id==='clock-test').legacyViewer,false);
  const serialized=JSON.stringify(publicState);
  for(const value of [primary.secret,remote.secret,'primaryPinHash','browserSessions','ownPrimaryPinValue']) assert.ok(!serialized.includes(value),value);
  assert.equal((await command(s,'remote','start',{},remote.secret)).status,200);
  assert.equal((await command(s,'remote','settings',{},remote.secret)).status,403);
  await s.action({type:'clientControl',targetClientId:'remote',enabled:false});
  assert.equal((await command(s,'remote','reset',{},remote.secret)).status,403);
});

test('launcher PIN gates first controls and all primary claims; rotation invalidates confirmation without stopping timer',async t=>{
  const s=await fixture(t,'darwin',{launcherToken});
  const primary=await s.credentials('clock-test');
  assert.equal((await s.start()).running,true,'no-primary behavior stays available without PIN');
  const anchor=(await s.state()).timerClock.startedAt;
  assert.equal((await pin(s,'1234')).status,200);
  assert.equal((await command(s,'clock-test','pause',{},primary.secret)).status,403);
  for(const source of [undefined,'shortcut','other']) {
    const denied=await command(s,'clock-test','primary',{primaryClientId:'clock-test',source},primary.secret);
    assert.equal(denied.status,403); assert.equal(denied.body.primaryPinRequired,true);
  }
  assert.equal((await command(s,'clock-test','primary',{primaryClientId:'clock-test',pin:'1234'},primary.secret)).status,200);
  assert.equal((await s.state()).timerClock.startedAt,anchor);
  assert.equal((await pin(s,'5678')).status,200);
  const denied=await command(s,'clock-test','reset',{},primary.secret);
  assert.equal(denied.status,403); assert.equal(denied.body.running,true);
  assert.equal((await command(s,'clock-test','confirmPin',{pin:'1234'},primary.secret)).status,403);
  assert.equal((await command(s,'clock-test','confirmPin',{pin:'5678'},primary.secret)).status,200);
  assert.equal((await s.state()).timerClock.startedAt,anchor);
  assert.equal((await s.action({type:'pause'})).running,false);
  await s.restart();
  assert.equal((await command(s,'clock-test','reset',{},primary.secret)).status,200,'secret and confirmation survive restart');
  assert.equal((await pin(s,'')).status,200);
  assert.equal((await s.state()).primaryPinSet,false);
});

test('PIN takeover ignores source and failed attempt budget cannot be reset by changing browser ID',async t=>{
  const s=await fixture(t,'darwin',{launcherToken});
  await s.action({type:'primary',primaryClientId:'clock-test'});
  await s.action({type:'primaryPin',pin:'1234'});
  for(let n=0;n<5;n++) {
    const c=await session(s,'intruder-'+n);
    const result=await command(s,c.clientId,'primary',{primaryClientId:c.clientId,pin:'0000'},c.secret);
    assert.equal(result.status,403);
  }
  const c=await session(s,'fresh');
  const blocked=await command(s,c.clientId,'primary',{primaryClientId:c.clientId,pin:'1234'},c.secret);
  assert.equal(blocked.status,403); assert.ok(blocked.body.primaryPinBlockedUntil);
  assert.equal((await pin(s,'5678')).status,200,'launcher can recover after lockout');
  assert.equal((await command(s,c.clientId,'primary',{primaryClientId:c.clientId,pin:'5678'},c.secret)).status,200);
});

test('launcher PIN capability rejects ordinary browsers, forged headers and invalid PIN; secondary administration requires session and current PIN',async t=>{
  const s=await fixture(t,'darwin',{launcherToken});
  for(const headers of [{},{'x-fdv-launcher-token':'b'.repeat(64)},
    {'x-fdv-launcher-token':launcherToken,origin:s.baseUrl},
    {'x-fdv-launcher-token':launcherToken,'sec-fetch-site':'same-origin'}]) assert.equal((await pin(s,'1234',headers)).status,403);
  assert.equal((await pin(s,'123')).status,400);
  await s.action({type:'primary',primaryClientId:'clock-test'});
  await pin(s,'1234');
  const primary=await s.credentials('clock-test');
  for(const secret of [undefined,primary.secret]) {
    const r=await fetch(s.baseUrl+'/api/sec/configure',{method:'POST',headers:{'content-type':'application/json',...(secret?{'x-fdv-client-secret':secret}:{})},body:JSON.stringify({clientId:'clock-test',address:'http://127.0.0.1:1'})});
    assert.equal(r.status,secret?403:401);
  }
});

test('revoked primary confirmation is replicated; launcher on standby can rotate PIN without granting itself browser rights', {timeout:20000},async t=>{
  const a=await fixture(t,null,{launcherToken}),b=await fixture(t,null,{launcherToken});
  const primary=await a.credentials('clock-test');
  await a.action({type:'primary',primaryClientId:'clock-test'});
  const pair=await fetch(a.baseUrl+'/api/sec/configure',{method:'POST',headers:{'content-type':'application/json','x-fdv-client-secret':primary.secret},body:JSON.stringify({clientId:'clock-test',address:b.baseUrl})});
  assert.equal(pair.status,200);
  assert.equal((await pin(b,'1234')).status,200);
  assert.equal((await command(a,'clock-test','start',{},primary.secret)).status,403);
  const confirmed=await command(b,'clock-test','confirmPin',{pin:'1234'},primary.secret);
  assert.equal(confirmed.status,200);
  const started=await command(b,'clock-test','start',{},primary.secret);
  assert.equal(started.status,200); assert.equal(started.body.running,true);
});

test('PIN rotation preserves explicitly delegated CTRL while blocking unconfirmed primary',async t=>{
  const s=await fixture(t,'darwin',{launcherToken});
  await s.action({type:'primary',primaryClientId:'clock-test'});
  const remote=await session(s,'remote');
  await fetch(s.baseUrl+'/api/state?clientId=remote',{headers:{'x-fdv-client-secret':remote.secret}});
  await s.action({type:'clientControl',targetClientId:'remote',enabled:true});
  await pin(s,'1234');
  const primary=await s.credentials('clock-test');
  assert.equal((await command(s,'clock-test','start',{},primary.secret)).status,403);
  assert.equal((await command(s,'remote','start',{},remote.secret)).status,200);
  await pin(s,'5678');
  assert.equal((await command(s,'remote','pause',{},remote.secret)).status,200);
  assert.equal((await command(s,'remote','clientControl',{targetClientId:'remote',enabled:true},remote.secret)).status,403);
});

test('expired timer snapshots retain PIN; old snapshots without secrets cannot hand out existing roles',async t=>{
  const fs=require('node:fs');
  const s=await fixture(t,'darwin',{launcherToken});
  await s.action({type:'primary',primaryClientId:'clock-test'});
  await s.action({type:'primaryPin',pin:'1234'});
  await s.start();
  await s.stop();
  const snapshot=s.snapshot();
  snapshot.savedAtWall-=13*60*60*1000;
  delete snapshot.timerState.browserSessions;
  delete snapshot.timerState.browserSessionRevision;
  fs.writeFileSync(s.snapshotPath,JSON.stringify(snapshot));
  await s.restart();
  assert.equal((await s.state()).primaryPinSet,true);
  assert.equal((await s.state()).running,false,'expired timer is not resumed');
  const newcomer=await session(s,'clock-test');
  assert.equal((await command(s,newcomer.clientId,'primary',{primaryClientId:newcomer.clientId},newcomer.secret)).status,403);
  assert.equal((await command(s,newcomer.clientId,'primary',{primaryClientId:newcomer.clientId,pin:'1234'},newcomer.secret)).status,200);
});

test('migration never grants old primary or CTRL identity to the first browser naming it',async t=>{
  const fs=require('node:fs');
  const s=await fixture(t,'darwin');
  await s.action({type:'primary',primaryClientId:'clock-test'});
  await s.action({type:'primaryPin',pin:'1234'});
  await s.stop();
  const snapshot=s.snapshot();
  delete snapshot.timerState.browserSessions;
  delete snapshot.timerState.browserSessionRevision;
  snapshot.timerState.primaryPinValue='1234';
  snapshot.timerState.limitedControlClientIds=['old-ctrl'];
  fs.writeFileSync(s.snapshotPath,JSON.stringify(snapshot));
  await s.restart();
  for(const id of ['clock-test','old-ctrl']) {
    const newcomer=await session(s,id);
    assert.notEqual(newcomer.clientId,id);
    assert.equal((await command(s,newcomer.clientId,'start',{},newcomer.secret)).status,403);
  }
  const state=await(await fetch(s.baseUrl+'/api/state?clientId=clock-test&diagnostics=1')).json();
  assert.ok(!JSON.stringify(state).includes('1234'));
});
