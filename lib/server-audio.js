"use strict";

const crypto=require("crypto");
const {signalsBetween,localSoundAllowed}=require("./server-audio-plan");
const AUDIO_ANCHOR_TOLERANCE_MS=10;
const keepAwake=require("./speaker-keep-awake");

// One native output per server host, with explicit prepare -> browser mute ->
// stream activation. Claims are ephemeral and never replicated/restored.
function createServerAudio({player,context:readContext,notify=()=>{},setTimer=setInterval,clearTimer=clearInterval}) {
  let audioAnchor=null,audioInstance="";
  function context(){
    const c=readContext();
    // A future calendar target is reprojected on every server-clock sample.
    // Separate wall/performance reads vary by sub-ms without a new start.
    // Keep changes within10ms of the accepted audio anchor stable, including
    // cue keys and the prepare guard. Do not accumulate stepwise drift;
    // otherwise each sample resets PCM and can erase/cut the pending MINUTE.
    // This never changes the server timer clock or a browser's correction.
    if(c.state.running && Number.isFinite(c.startedAt) && c.startedAt>0){
      if(c.instanceId===audioInstance && audioAnchor!==null && Math.abs(c.startedAt-audioAnchor)<=AUDIO_ANCHOR_TOLERANCE_MS){
        return c.startedAt===audioAnchor?c:{...c,startedAt:audioAnchor};
      }
      audioAnchor=c.startedAt;
    }else audioAnchor=null;
    audioInstance=c.instanceId;
    return c;
  }
  const reservations=new Map(),claims=new Map();
  let generation=0,signature="",ownerId="",floor=0,submitted=new Map(),lastCues=[],busy=false,again=false,closed=false;
  let keepaliveAt=0,lastQueue="",lastFlags="",timer=null;
  let recentStart=false,priorRunAnchor=0;
  const records=[],preview=[];
  const quietPlanner=keepAwake.create();let quietCues=[];
  function allowed(id,forced=false){const c=context();return !c.fenced && !c.legacyClients?.has(id) && !c.oldClients?.has(id)
    && localSoundAllowed(c.clients.get(id),c.state,c.clients,forced);}
  // This preference only gates native output. Keep browser sound permission
  // independent so an opted-out browser can resume after native Stop is ACKed.
  function nativeAllowed(id,forced=false){return !context().serverAudioDisabledClients?.has(id) && allowed(id,forced);}
  function profile(c){return c.profiles.find(p=>p.id===c.state.soundProfile)||c.profiles[0]||{sources:{}};}
  function event(claim,value){try{claim.send({...value,serverInstanceId:context().instanceId});}catch{}}
  function status(id){return {version:1,available:player.supported,local:Boolean(context().clients.get(id)?.computerKey==="server-host"),browserAllowed:allowed(id),
    enabled:!context().serverAudioDisabledClients?.has(id),
    active:Boolean(claims.has(id) && !claims.get(id).revoked),ownerClientId:ownerId,backend:player.backend||"windows-pcm",generation};}
  function drop(id){const claim=claims.get(id);if(!claim)return Promise.resolve();
    if(claim.revoked)return claim.stopped;
    claim.revoked=true;
    claim.stopped=(id===ownerId?player.stop(++generation):Promise.resolve()).catch(()=>{}).then(()=>{
      if(claims.get(id)===claim)claims.delete(id);
      event(claim,{active:false});try{claim.close();}catch{}
      if(!claims.size && timer){clearTimer(timer);timer=null;}
    });
    return claim.stopped;
  }
  function failure(reason){
    generation++;signature="";ownerId="";lastQueue="";submitted.clear();lastCues=[];
    for(const id of [...claims.keys()])drop(id);
    reservations.clear();notify(reason);
  }
  player.onFailure=failure;
  const previousEvent=player.onEvent;
  player.onEvent=event=>{previousEvent?.(event);if(event.stage==="watchdog"){
    signature="";lastQueue="";floor=context().now;submitted.clear();lastCues=[];reconcile();
  }records.push(event);if(records.length>64)records.shift();};
  function owner(){const c=context();return [...claims.values()].filter(claim=>!claim.revoked && nativeAllowed(claim.id,claim.forced))
    .sort((a,b)=>(a.id===c.state.primaryClientId?-1:b.id===c.state.primaryClientId?1:0)
      || (c.clients.get(a.id)?.order||0)-(c.clients.get(b.id)?.order||0))[0];}
  function configKey(c,selected){return JSON.stringify([
    selected?.id||"",c.startedAt,c.state.running||c.state.completed?c.state.completed?"completed":"running":"stopped",
    c.state.countdownOnly,c.state.activeSettings,c.state.soundProfile,c.state.language,c.state.runtimePreset,
    selected?Number(c.offsets.get(selected.id)||0):0,c.fenced
  ]);}
  async function reconcile(){
    if(closed)return;if(busy){again=true;return;}busy=true;
    try{do{
      again=false;
      for(const [token,reservation]of reservations)if(reservation.expires<Date.now())reservations.delete(token);
      for(const [id,claim]of claims)if(!nativeAllowed(id,claim.forced))drop(id);
      const c=context(),selected=owner(),next=configKey(c,selected);
      const naturalFinish=Boolean(selected && selected.id===ownerId && c.state.completed && !c.state.running
        && lastCues.some(cue=>cue.kind==="end" && cue.at>=c.now-1200));
      if(next!==signature){
        recentStart=Boolean(selected && selected.id===ownerId && c.startedAt!==priorRunAnchor && c.state.running
          && (c.state.manualStartLeadMs>0 || c.state.manualStartDisplayHold));
        priorRunAnchor=c.startedAt;
        generation++;signature=next;lastQueue="";lastFlags="";
        if(!naturalFinish){submitted.clear();lastCues=[];preview.length=0;floor=c.now-(recentStart?1500:0);await player.stop(generation);}
        else generation--; // Preserve the already-submitted natural Final END.
        ownerId=selected?.id||"";
        if(selected && !naturalFinish){
          const captured=signature;
          await player.prepare(profile(c),c.state.language,c.state.runtimePreset==="festival",c.keepAwakeConfig);
          if(captured!==configKey(context(),owner()) || closed){again=true;continue;}
        }
        for(const claim of claims.values())event(claim,{active:true,ownerClientId:ownerId});
      }
      if(!selected){quietPlanner.tick(c.now,false,c.keepAwakeConfig);quietCues=[];continue;}
      const fresh=context();
      // Mute flags remove only their own pending/current cues. Do not cut START
      // or a minute warning when the break-warning checkbox changes.
      const flags=JSON.stringify([fresh.state.muteBreakWarnings,fresh.state.festivalAnnouncements,fresh.state.speakerKeepAwake]);
      if(flags!==lastFlags){
        if(player.cancel)await player.cancel({breakWarnings:Boolean(fresh.state.muteBreakWarnings),festival:fresh.state.festivalAnnouncements===false,keepAwake:fresh.state.speakerKeepAwake!==true});
        lastFlags=flags;
      }
      const offset=Number(fresh.offsets.get(selected.id)||0);
      let cues=signalsBetween(fresh.state,fresh.startedAt,Math.max(floor,fresh.now-2000),fresh.now+5000,offset)
        .filter(cue=>cue.at>fresh.now || submitted.has(cue.key) || (recentStart && cue.key.startsWith("start:") && cue.at>=fresh.now-1500));
      if(naturalFinish || (!fresh.state.running && fresh.state.completed)){
        cues=lastCues.filter(cue=>cue.kind==="end" && cue.at>=fresh.now-1200);
      }
      for(let i=preview.length-1;i>=0;i--)if(preview[i].at<fresh.now-2000)preview.splice(i,1);
      if(!fresh.state.running || fresh.now<fresh.startedAt)cues.push(...preview.filter(cue=>cue.at>fresh.now || submitted.has(cue.key)));
      for(const cue of cues)quietPlanner.note(cue.at,cue.at+Number(player.lengths?.[cue.kind]||1000));
      const pulse=quietPlanner.tick(fresh.now,fresh.state.speakerKeepAwake===true,fresh.keepAwakeConfig);
      quietCues=quietCues.filter(cue=>fresh.state.speakerKeepAwake===true && cue.at>=fresh.now-500);
      if(pulse)quietCues.push({key:`keep-awake:${generation}:${pulse.at}`,kind:"keep-awake",at:pulse.at,grace:100,maxDurationMs:pulse.durationMs});
      cues.push(...quietCues);
      for(const cue of cues)submitted.set(cue.key,cue.at);
      for(const [key,at]of submitted)if(at<fresh.now-3000)submitted.delete(key);
      const queueKey=JSON.stringify(cues);
      if(queueKey!==lastQueue){
        await player.replace(cues,generation,fresh.now,fresh.rate||1,fresh.sampledAt);lastQueue=queueKey;lastCues=cues;
      }
      if(fresh.now-keepaliveAt>=500){await player.keepalive();keepaliveAt=fresh.now;}
    }while(again && !closed);}catch{player.fail?.("server-audio-reconcile");failure("server-audio-reconcile");}
    finally{busy=false;}
  }
  // Fence immediately on commands, even if a preceding asynchronous prepare is
  // still in flight. Its completion cannot revive the cancelled schedule.
  function changed(){
    const c=context(),selected=owner();
    if(configKey(c,selected)!==signature && !c.state.completed){generation++;player.stop(generation).catch(()=>{});}
    if(player.cancel)player.cancel({breakWarnings:Boolean(c.state.muteBreakWarnings),festival:c.state.festivalAnnouncements===false,keepAwake:c.state.speakerKeepAwake!==true}).catch(()=>{});
    reconcile();
  }
  async function prepare(id,{wanted,forced=false}={}){
    if(!wanted || !nativeAllowed(id,forced) || !player.supported)return {...status(id),available:false};
    const c=context();try{await player.prepare(profile(c),c.state.language,c.state.runtimePreset==="festival",c.keepAwakeConfig);}
    catch{player.fail?.("native-profile-unavailable");return {...status(id),available:false};}
    if(!nativeAllowed(id,forced)||closed)return {...status(id),available:false};
    for(const [token,value]of reservations)if(value.id===id)reservations.delete(token);
    if(reservations.size>=100)return {...status(id),available:false};
    const token=crypto.randomBytes(24).toString("hex");
    reservations.set(token,{id,forced,expires:Date.now()+15000});
    return {...status(id),available:true,token,serverInstanceId:c.instanceId};
  }
  async function activate(id,token,send,close){
    const reservation=reservations.get(token);
    if(!reservation || reservation.id!==id || reservation.expires<Date.now() || !nativeAllowed(id,reservation.forced))return false;
    reservations.delete(token);await drop(id);
    const claim={id,forced:reservation.forced,token,send,close};claims.set(id,claim);
    if(!timer){timer=setTimer(reconcile,100);timer?.unref?.();}
    await reconcile();
    if(!claims.has(id))return false;
    event(claim,{active:true,ownerClientId:ownerId});return true;
  }
  async function release(id,token){
    const reservation=reservations.get(token);if(reservation?.id===id)reservations.delete(token);
    const claim=claims.get(id);
    if(claim && claim.token===token){const owned=id===ownerId;await drop(id);if(owned){signature="";lastQueue="";}await reconcile();}
    return status(id);
  }
  function disconnected(id,token){const claim=claims.get(id);if(claim?.token===token){drop(id);changed();}}
  async function close(){closed=true;if(timer)clearTimer(timer);for(const id of [...claims.keys()])drop(id);reservations.clear();await player.close();}
  function audioTest(command){
    const c=context(),selected=owner();if(!selected || (c.state.running && c.now>=c.startedAt))return;
    if(!command.everywhere && command.targetClientId!==selected.id)return;
    const offset=command.previewTargetClientId===selected.id && Number.isFinite(command.previewAudioOffset)
      ? command.previewAudioOffset : Number(c.offsets.get(selected.id)||0);
    const base=Number(command.timerTime)+offset;
    for(const second of command.kind==="warn"?[0,1,2,3,4]:[0]){
      preview.push({key:`test:${command.id}:${second}`,kind:command.kind,at:base+second*1000,
        grace:command.kind==="warn"?300:2000,maxDurationMs:command.kind==="warn"?960:null});
    }
    lastQueue="";reconcile();
  }
  return {prepare,activate,release,disconnected,status,changed,reconcile,close,audioTest,
    snapshot:()=>({ownerClientId:ownerId,generation,clients:claims.size,output:player.health||null,events:records.slice(),queued:lastCues.map(cue=>({...cue}))})};
}
module.exports={createServerAudio};
