"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {performance}=require("node:perf_hooks");
const {spawnSync}=require("node:child_process");
const {NativeAudio,syntheticWave}=require("../lib/server-audio-native");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

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
