const test=require('node:test'),assert=require('node:assert/strict');
const {createTimerTransitions}=require('../lib/timer-transitions'),{createTimerDomain}=require('../lib/timer-domain'),{signalsBetween}=require('../lib/server-audio-plan');
const tx=createTimerTransitions(createTimerDomain({classicRotationMinutes:5,classicBreakSeconds:15}),{manualStartAudioLeadMs:600});
for(const rest of [0,15])for(const cycle of [1,7,18])test(`Classic ${cycle}, break ${rest}: boundary start has lead and a single native cue`,()=>{
 const settings={rotationSeconds:300,breakSeconds:rest,oneShot:false},elapsed=(cycle-1)*(300+rest),s={running:false,completed:false,activePreset:'classic',runtimePreset:'classic',activeSettings:settings,draftSettings:{},elapsedBeforePause:elapsed};
 const result=tx.applyTimerAction(s,{type:'start',startMode:'manual',startAudioLead:true},{now:10000000}),r=result.state;
 assert.equal(r.manualStartLeadMs,600);assert.equal(r.manualStartElapsed,elapsed);assert.equal(r.startedAt+elapsed*1000,10000600);assert.equal(result.effects.audioWakeCommand.startedAt,10000600);
 const cues=signalsBetween(r,r.startedAt,9999999,10001000).filter(c=>c.kind==='start');assert.equal(cues.length,1);assert.equal(cues[0].at,10000600);
 const resumed=tx.applyTimerAction({...s,elapsedBeforePause:elapsed+1},{type:'start',startMode:'manual',startAudioLead:true},{now:10000000}).state;
 assert.equal(resumed.manualStartLeadMs,0);assert.equal(resumed.manualStartDisplayHold,false);
});
