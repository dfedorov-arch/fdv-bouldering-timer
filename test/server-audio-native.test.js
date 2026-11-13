"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {spawnSync}=require("node:child_process");
const {NativeAudio,syntheticWave}=require("../lib/server-audio-native");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test("native prewarm is an 80ms quiet tone rather than the ordinary minute signal",()=>{
 const wav=syntheticWave("prewarm"),frames=(wav.length-44)/2;
 assert.equal(frames/44100,.08);
 let peak=0;for(let i=44;i<wav.length;i+=2)peak=Math.max(peak,Math.abs(wav.readInt16LE(i)));
 assert.ok(peak>0&&peak<=132);
});

test("Unix native backend requires a packaged helper for the exact OS and architecture",t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-native-platform-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const platform of ["darwin","linux"])for(const arch of ["x64","arm64"]){
    const player=new NativeAudio(root,{platform,arch});assert.equal(player.supported,false);
    fs.mkdirSync(path.dirname(player.executable),{recursive:true});fs.writeFileSync(player.executable,"fixture");
    assert.equal(player.supported,true);assert.equal(player.backend,platform==="darwin"?"coreaudio-pcm":"alsa-pcm");
    player.failed=true;assert.equal(player.supported,false);
  }
  assert.equal(new NativeAudio(root,{platform:"linux",arch:"ia32"}).supported,false);
  assert.equal(new NativeAudio(root,{platform:"freebsd",arch:"x64"}).supported,false);
});

test("native START/WARN PCM remains sample-exact across refills and duplicate submissions",{skip:process.platform!=="win32"},()=>{
  const shell=path.join(process.env.SystemRoot||"C:/Windows","System32/WindowsPowerShell/v1.0/powershell.exe");
  const result=spawnSync(shell,["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(__dirname,"helpers/native-audio-render.ps1")],{encoding:"utf8",windowsHide:true,timeout:20000});
  assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/PASS exact continuous START\/WARN PCM/);
});
test("native Windows deadline, cancellation and independent watchdog with silent PCM",{
  skip:process.platform!=="win32"||process.env.FDV_TEST_NATIVE_AUDIO!=="1",timeout:20000
},async t=>{
  const root=path.resolve(__dirname,".."),directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-native-test-"));
  const events=[],failures=[],player=new NativeAudio(root,{onEvent:e=>events.push(e),onFailure:r=>failures.push(r)});
  t.after(async()=>{await player.close();assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));fs.rmSync(directory,{recursive:true,force:true});});
  const wave=syntheticWave("warn");wave.fill(0,44);const file=path.join(directory,"silence.wav");fs.writeFileSync(file,wave);
  await player.start();await player.request("load",{sources:{start:file,end:file,minute:file,warn:file},speech:{},language:"en"});
  let now=performance.now();
  await player.replace([{key:"silent-first",kind:"warn",at:now+200,grace:300,maxDurationMs:960}],1,now);
  await delay(450);const status=await player.request("status");const played=events.filter(e=>e.stage==="played"&&e.key==="silent-first");
  assert.equal(played.length,1,JSON.stringify({events,failures,status,clockOffset:player.clockOffset}));assert.ok(Math.abs(played[0].lateness)<50,JSON.stringify(played[0]));
  now=performance.now();await player.replace([
    {key:"1:break:warn:5:silent-cancel",kind:"warn",at:now+200,grace:300},
    {key:"silent-retained-start",kind:"start",at:now+400,grace:1200}
  ],1,now);
  await player.cancel({breakWarnings:true,festival:false});await delay(650);
  assert.equal(events.some(e=>e.key==="1:break:warn:5:silent-cancel"),false);
  assert.equal(events.filter(e=>e.stage==="played"&&e.key==="silent-retained-start").length,1);
  now=performance.now();await player.replace([{key:"cancelled",kind:"warn",at:now+200,grace:300}],2,now);
  await player.stop(3);await delay(350);assert.equal(events.some(e=>e.key==="cancelled"),false);
  now=performance.now();await player.replace([{key:"watchdog-cancelled",kind:"warn",at:now+3000,grace:300}],4,now);
  await delay(3200);assert.ok(events.some(e=>e.stage==="watchdog"));assert.equal(events.some(e=>e.key==="watchdog-cancelled"),false);
  // Decode real packaged MP3/WAV assets without scheduling audible playback.
  for(const [name,extension]of [["FSR_2026","mp3"],["IFSC_PRAGUE_2025","wav"]]){
    const sources={};
    for(const [kind,base]of [["start","START"],["end","START"],["minute","MINUTE"],["warn","WARNING"]])sources[kind]=`beeps/${name}/${base}.${extension}`;
    await player.prepare({id:name,sources},"ru",false);await player.stop(5);
  }
  assert.deepEqual(failures,[]);
});


test("native clock bridge reanchors after a sleep gap without projecting cues hours ahead",async()=>{
  let nodeAt=10000,nativeAt=5000;
  const events=[],requests=[];
  const player=new NativeAudio("unused",{clockNow:()=>nodeAt,onEvent:event=>events.push(event)});
  player.child={};player.clockOffset=-5000;
  player.request=async(op,data)=>{
    if(op==="keepalive"){
      const sampled=nativeAt+2;nodeAt+=4;nativeAt+=4;
      return {now:sampled,renderReads:1};
    }
    requests.push({op,data});return {};
  };
  await player.keepalive();assert.equal(events.length,0);
  nodeAt+=3600000; // Node's macOS clock includes sleep; native Stopwatch does not.
  await player.keepalive();
  assert.equal(player.clockOffset,-3605000);
  assert.equal(events.length,1);assert.equal(events[0].stage,"clock-reanchor");
  assert.equal(events[0].correctionMs,-3600000);
  await player.replace([{key:"after-wake",kind:"start",at:100400}],2,100000,1,nodeAt);
  assert.equal(requests.at(-1).data.cues[0].at,nativeAt+400);
  await player.keepalive();assert.equal(events.length,1,"stable checks cannot repeatedly reset output");
});

test("native clock bridge rejects delayed observations and tolerates ordinary IPC noise",async()=>{
  let nodeAt=10000;
  const events=[];
  const player=new NativeAudio("unused",{clockNow:()=>nodeAt,onEvent:event=>events.push(event)});
  player.child={};player.clockOffset=-5000;
  player.request=async()=>{nodeAt+=500;return {now:5001};};
  await player.keepalive();
  assert.equal(player.clockOffset,-5000);assert.equal(events.length,0);
  player.request=async()=>{const result={now:nodeAt-5000+5};nodeAt+=4;return result;};
  await player.keepalive();
  assert.equal(player.clockOffset,-5000,"small timing noise must not move scheduled cues");
  assert.equal(events.length,0);
});


test("native clock bridge rejects non-numeric native timestamps",async()=>{
  for(const value of [undefined,null,"5002",NaN,Infinity]){
    let nodeAt=10000;const events=[];
    const player=new NativeAudio("unused",{clockNow:()=>nodeAt,onEvent:e=>events.push(e)});
    player.child={};player.clockOffset=-5000;
    player.request=async()=>{nodeAt+=4;return {now:value};};
    await player.keepalive();assert.equal(player.clockOffset,-5000);assert.equal(events.length,0);
  }
});

test("native clock bridge also corrects a forward native clock discontinuity",async()=>{
  let nodeAt=10000;const events=[];
  const player=new NativeAudio("unused",{clockNow:()=>nodeAt,onEvent:e=>events.push(e)});
  player.child={};player.clockOffset=-5000;
  player.request=async()=>{nodeAt+=4;return {now:7205002};};
  await player.keepalive();assert.equal(player.clockOffset,7195000);
  assert.equal(events[0].correctionMs,7200000);
});


// A device-free native process protocol exercises startup/IPC failure and
// recovery without replacing the recovery implementation or sleeping the Mac.
function recoveryHarness(t){
  const {EventEmitter}=require("node:events"),{PassThrough,Writable}=require("node:stream");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-native-recovery-"));
  const jobs=new Set(),children=[],events=[],failures=[];let at=10000,mode="ok";
  const setTimer=(fn,ms)=>{const job={fn,ms,unref(){}};jobs.add(job);return job;};
  const clearTimer=job=>jobs.delete(job);
  const player=new NativeAudio(root,{platform:"darwin",arch:"arm64",clockNow:()=>at,setTimer,clearTimer,
    onEvent:e=>events.push(e),onFailure:r=>failures.push(r),spawnProcess:()=>{
      const child=new EventEmitter();children.push(child);child.stdout=new PassThrough();child.stderr=new PassThrough();child.requests=[];
      child.stdin=new Writable({write(chunk,encoding,done){
        const q=JSON.parse(chunk);child.requests.push(q);
        if(mode==="timeout"){done();return;}
        const result=q.op==="ping"?at-5000:q.op==="load"?{start:1000}:q.op==="keepalive"?{now:at-5000}:{};
        queueMicrotask(()=>child.stdout.write(JSON.stringify({id:q.id,ok:true,result})+"\n"));done();
      }});
      child.kill=()=>{if(!child.dead){child.dead=true;queueMicrotask(()=>{child.emit("exit",1,null);child.emit("close",1,null);child.stdout.end();child.stderr.end();});}return true;};
      queueMicrotask(()=>{if(mode==="exit")child.kill();else child.stdout.write('{"stage":"ready"}\n');});
      return child;
    }});
  fs.mkdirSync(path.dirname(player.executable),{recursive:true});fs.writeFileSync(player.executable,"fixture");
  t.after(async()=>{mode="ok";await player.close();fs.rmSync(root,{recursive:true,force:true});});
  return {player,jobs,children,events,failures,setMode:value=>mode=value,setNow:value=>at=value,
    async run(ms){const job=[...jobs].find(job=>job.ms===ms);assert.ok(job,"scheduled "+ms+"ms");jobs.delete(job);job.fn();await delay(0);await delay(0);}};
}

test("native recovery restarts once, reloads PCM and remeasures clocks before advertising availability",async t=>{
  const h=recoveryHarness(t);await h.player.prepare({id:"p",sources:{}},"ru");
  const first=h.children[0];h.player.fail("player-timeout");
  assert.equal(h.player.supported,false);assert.equal(h.player.recoveryStatus.state,"recovering");
  h.player.fail("duplicate");assert.equal([...h.jobs].filter(j=>j.ms===1000).length,1);
  h.setNow(3610000);await h.run(1000);
  assert.equal(h.children.length,2);assert.equal(first.dead,true);
  assert.equal(h.player.supported,true);assert.equal(h.player.recoveryStatus.epoch,1);
  assert.equal(h.children[1].requests.filter(q=>q.op==="ping").length,5);
  assert.equal(h.children[1].requests.filter(q=>q.op==="load").length,1);
  assert.equal(h.player.clockOffset,-5000);assert.equal(h.player.recoveryAttempt,1);
  // Delayed callbacks/data from the old process cannot kill the replacement.
  first.emit("error",new Error("late old process error"));first.emit("exit",1,null);
  assert.equal(h.player.supported,true);
});

test("native recovery is bounded to three delayed attempts even with repeated prepares and commands",async t=>{
  const h=recoveryHarness(t);await h.player.prepare({id:"p",sources:{}});h.setMode("exit");h.player.fail("player-exited");
  for(const ms of [1000,3000,10000])await h.run(ms);
  assert.equal(h.children.length,4);assert.equal(h.player.recoveryAttempt,3);
  assert.equal(h.player.recoveryStatus.state,"exhausted");assert.equal(h.jobs.size,0);
  for(let i=0;i<5;i++){await assert.rejects(h.player.prepare({id:"p",sources:{}}));h.player.fail("another-command");}
  assert.equal(h.children.length,4);assert.equal(h.jobs.size,0);
});

test("native recovery handles an unresponsive helper and preserves its failure reason",async t=>{
  const h=recoveryHarness(t);await h.player.start();h.setMode("timeout");
  const pending=h.player.request("keepalive");const rejected=assert.rejects(pending,/timeout/);
  await h.run(4000);await rejected;
  assert.equal(h.player.recoveryStatus.reason,"player-timeout");
  h.setMode("ok");await h.run(1000);assert.equal(h.player.supported,true);
});

test("a short recovery never resets the retry budget; one uninterrupted healthy minute does",async t=>{
  const h=recoveryHarness(t);await h.player.start();h.player.fail("player-exited");await h.run(1000);
  h.setNow(11000);await h.player.keepalive();assert.equal(h.player.recoveryAttempt,1);
  // A large sleep/wake gap must not masquerade as a minute of healthy checks.
  h.setNow(3610000);await h.player.keepalive();assert.equal(h.player.recoveryAttempt,1);
  for(let i=1;i<=60;i++){h.setNow(3610000+i*1000);await h.player.keepalive();}
  assert.equal(h.player.recoveryAttempt,0);h.player.fail("player-exited");
  assert.ok([...h.jobs].some(j=>j.ms===1000));
});

test("server close cancels scheduled native recovery and missing helpers never get retried",async t=>{
  const h=recoveryHarness(t);await h.player.start();h.player.fail("player-exited");await h.player.close();
  assert.equal([...h.jobs].some(j=>[1000,3000,10000].includes(j.ms)),false);
  await h.player.recover();assert.equal(h.children.length,1);
  const missing=new NativeAudio("/nonexistent",{setTimer:()=>{throw new Error("no retry for missing binary");}});
  missing.fail("player-startup");assert.equal(missing.recoveryStatus.state,"unsupported");await missing.close();
});


test("a stalled PCM device is detected after wake grace even while the helper replies",async t=>{
  const h=recoveryHarness(t);await h.player.start();
  h.player.request=async()=>({renderReads:200,now:5000});
  await h.player.keepalive();h.setNow(3610000);await h.player.keepalive();
  assert.equal(h.player.failed,false,"wake gets a fresh output grace period");
  for(const at of [3610500,3611000,3611500,3612000]){h.setNow(at);await h.player.keepalive();}
  h.setNow(3612500);await assert.rejects(h.player.keepalive(),/stalled/);
  assert.equal(h.player.recoveryStatus.reason,"player-output-stalled");
});

test("recovery cannot spawn a second helper before the old process has exited",async t=>{
  const h=recoveryHarness(t);await h.player.start();const child=h.children[0];
  child.kill=()=>true;h.player.fail("player-timeout");
  await h.run(1000);assert.equal(h.children.length,1);
  child.emit("close",1,null);await delay(0);await delay(0);
  assert.equal(h.children.length,2);assert.equal(h.player.supported,true);
});
