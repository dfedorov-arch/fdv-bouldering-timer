"use strict";

// This module consumes the authoritative timer coordinate, never browser time.
// Keep targets/grace equivalent to the Modern scheduler. No past cue is replayed
// when a local browser joins or the native route recovers.
const GRACE = Object.freeze({ warn:300, minute:2000, start:1500, end:1200, festival:2000 });
const FESTIVAL = [
  [3600,"festival60","Остался один час","One hour remaining"],
  [1800,"festival30","Осталось 30 минут","30 minutes remaining"],
  [600,"festival10","Осталось 10 минут","10 minutes remaining"],
  [300,"festival5","Осталось 5 минут","5 minutes remaining"]
];

function signalsBetween(state, startedAt, from, to, offset = 0) {
  if (!state.running || !Number.isFinite(startedAt) || startedAt<=0 || to<=from) return [];
  const cues=[], settings=state.activeSettings || {};
  const rotation=Number(settings.rotationSeconds)||0, rest=Number(settings.breakSeconds)||0;
  const span=rotation+rest;
  if(rotation<=0 || span<=0) return cues;
  const add=(key,kind,target,grace=GRACE[kind]||GRACE.festival,maxDurationMs=null)=>{
    const at=target+offset;
    if(at>from && at<=to) cues.push({key,kind,at,grace,maxDurationMs});
  };
  if(state.countdownOnly || startedAt>from-offset) {
    add(`pendingStart:minute:${startedAt}`,"minute",startedAt-60000);
  }
  if(state.countdownOnly) return cues;
  add(`start:${startedAt}`,"start",startedAt);
  const first=Math.max(0,Math.floor((from-offset-startedAt)/1000/span)-1);
  const last=settings.oneShot?0:Math.max(0,Math.floor((to-offset-startedAt)/1000/span)+1);
  for(let cycle=first;cycle<=last && (!settings.oneShot || cycle===0);cycle++) {
    const start=startedAt+cycle*span*1000;
    const phases=[{type:"rotation",start,end:start+rotation*1000,duration:rotation}];
    if(rest>0) phases.push({type:"break",start:start+rotation*1000,end:start+span*1000,duration:rest});
    for(const phase of phases) {
      const key=`${cycle+1}:${phase.type}`;
      if(phase.duration>60) add(`${key}:minute:${phase.end}`,"minute",phase.end-60000);
      if(!(phase.type==="break" && state.muteBreakWarnings)) {
        for(let second=5;second>=1;second--) {
          const target=phase.end-second*1000;
          // A short phase must not borrow warnings from the preceding phase.
          if(target>phase.start) add(`${key}:warn:${second}:${phase.end}`,"warn",target,GRACE.warn,960);
        }
      }
      const final=settings.oneShot && phase.end>=startedAt+span*1000;
      const kind=final || (phase.type==="rotation" && rest>0)?"end":"start";
      add(`boundary:${key}:${phase.end}`,kind,phase.end,1200);
      if(state.runtimePreset==="festival" && state.festivalAnnouncements!==false && phase.type==="rotation") {
        for(const [seconds,kind] of FESTIVAL) if(phase.duration>seconds) {
          add(`${key}:${kind}:${phase.end}`,kind,phase.end-seconds*1000,GRACE.festival);
        }
      }
    }
  }
  return cues.sort((a,b)=>a.at-b.at || a.key.localeCompare(b.key));
}

function localSoundAllowed(client, state, clients, forced = false) {
  if(!client || client.legacyViewer || client.oldBrowser || client.computerKey!=="server-host") return false;
  if(forced) return true;
  if(state.primaryClientId===client.id) return true; // Own checkbox is carried by the native claim.
  const primary=clients.get(state.primaryClientId);
  if(primary && primary.computerKey===client.computerKey) return false;
  return state.primaryClientId ? Boolean(state.instancesSound) : Boolean(state.globalSound);
}

module.exports={signalsBetween,localSoundAllowed,GRACE,FESTIVAL};
