"use strict";

const fs=require("fs"),path=require("path"),os=require("os"),readline=require("readline");
const {spawn}=require("child_process");
const {performance}=require("perf_hooks");

function syntheticWave(kind,keepAwakeConfig) {
  const rate=44100;
  const plans={start:[[0,760,.9,.3],[0,380,.9,.12]],end:[[0,760,.9,.3],[0,380,.9,.12]],
    minute:[[0,700,.18,.22],[.28,700,.18,.22]],warn:[[0,880,.22,.22]]};
  const quiet=require("./speaker-keep-awake").settings(keepAwakeConfig);
  const plan=kind==="keep-awake"?[[0,quiet.frequency,quiet.durationMs/1000,quiet.gain]]:plans[kind]||plans.minute,frames=Math.ceil(Math.max(...plan.map(p=>p[0]+p[2]))*rate);
  const wave=Buffer.alloc(44+frames*2);
  wave.write("RIFF",0);wave.writeUInt32LE(wave.length-8,4);wave.write("WAVEfmt ",8);wave.writeUInt32LE(16,16);
  wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);
  wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write("data",36);wave.writeUInt32LE(frames*2,40);
  for(let frame=0;frame<frames;frame++){
    const t=frame/rate;let value=0;
    for(const [offset,freq,duration,volume]of plan){const at=t-offset;if(at>=0&&at<duration){const fade=Math.min(1,at/.006,(duration-at)/.02);value+=Math.sin(at*freq*2*Math.PI)*volume*fade;}}
    wave.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+frame*2);
  }
  return wave;
}

class NativeAudio {
  constructor(root,{platform=process.platform,arch=process.arch,onFailure=()=>{},onEvent=()=>{},clockNow=()=>performance.now(),spawnProcess=spawn,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    this.root=root;this.platform=platform;this.arch=arch;this.onFailure=onFailure;this.onEvent=onEvent;this.clockNow=clockNow;this.spawnProcess=spawnProcess;this.setTimer=setTimer;this.clearTimer=clearTimer;
    this.recoveryAttempt=0;this.recoveryEpoch=0;this.failureReason="";this.retryTimer=null;this.recovering=false;this.healthySince=null;this.lastHealthyAt=null;
    this.child=null;this.pending=new Map();this.serial=0;this.clockOffset=0;this.failed=false;this.profile="";this.directory=null;this.health=null;
  }
  get executable(){return path.join(this.root,"lib/native-audio",`${this.platform}-${this.arch}`,"fdv-audio-player");}
  get backend(){return this.platform==="darwin"?"coreaudio-pcm":this.platform==="linux"?"alsa-pcm":"windows-pcm";}
  get supported(){return !this.closing && !this.failed && !this.recovering && this.packaged;}
  get packaged(){return (this.platform==="win32"
    ? fs.existsSync(path.join(this.root,"lib/server-audio-player.ps1")) && fs.existsSync(path.join(this.root,"lib/vendor/NAudio.dll"))
    : ["darwin","linux"].includes(this.platform) && ["x64","arm64"].includes(this.arch) && fs.existsSync(this.executable));}
  get recoveryStatus(){return {state:!this.packaged?"unsupported":this.recovering||this.retryTimer?"recovering":this.failed?"exhausted":"ready",
    attempt:this.recoveryAttempt,limit:3,reason:this.failureReason,epoch:this.recoveryEpoch};}
  scheduleRecovery(){
    if(this.closing || this.retryTimer || this.recovering || !this.failed || !this.packaged || this.recoveryAttempt>=3)return;
    const delay=[1000,3000,10000][this.recoveryAttempt];
    this.retryTimer=this.setTimer(()=>{this.retryTimer=null;this.recover().catch(()=>{});},delay);
    this.retryTimer?.unref?.();
  }
  async recover(){
    if(this.closing || this.recovering || !this.failed || this.recoveryAttempt>=3)return;
    this.recovering=true;this.recoveryAttempt++;
    this.onEvent({stage:"recovery-attempt",attempt:this.recoveryAttempt,reason:this.failureReason});
    try{
      // Never overlap output processes, even when a failed helper is slow to exit.
      if(this.retiring)await this.retiring;
      if(this.closing)return;
      this.started=null;this.profile="";this.health=null;this.clockOffset=0;this.lastRenderReads=null;this.renderProgressAt=null;this.failed=false;
      if(this.prepareArgs)await this.prepare(...this.prepareArgs);else await this.start();
      if(this.failed || this.closing)throw new Error("Native audio recovery interrupted");
      this.recovering=false;this.recoveryEpoch++;this.healthySince=this.lastHealthyAt=this.clockNow();
      this.onEvent({stage:"recovered",attempt:this.recoveryAttempt,epoch:this.recoveryEpoch});
    }catch{
      this.fail("player-recovery");
    }finally{
      this.recovering=false;this.scheduleRecovery();
      if(this.failed)this.onEvent({stage:this.retryTimer?"recovery-wait":"recovery-exhausted",attempt:this.recoveryAttempt,reason:this.failureReason});
    }
  }
  request(op,data={},timeout=4000){
    if(!this.child || this.failed)return Promise.reject(new Error("Native audio is unavailable"));
    const id=String(++this.serial);
    return new Promise((resolve,reject)=>{
      const timer=this.setTimer(()=>{this.pending.delete(id);reject(new Error("Native audio command timeout"));this.fail("player-timeout");},timeout);
      this.pending.set(id,{resolve,reject,timer});
      const child=this.child;
      child.stdin.write(JSON.stringify({id,op,...data})+"\n",error=>{if(error && this.child===child)this.fail("player-pipe");});
    });
  }
  fail(reason){
    if(this.closing)return;
    if(this.failed)return;this.failed=true;this.failureReason=reason;this.healthySince=this.lastHealthyAt=null;
    this.rejectReady?.(new Error(reason));
    if(this.child){
      const child=this.child;this.child=null;
      this.retiring=new Promise((resolve,reject)=>{
        const deadline=this.setTimer(()=>{child.kill("SIGKILL");reject(new Error("Native audio did not exit"));},2000);
        child.once("close",()=>{this.clearTimer(deadline);resolve();});
        child.stdin.destroy();child.kill();
      });
      this.retiring.catch(()=>{});
    }
    for(const item of this.pending.values()){this.clearTimer(item.timer);item.reject(new Error(reason));}this.pending.clear();
    this.scheduleRecovery();this.onFailure(reason);
  }
  async start(){
    if(this.started)return this.started;
    if(this.closing || (!this.supported && !(this.recovering && this.packaged)))throw new Error("No native audio backend on this server");
    this.started=(async()=>{
      const executable=this.platform==="win32"?path.join(process.env.SystemRoot||"C:\\Windows","System32/WindowsPowerShell/v1.0/powershell.exe"):this.executable;
      const args=this.platform==="win32"?["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(this.root,"lib/server-audio-player.ps1")]:[];
      const child=this.spawnProcess(executable,args,
        {stdio:["pipe","pipe","pipe"],windowsHide:true});
      this.child=child;
      const ready=new Promise((resolve,reject)=>{
        const timer=this.setTimer(()=>{reject(new Error("Native audio startup timeout"));if(this.child===child)this.fail("player-startup-timeout");},15000);
        this.rejectReady=error=>{this.clearTimer(timer);reject(error);};
        this.resolveReady=()=>{this.clearTimer(timer);resolve();};
        child.once("error",error=>{if(this.child!==child)return;this.rejectReady(error);this.fail("player-startup");});
        child.once("exit",(code,signal)=>{if(this.child!==child)return;this.onEvent({stage:"player-exit",code,signal});this.rejectReady(new Error("Native audio process exited"));this.fail("player-exited");});
      });
      const lines=readline.createInterface({input:child.stdout});
      lines.on("line",line=>{
        if(this.child!==child)return;
        if(line.length>131072){this.fail("player-protocol");return;}
        let message;try{message=JSON.parse(line.replace(/^\uFEFF/,""));}catch{return;}
        if(message.stage==="ready"){this.resolveReady();return;}
        if(message.stage==="fatal"){this.onEvent(message);this.fail("player-playback");return;}
        if(message.stage){this.onEvent(message);return;}
        const item=this.pending.get(String(message.id));if(!item)return;
        this.pending.delete(String(message.id));this.clearTimer(item.timer);
        if(message.ok)item.resolve(message.result);else item.reject(new Error(message.error||"Native audio rejected a command"));
      });
      child.stderr.on("data",()=>{}); // Diagnostic protocol is stdout only.
      await ready;
      const samples=[];
      for(let i=0;i<5;i++){const before=this.clockNow();const qpc=await this.request("ping");const after=this.clockNow();samples.push({rtt:after-before,offset:Number(qpc)-(before+after)/2});}
      samples.sort((a,b)=>a.rtt-b.rtt);this.clockOffset=samples[0].offset;
    })();
    return this.started;
  }
  async prepare(profile,language="ru",festival=false,keepAwakeConfig){
    this.prepareArgs=[profile,language,festival,keepAwakeConfig];
    await this.start();
    const quiet=require("./speaker-keep-awake").settings(keepAwakeConfig);
    const signature=JSON.stringify([profile,language,festival,quiet]);if(signature===this.profile)return;
    this.directory ||= fs.mkdtempSync(path.join(os.tmpdir(),"fdv-native-audio-"));
    const sources={},speech={};
    sources["keep-awake"]=path.join(this.directory,"keep-awake.wav");
    fs.writeFileSync(sources["keep-awake"],syntheticWave("keep-awake",keepAwakeConfig));
    for(const kind of ["start","end","minute","warn"]){
      const url=profile?.sources?.[kind];
      if(url){const file=path.resolve(this.root,...String(url).split("/").map(decodeURIComponent));
        if(!file.startsWith(path.resolve(this.root,"beeps")+path.sep)||!fs.statSync(file).isFile())throw new Error("Invalid sound profile path");sources[kind]=file;
      }else{sources[kind]=path.join(this.directory,kind+".wav");fs.writeFileSync(sources[kind],syntheticWave(kind));}
    }
    if(festival)for(const [,kind,ru,en]of require("./server-audio-plan").FESTIVAL){
      const url=profile?.sources?.[kind];
      if(url){const file=path.resolve(this.root,...String(url).split("/").map(decodeURIComponent));if(!file.startsWith(path.resolve(this.root,"beeps")+path.sep))throw new Error("Invalid sound profile path");sources[kind]=file;}
      else{sources[kind]="";speech[kind]=language==="en"?en:ru;}
    }
    this.lengths=await this.request("load",{sources,speech,language},this.platform==="win32"?12000:30000);this.profile=signature;
  }
  replace(cues,generation,now,rate=1,sampledAt=this.clockNow()){
    const nativeNow=sampledAt+this.clockOffset;
    return this.request("replace",{generation:String(generation),cues:cues.map(cue=>({...cue,at:nativeNow+(cue.at-now)/rate}))});
  }
  stop(generation){return this.child&&!this.failed?this.request("stop",{generation:String(generation)}):Promise.resolve();}
  cancel(flags){return this.child&&!this.failed?this.request("cancel",flags):Promise.resolve();}
  async keepalive(){
    if(this.child&&!this.failed){
      const before=this.clockNow();
      this.health=await this.request("keepalive");
      const after=this.clockNow(),nativeAt=this.health?.now,rtt=after-before;
      // A responsive command pipe does not prove that the output thread runs.
      // Allow a fresh grace period after sleep before detecting a stalled device.
      const reads=this.health?.renderReads,gap=this.lastHealthyAt===null || after-this.lastHealthyAt>2500 || after<this.lastHealthyAt;
      if(Number.isFinite(reads)){
        if(gap || reads!==this.lastRenderReads){this.lastRenderReads=reads;this.renderProgressAt=after;}
        else if(after-this.renderProgressAt>=2500){this.fail("player-output-stalled");throw new Error("Native audio output stalled");}
      }
      // A sleep or a delayed response cannot count as sustained healthy operation.
      if(this.lastHealthyAt===null || after-this.lastHealthyAt>2500 || after<this.lastHealthyAt)this.healthySince=after;
      this.lastHealthyAt=after;
      if(this.healthySince!==null && after-this.healthySince>=60000){this.recoveryAttempt=0;this.failureReason="";}
      // macOS Node/libuv and .NET Stopwatch can count sleep differently.
      // Reuse the existing heartbeat; a request spanning sleep/slow IPC is
      // not a clock sample. Leave ordinary sub-ms queue timing untouched.
      if(Number.isFinite(nativeAt) && rtt>=0 && rtt<=50){
        const offset=nativeAt-(before+after)/2,correction=offset-this.clockOffset;
        if(Math.abs(correction)>100){
          this.clockOffset=offset;
          this.onEvent({stage:"clock-reanchor",correctionMs:correction,rttMs:rtt});
        }
      }
    }
    return this.health;
  }
  async close(){
    this.closing=true;
    if(this.retryTimer){this.clearTimer(this.retryTimer);this.retryTimer=null;}
    this.rejectReady?.(new Error("Native audio closed"));
    if(this.child&&!this.failed)await this.request("close").catch(()=>{});
    if(this.child){this.child.stdin.end();this.child=null;}
    // Delete only this instance's uniquely allocated temporary asset directory.
    if(this.retiring)await this.retiring.catch(()=>{});
    if(this.directory && path.dirname(this.directory)===path.resolve(os.tmpdir()) && path.basename(this.directory).startsWith("fdv-native-audio-")){
      try{if(fs.rmSync)fs.rmSync(this.directory,{recursive:true,force:true});else fs.rmdirSync(this.directory,{recursive:true});}catch{}
    }
  }
}
module.exports={NativeAudio,syntheticWave};
