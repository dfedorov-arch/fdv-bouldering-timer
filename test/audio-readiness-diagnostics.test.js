"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers/controlled-clock-server");
const {authenticatedFetch:fetch}=require("./helpers/browser-session");
test("audio readiness diagnostics roundtrip without moving timer state or anchor",async t=>{
 const s=await fixture(t,"darwin");await s.action({type:"primary",primaryClientId:"clock-test"});
 const started=await s.start();
 const query=new URLSearchParams({clientId:"clock-test",diagnostics:"1",audioUnlocked:"false",audioContextState:"suspended",audioUnlockState:"resume-rejected",audioUnlockError:"NotAllowedError"});
 let response=await fetch(s.baseUrl+"/api/state?"+query),state=await response.json();
 assert.equal(response.status,200);let c=state.clients.find(c=>c.id==="clock-test");
 assert.equal(c.audioUnlocked,false);assert.equal(c.audioContextState,"suspended");assert.equal(c.audioUnlockState,"resume-rejected");assert.equal(c.audioUnlockError,"NotAllowedError");
 assert.equal(state.version,started.version);assert.equal(state.timerClock.startedAt,started.timerClock.startedAt);
 query.set("audioContextState","x".repeat(100));query.set("audioUnlockState","x".repeat(100));query.set("audioUnlockError","x".repeat(200));
 state=await (await fetch(s.baseUrl+"/api/state?"+query)).json();c=state.clients.find(c=>c.id==="clock-test");
 assert.equal(c.audioContextState.length,24);assert.equal(c.audioUnlockState.length,32);assert.equal(c.audioUnlockError.length,80);
});
