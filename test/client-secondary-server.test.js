"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { create } = require("../lib/client-secondary-server");

function browser(disabled = false) {
  let time = 0;
  let info = {protocol:1,session:"session",primaryUrl:"http://primary:8008",secondaryUrl:"http://backup:8008",
    role:"secondary",ready:true,sourceConnected:false,switchAll:false,switchClients:[]};
  const calls = [];
  const timers = new Map();
  let next = 0;
  let switches = 0;
  let reachable = true;
  const storage = new Map();
  class XHR {
    open(method,url) { this.method=method;this.url=url; }
    setRequestHeader() {}
    send(body) {
      calls.push({method:this.method,url:this.url,body});
      if (this.method === "POST") info = {...info,switchAll:true};
      this.status=reachable ? 200 : 503;this.readyState=4;this.responseText=JSON.stringify({sec:info});this.onreadystatechange();
    }
  }
  const env = {location:{protocol:"http:",host:"primary:8008"},performance:{now:()=>time},XMLHttpRequest:XHR,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    setTimeout:(callback,delay)=>{const id=++next;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),
    fetch:(url,init)=>Promise.resolve({url,init})};
  const controller=create(env,{disabled,clientId:()=>"display",switched:()=>switches++});
  return {env,controller,calls,timers,reachable:value=>{reachable=value;},at:value=>{time=value;},set:value=>{info={...info,...value};},get switches(){return switches;},
    configure:()=>controller.observe({serverInstanceId:"old-instance",sec:{...info,role:"primary"}})};
}

test("SEC is inert without configuration and in standalone mode", async()=>{
  for (const disabled of [false,true]) {
    const h=browser(disabled);
    assert.equal(h.timers.size,0);
    assert.equal((await h.controller.fetch("/api/state")).url,"/api/state");
    h.controller.check();
    assert.equal(h.calls.length,0);
    if (disabled) { h.configure(); assert.equal(h.timers.size,0); assert.equal(h.controller.info().config,null); }
  }
});

test("reserve probes do not extend primary health, and failover waits for 20 seconds", async()=>{
  const h=browser();h.configure();h.controller.contact();
  h.at(19999);h.controller.check();
  assert.equal(h.switches,0);
  assert.equal(h.calls.filter(call=>call.method==="POST").length,0);
  h.at(20000);h.controller.check();
  assert.equal(h.switches,1);
  assert.equal(h.controller.info().onSecondary,true);
  assert.equal((await h.controller.fetch("/api/state")).url,"http://backup:8008/api/state");
  assert.equal(h.controller.url("beeps/profile/start.wav"),"http://backup:8008/beeps/profile/start.wav");
  assert.equal(h.controller.url("data:audio/wav;base64,AA"),"data:audio/wav;base64,AA");
  assert.equal(h.controller.observe({serverInstanceId:"old-instance",sec:null}),true);
  assert.equal(h.controller.info().onSecondary,true);
});

test("a browser can join a still-following reserve, then promote it if its source subsequently disappears",()=>{
  const h=browser();h.configure();h.set({sourceConnected:true});
  h.at(20000);h.controller.check();
  assert.equal(h.switches,1);
  assert.equal(h.calls.filter(call=>call.method==="POST").length,0);
  h.set({sourceConnected:false});h.controller.check();
  assert.equal(h.calls.filter(call=>call.method==="POST").length,1);
  assert.equal(h.switches,1);
});

test("manual group cutover is immediate while ordinary primary contact postpones automatic failover",()=>{
  const h=browser();h.configure();h.at(19000);h.controller.contact();h.at(21000);h.controller.check();
  assert.equal(h.switches,0);
  h.controller.observe({sec:{protocol:1,session:"session",primaryUrl:"http://primary:8008",secondaryUrl:"http://backup:8008",switchAll:true}});
  assert.equal(h.switches,1);
});

test("a single display's saved endpoint does not move another tab, but survives its own reload",()=>{
  const h=browser();h.configure();h.controller.switchToSecondary();
  const own=create(h.env,{clientId:()=>"display"});
  const other=create(h.env,{clientId:()=>"another-display"});
  assert.equal(own.info().onSecondary,true);
  assert.equal(other.info().onSecondary,false);
  assert.equal(other.info().config.session,"session");
});

test("an unavailable reserve is reported without moving the browser, and recovery enables takeover",()=>{
  const h=browser();h.configure();h.controller.check();
  assert.equal(h.controller.info().available,true);
  h.at(21000);h.reachable(false);h.controller.check();
  assert.equal(h.controller.info().available,false);
  assert.equal(h.switches,0);
  h.reachable(true);h.controller.check();
  assert.equal(h.controller.info().available,true);
  assert.equal(h.switches,1);
});

test("role reversal keeps the current endpoint, retires old epochs and permits using the returned process again",()=>{
  const h=browser();h.configure();h.controller.switchToSecondary();
  const reversed={protocol:1,session:"session",epoch:1,primaryUrl:"http://backup:8008",secondaryUrl:"http://primary:8008",
    secondaryInstanceId:"old-instance",ready:true,sourceConnected:true,switchAll:false,switchClients:[]};
  h.controller.observe({serverInstanceId:"new-instance",sec:reversed});
  assert.equal(h.switches,1,"metadata-only reversal must not reconnect or rebuild audio");
  assert.equal(h.controller.info().active,reversed.primaryUrl);
  assert.equal(h.controller.info().onSecondary,false);
  assert.equal(h.controller.observe({serverInstanceId:"old-instance",sec:{...reversed,epoch:0}}),true);
  assert.equal(h.controller.info().config.epoch,1);
  h.controller.switchToSecondary();
  assert.equal(h.controller.info().active,reversed.secondaryUrl);
  assert.equal(h.controller.observe({serverInstanceId:"old-instance",sec:reversed}),false);
  assert.equal(h.switches,2);
});

test("a stranded original page moves to the new primary once, but a later explicit reserve visit is retained",()=>{
  const h=browser();h.configure();
  const reversed={protocol:1,session:"session",epoch:1,primaryUrl:"http://backup:8008",secondaryUrl:"http://primary:8008",
    secondaryInstanceId:"old-instance",ready:true,sourceConnected:true,switchAll:false,switchClients:[]};
  assert.equal(h.controller.observe({serverInstanceId:"old-instance",sec:reversed}),true);
  assert.equal(h.controller.info().active,reversed.primaryUrl);
  h.controller.switchToSecondary();
  h.controller.observe({sec:reversed});
  assert.equal(h.controller.info().active,reversed.secondaryUrl);
});
