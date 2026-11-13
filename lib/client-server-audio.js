(function(root,factory){
  if(typeof module==="object" && module.exports)module.exports=factory();
  else root.FDVServerAudio=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";
  function create(deps){
    var policy={wanted:false,available:false,instance:""},epoch=0,token="",leaseInstance="",leaseEndpoint="",stream=null,muted=false,pending=false,closed=false,failedInstance="",releasing=null;
    var retryTimer=null,retryCount=0,healthySince=null,lastHealthyAt=null;
    var preferenceKey="",preferenceTask=Promise.resolve();
    var failedPreferenceKey="",preferenceRetryAt=0;
    var failedOutputRevision=null;
    var setRetryTimer=deps.setTimer||setTimeout,clearRetryTimer=deps.clearTimer||clearTimeout,now=deps.now||function(){return Date.now();};
    function cancelRetry(){if(retryTimer){clearRetryTimer(retryTimer);retryTimer=null;}}
    function retry(instance){
      if(closed || instance!==policy.instance || !policy.wanted || !policy.available || retryTimer || retryCount>=3 || pending || stream || token || releasing)return;
      retryTimer=setRetryTimer(function(){
        retryTimer=null;
        if(closed || instance!==policy.instance || !policy.wanted || !policy.available)return;
        retryCount++;failedInstance="";report("server-audio-retry");update(policy);
      },[1000,3000,10000][retryCount]);
    }
    function failed(instance){
      failedOutputRevision=policy.outputRevision;
      failedInstance=instance;healthySince=lastHealthyAt=null;
      var reason=policy.serverPreferred===false?"manual":"failure";
      var stopped=(token||muted)?stop(true,reason):Promise.resolve(true);
      stopped.then(function(ok){if(ok && reason!=="manual")retry(instance);}).catch(function(){});
    }
    function suppressed(){return muted;}
    function report(stage,details){if(deps.record)deps.record(stage,Object.assign({suppressed:muted},details||{}));}
    function closeStream(){if(stream){stream.close();stream=null;}}
    async function releaseToken(value,instance,endpoint){
      if(!value)return true;
      try{var result=await deps.post({op:"release",token:value,serverInstanceId:instance,detach:true},endpoint);
        return Boolean(result.serverInstanceId) && (result.serverInstanceId!==instance || result.active===false);
      }catch{
        // Observer cleanup can fail independently of autonomous output. The
        // native helper still stops on parent hang/EOF; fallback does not wait.
        await new Promise(function(resolve){setTimeout(resolve,2500);});return true;
      }
    }
    function stop(restore,reason){
      reason=reason||(policy.serverPreferred===false?"manual":"failure");
      closeStream();
      if(!releasing){
        var value=token,instance=leaseInstance,endpoint=leaseEndpoint,stoppedEpoch=epoch;
        releasing=releaseToken(value,instance,endpoint).then(function(confirmed){
          if(confirmed && token===value)token="";
          return confirmed;
        }).finally(function(){releasing=null;if(stoppedEpoch!==epoch && !closed)update(policy);});
      }
      // Availability wins over exclusive output: do not wait for a hung
      // release or state request. Brief overlap is preferable to a lost cue.
      if(muted){
        muted=false;
        if(restore && !closed){
          deps.resumeLocal({reason:reason,recoverRecent:reason==="failure"});
          report("server-audio-browser-return",{reason:reason,recoverRecent:reason==="failure"});
          var refresh=deps.refreshState||deps.beforeResume;
          if(refresh)Promise.resolve().then(function(){return refresh();}).catch(function(){report("server-audio-refresh-failed");});
        }
      }
      return releasing;
    }
    function update(next){
      // The primary's own sound checkbox is a local preference, not shared
      // globalSound. Send it explicitly; telemetry and stream loss cannot mute
      // the independently selected server output. Serialize rapid toggles.
      if(typeof next.primarySoundEnabled==="boolean"){
        var key=JSON.stringify([next.instance,next.endpoint,next.primarySoundEnabled]);
        if(key!==preferenceKey && (key!==failedPreferenceKey || now()>=preferenceRetryAt)){
          preferenceKey=key;
          preferenceTask=preferenceTask.catch(function(){}).then(function(){
            if(preferenceKey!==key)return;
            return deps.post({op:"sound",enabled:next.primarySoundEnabled,serverInstanceId:next.instance},next.endpoint);
          }).catch(function(){if(preferenceKey===key){preferenceKey="";failedPreferenceKey=key;preferenceRetryAt=now()+5000;}report("server-audio-preference-failed");});
        }
      }
      var instanceChanged=Boolean(policy.instance && policy.instance!==next.instance);
      var recovered=policy.recoveryEpoch!==next.recoveryEpoch;
      var changed=policy.wanted!==next.wanted || policy.available!==next.available || policy.instance!==next.instance || recovered;
      if(recovered||(!policy.wanted && next.wanted)||(!policy.available && next.available))failedInstance="";
      if(instanceChanged){retryCount=0;healthySince=lastHealthyAt=null;}
      if(!next.wanted || !next.available || instanceChanged || recovered)cancelRetry();
      policy=next;if(changed)epoch++;
      if(stream && healthySince!==null){
        var at=now();
        if(at-lastHealthyAt>2500 || at<lastHealthyAt)healthySince=at;
        lastHealthyAt=at;if(at-healthySince>=60000)retryCount=0;
      }
      if(closed)return;
      if((instanceChanged || recovered) && (token||muted)){stop(true).then(function(ok){if(ok)update(policy);});return;}
      if(!next.wanted || !next.available){
        if(token || muted){stop(Boolean(next.wanted));}
        return;
      }
      // A fresh state response can confirm autonomous output even when the
      // observer stream cannot reconnect. Never reuse a pre-failure sample:
      // an unreachable or failed player must still get immediate fallback.
      if(next.outputActive===true && next.outputRevision!==failedOutputRevision && !muted){
        muted=true;deps.stopLocal();report("server-audio-state-confirmed");
      }else if(next.outputActive===false && muted && !stream && !token && !pending){
        stop(true);
      }
      if(stream || token || releasing || pending || failedInstance===next.instance)return;
      pending=true;var captured=epoch,instance=next.instance,endpoint=next.endpoint;
      deps.post({op:"prepare",wanted:true,forced:Boolean(next.forced),serverInstanceId:instance},endpoint).then(async function(offer){
        if(closed || captured!==epoch || offer.serverInstanceId!==instance || !offer.available || !offer.token){
          if(offer.token)await releaseToken(offer.token,instance,endpoint);
          if(!offer.available && captured===epoch)failed(instance);
          return;
        }
        token=offer.token;leaseInstance=instance;leaseEndpoint=endpoint;
        // Native output is silent until activation. Gate new local playback;
        // the app may let already-playing/near-due cues finish to avoid a gap.
        muted=true;deps.stopLocal();report("server-audio-browser-muted");
        var ownToken=token,ownRecoveryEpoch=policy.recoveryEpoch;
        stream=deps.connect(ownToken,instance,endpoint);
        stream.addEventListener("route",function(event){
          if(ownToken!==token || closed || ownRecoveryEpoch!==policy.recoveryEpoch)return;
          var route;try{route=JSON.parse(event.data);}catch{return;}
          if(route.serverInstanceId && route.serverInstanceId!==instance)return;
          if(!route.active && route.serverPreferred===false){
            // The native stream may deliver this before the action response.
            // Preserve the authoritative manual choice even in that ordering.
            policy=Object.assign({},policy,{serverPreferred:false,available:false});epoch++;cancelRetry();
            stop(true,"manual");
          }
          else if(!route.active){failed(instance);}
          else {if(healthySince===null)healthySince=lastHealthyAt=now();report("server-audio-active");}
        });
        stream.onerror=function(){if(ownToken!==token || closed || ownRecoveryEpoch!==policy.recoveryEpoch)return;failed(instance);};
      }).catch(function(){if(captured===epoch)failed(instance);}).finally(function(){
        pending=false;
        if(captured!==epoch && !closed)update(policy);
        else if(failedInstance===instance)retry(instance);
      });
    }
    function suspend(){
      closed=true;epoch++;cancelRetry();closeStream();
      if(token){if(deps.beacon)deps.beacon({op:"release",token:token,serverInstanceId:leaseInstance,detach:true},leaseEndpoint);else releaseToken(token,leaseInstance,leaseEndpoint);}
    }
    function resume(){closed=false;failedInstance="";if(token||muted)stop(true).then(function(ok){if(ok)update(policy);});else update(policy);}
    return {update,suppressed:suppressed,suspend,resume,
      snapshot:function(){return {suppressed:muted,connecting:pending,active:Boolean(stream),instance:policy.instance,recoveryAttempt:retryCount,recoveryExhausted:retryCount>=3 && failedInstance===policy.instance};}};
  }
  return {create:create};
});
