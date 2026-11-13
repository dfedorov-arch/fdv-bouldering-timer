"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {create}=require("../lib/final-start-prewarm");
const countdown={eligible:true,countdown:true,startedAt:100000,epoch:"server"};
const waiting={eligible:true,countdown:false,startedAt:0,epoch:"server"};

test("Final warms ten seconds before its deadline, then every ten seconds while waiting",()=>{
 const p=create();assert.equal(p.tick(countdown,89999,true),null);
 const first=p.tick(countdown,90000,true);assert.ok(first);assert.ok(p.isCurrent(first.token));
 assert.equal(p.tick(countdown,99999,true),null);const second=p.tick(waiting,100000,true);assert.ok(second);
 assert.equal(p.isCurrent(first.token),false);assert.equal(p.isCurrent(second.token),true);
 assert.equal(p.tick(waiting,109999,true),null);assert.ok(p.tick(waiting,110000,true));
 assert.equal(p.tick(waiting,110001,true),null);
});
test("late joining and throttled callbacks emit one quiet pulse without catch-up bursts",()=>{
 const p=create();assert.ok(p.tick(countdown,95000,true));assert.equal(p.tick(waiting,100000,true),null);
 assert.ok(p.tick(waiting,150000,true));assert.equal(p.tick(waiting,150001,true),null);
 assert.equal(p.tick(waiting,159999,true),null);assert.ok(p.tick(waiting,160000,true));
});
test("Start cancels pending asynchronous warm-up and repeats until the waiting cycle ends",()=>{
 const p=create(),pulse=p.tick(waiting,100000,true);p.stop();assert.equal(p.isCurrent(pulse.token),false);
 assert.equal(p.tick(waiting,130000,true),null);p.tick({eligible:false},130100,true);
 assert.ok(p.tick(waiting,140000,true));
});
test("muted or suspended output waits without consuming the pulse and ignores sampling jitter",()=>{
 const p=create();assert.equal(p.tick(countdown,90000,false),null);assert.ok(p.tick(countdown,95000,true));
 assert.equal(p.tick({...countdown,startedAt:100000.3},96000,true),null);
 assert.equal(p.tick(waiting,110000,false),null);assert.ok(p.tick(waiting,130000,true));
});
test("new deadline or server invalidates the prior cycle; leaving Final cancels repeats",()=>{
 const p=create(),a=p.tick(waiting,100000,true);
 assert.equal(p.tick({...countdown,startedAt:150000},110000,true),null);assert.equal(p.isCurrent(a.token),false);
 const b=p.tick({...waiting,epoch:"other"},120000,true);assert.ok(b);
 assert.equal(p.tick({eligible:false},130000,true),null);assert.equal(p.isCurrent(b.token),false);
});
