"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const delivery = require("../lib/client-delivery");
const { fixture } = require("./helpers/controlled-clock-server");

test("delivery receipts require successful application and render, not receipt or state version", () => {
  const c = delivery.createClient(), a = { delivery: { protocol: 1, key: "a" } }, b = { delivery: { protocol: 1, key: "b" } };
  c.receive(a); c.rendered(); assert.equal(c.report().deliveryApplied, "");
  c.prepare(a); c.rendered(); assert.equal(c.report().deliveryApplied, "a");
  c.receive(b); c.failed(); c.rendered(); assert.equal(c.report().deliveryApplied, "a");
  c.prepare(a); c.rendered(); assert.equal(c.report().deliveryApplied, "a");
  c.prepare(b); c.rendered(); assert.equal(c.report().deliveryApplied, "b");
  assert.equal(delivery.status({connected:true,deliveryProtocol:1,deliveryReceived:"b",deliveryApplied:"a"},"b",5000),"received");
});
test("receipt identity distinguishes restart, authority epoch and lower state versions", () => {
  const values = [delivery.key("one",9),delivery.key("two",9),delivery.key("one",2),
    delivery.key("one",9,{session:"pair",epoch:1,primaryInstanceId:"one"}),
    delivery.key("two",2,{session:"pair",epoch:2,primaryInstanceId:"two"})];
  assert.equal(new Set(values).size,values.length);
  assert.equal(delivery.key("one",9,{session:"pair",epoch:1,primaryInstanceId:"one"}),delivery.key("standby",9,{session:"pair",epoch:1,primaryInstanceId:"one"}));
  assert.equal(delivery.status({connected:true,deliveryProtocol:1,deliveryApplied:values[0]},values[1],4000),"unconfirmed");
});
test("event handling is bounded and deduplicates concurrent and completed fallback copies", () => {
  const c=delivery.createClient(); assert.equal(c.beginEvent("test"),true); assert.equal(c.beginEvent("test"),false);
  c.finishEvent("test","applied"); assert.equal(c.beginEvent("test"),false);
  for(let i=0;i<40;i++){c.beginEvent("e"+i);c.finishEvent("e"+i,"expired");}
  assert.equal(JSON.parse(c.report().deliveryEvents).length,32);
  const blocked=delivery.createClient();for(let i=0;i<32;i++)assert.equal(blocked.beginEvent("pending"+i),true);
  assert.equal(blocked.beginEvent("overflow"),false);
});
test("server never infers Legacy application, ignores foreign receipt and clears stale reload receipts",async t=>{
  const s=await fixture(t,null);
  async function report(params){await (await fetch(s.baseUrl+"/api/state?diagnostics=1&clientId=receipt-test&"+new URLSearchParams(params))).json();return s.state();}
  let state=await report({legacy:1}); assert.equal(state.clients.find(c=>c.id==="receipt-test").delivery.status,"unsupported");
  state=await report({deliveryProtocol:1,deliveryApplied:"foreign",deliveryReceived:"foreign"});
  assert.notEqual(state.clients.find(c=>c.id==="receipt-test").delivery.status,"applied");
  state=await report({deliveryProtocol:1,deliveryApplied:state.delivery.key,deliveryReceived:state.delivery.key});
  assert.equal(state.clients.find(c=>c.id==="receipt-test").delivery.status,"applied");
  state=await report({deliveryProtocol:1,deliveryApplied:"",deliveryReceived:""});
  assert.notEqual(state.clients.find(c=>c.id==="receipt-test").delivery.status,"applied");
  state=await report({clientBuild:443});
  assert.equal(state.clients.find(c=>c.id==="receipt-test").delivery.status,"unsupported");
});


test("an SSE connection retains transport presence without refreshing the last browser report",async t=>{
  const s=await fixture(t,"darwin");
  await fetch(s.baseUrl+"/api/state?clientId=quiet-screen&deliveryProtocol=1");
  s.frame(16000);
  const stream=await fetch(s.baseUrl+"/api/events?clientId=quiet-screen");
  try {
    const client=(await s.state()).clients.find(c=>c.id==="quiet-screen");
    assert.ok(client,"Live transport keeps the registry entry");
    assert.equal(client.connected,false,"Transport activity is not a fresh JS report");
    assert.ok(client.age>=16000);
  } finally {await stream.body.cancel();}
});

test("visible start lists must finish their deferred DOM update before application is confirmed",()=>{
  const c=delivery.createClient(),remote={delivery:{protocol:1,key:"lists"},startListEnabled:true,startListVisible:true};
  c.receive(remote);c.prepare(remote);c.rendered();assert.equal(c.report().deliveryApplied,"");
  c.listsRendered();assert.equal(c.report().deliveryApplied,"lists");
});

test("session-scoped event receipts prevent replay across reload, including interrupted handlers",()=>{
  let stored="";const options={load:()=>stored,save:value=>{stored=value;}};
  const first=delivery.createClient(options);first.beginEvent("played");first.finishEvent("played","applied");first.beginEvent("interrupted");
  const reloaded=delivery.createClient(options);
  assert.equal(reloaded.beginEvent("played"),false);assert.equal(reloaded.beginEvent("interrupted"),false);
  assert.equal(JSON.parse(reloaded.report().deliveryEvents).find(r=>r.id==="interrupted").result,"failed");
});
