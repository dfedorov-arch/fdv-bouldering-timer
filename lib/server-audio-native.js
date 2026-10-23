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
  constructor(root,{platform=process.platform,arch=process.arch,onFailure=()=>{},onEvent=()=>{}}={}) {
    this.root=root;this.platform=platform;this.arch=arch;this.onFailure=onFailure;this.onEvent=onEvent;
    this.child=null;this.pending=new Map();this.serial=0;this.clockOffset=0;this.failed=false;this.profile="";this.directory=null;this.health=null;
  }
  get executable(){return path.join(this.root,"lib/native-audio",`${this.platform}-${this.arch}`,"fdv-audio-player");}
  get backend(){return this.platform==="darwin"?"coreaudio-pcm":this.platform==="linux"?"alsa-pcm":"windows-pcm";}
  get supported(){return !this.failed && (this.platform==="win32"
    ? fs.existsSync(path.join(this.root,"lib/server-audio-player.ps1")) && fs.existsSync(path.join(this.root,"lib/vendor/NAudio.dll"))
    : ["darwin","linux"].includes(this.platform) && ["x64","arm64"].includes(this.arch) && fs.existsSync(this.executable));}
  request(op,data={},timeout=4000){
    if(!this.child || this.failed)return Promise.reject(new Error("Native audio is unavailable"));
    const id=String(++this.serial);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("Native audio command timeout"));this.fail("player-timeout");},timeout);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,op,...data})+"\n",error=>{if(error)this.fail("player-pipe");});
    });
  }
  fail(reason){
    if(this.closing)return;
    if(this.failed)return;this.failed=true;
    if(this.child){this.child.stdin.destroy();this.child.kill();this.child=null;}
    for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error(reason));}this.pending.clear();
    this.onFailure(reason);
  }
  async start(){
    if(this.started)return this.started;
    if(!this.supported)throw new Error("No native audio backend on this server");
    this.started=(async()=>{
      const executable=this.platform==="win32"?path.join(process.env.SystemRoot||"C:\\Windows","System32/WindowsPowerShell/v1.0/powershell.exe"):this.executable;
      const args=this.platform==="win32"?["-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",path.join(this.root,"lib/server-audio-player.ps1")]:[];
      const child=spawn(executable,args,
        {stdio:["pipe","pipe","pipe"],windowsHide:true});
      this.child=child;
      const ready=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{reject(new Error("Native audio startup timeout"));this.fail("player-startup-timeout");},15000);
        this.resolveReady=()=>{clearTimeout(timer);resolve();};
        child.once("error",error=>{clearTimeout(timer);reject(error);this.fail("player-startup");});
        child.once("exit",()=>{clearTimeout(timer);reject(new Error("Native audio process exited"));this.fail("player-exited");});
      });
      const lines=readline.createInterface({input:child.stdout});
      lines.on("line",line=>{
        if(line.length>131072){this.fail("player-protocol");return;}
        let message;try{message=JSON.parse(line.replace(/^\uFEFF/,""));}catch{return;}
        if(message.stage==="ready"){this.resolveReady();return;}
        if(message.stage==="fatal"){this.onEvent(message);this.fail("player-playback");return;}
        if(message.stage){this.onEvent(message);return;}
        const item=this.pending.get(String(message.id));if(!item)return;
        this.pending.delete(String(message.id));clearTimeout(item.timer);
        if(message.ok)item.resolve(message.result);else item.reject(new Error(message.error||"Native audio rejected a command"));
      });
      child.stderr.on("data",()=>{}); // Diagnostic protocol is stdout only.
      await ready;
      const samples=[];
      for(let i=0;i<5;i++){const before=performance.now();const qpc=await this.request("ping");const after=performance.now();samples.push({rtt:after-before,offset:Number(qpc)-(before+after)/2});}
      samples.sort((a,b)=>a.rtt-b.rtt);this.clockOffset=samples[0].offset;
    })();
    return this.started;
  }
  async prepare(profile,language="ru",festival=false,keepAwakeConfig){
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
  replace(cues,generation,now,rate=1,sampledAt=performance.now()){
    const nativeNow=sampledAt+this.clockOffset;
    return this.request("replace",{generation:String(generation),cues:cues.map(cue=>({...cue,at:nativeNow+(cue.at-now)/rate}))});
  }
  stop(generation){return this.child&&!this.failed?this.request("stop",{generation:String(generation)}):Promise.resolve();}
  cancel(flags){return this.child&&!this.failed?this.request("cancel",flags):Promise.resolve();}
  async keepalive(){if(this.child&&!this.failed)this.health=await this.request("keepalive");return this.health;}
  async close(){
    this.closing=true;
    if(this.child&&!this.failed)await this.request("close").catch(()=>{});
    if(this.child){this.child.stdin.end();this.child=null;}
    // Delete only this instance's uniquely allocated temporary asset directory.
    if(this.directory && path.dirname(this.directory)===path.resolve(os.tmpdir()) && path.basename(this.directory).startsWith("fdv-native-audio-")){
      try{if(fs.rmSync)fs.rmSync(this.directory,{recursive:true,force:true});else fs.rmdirSync(this.directory,{recursive:true});}catch{}
    }
  }
}
module.exports={NativeAudio,syntheticWave};
