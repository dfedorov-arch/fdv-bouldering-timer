(function(root,factory){
  if(typeof module==="object" && module.exports)module.exports=factory();
  else root.FDVServerAudio=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";
  function create(deps){
    var policy={wanted:false,available:false,instance:""},epoch=0,token="",leaseInstance="",leaseEndpoint="",stream=null,muted=false,pending=false,closed=false,failedInstance="",releasing=null;
    var retryTimer=null,retryCount=0,healthySince=null,lastHealthyAt=null;
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
      failedInstance=instance;healthySince=lastHealthyAt=null;
      var stopped=(token||muted)?stop(true):Promise.resolve(true);
      stopped.then(function(ok){if(ok)retry(instance);}).catch(function(){});
    }
    function suppressed(){return muted;}
    function report(stage){if(deps.record)deps.record(stage,{suppressed:muted});}
    function closeStream(){if(stream){stream.close();stream=null;}}
    async function releaseToken(value,instance,endpoint){
      if(!value)return true;
      try{var result=await deps.post({op:"release",token:value,serverInstanceId:instance},endpoint);
        return Boolean(result.serverInstanceId) && (result.serverInstanceId!==instance || result.active===false);
      }catch{
        // The authenticated native route is on this same host. Closing its TCP
        // stream revokes it; a hung parent independently loses PCM permission
        // after2200ms. Fence fallback beyond that watchdog and its120ms buffer.
        await new Promise(function(resolve){setTimeout(resolve,2500);});return true;
      }
    }
    function stop(restore){
      if(releasing)return releasing;
      var value=token,instance=leaseInstance,endpoint=leaseEndpoint,stoppedEpoch=epoch;closeStream();
      releasing=releaseToken(value,instance,endpoint).then(async function(confirmed){
        if(confirmed){
          if(token===value)token="";
          if(restore && !closed && deps.beforeResume)await deps.beforeResume();
          if(muted){muted=false;if(!closed)deps.resumeLocal();report("server-audio-browser-return");}
        }
        return confirmed;
      }).finally(function(){releasing=null;if(stoppedEpoch!==epoch && !closed)update(policy);});
      return releasing;
    }
    function update(next){
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
      if(stream || token || releasing || pending || failedInstance===next.instance)return;
      pending=true;var captured=epoch,instance=next.instance,endpoint=next.endpoint;
      deps.post({op:"prepare",wanted:true,forced:Boolean(next.forced),serverInstanceId:instance},endpoint).then(async function(offer){
        if(closed || captured!==epoch || offer.serverInstanceId!==instance || !offer.available || !offer.token){
          if(offer.token)await releaseToken(offer.token,instance,endpoint);
          if(!offer.available && captured===epoch)failed(instance);
          return;
        }
        token=offer.token;leaseInstance=instance;leaseEndpoint=endpoint;
        // Native output is still silent until its stream is activated. Stop
        // every local submitted node before allowing that activation.
        muted=true;deps.stopLocal();report("server-audio-browser-muted");
        var ownToken=token,ownRecoveryEpoch=policy.recoveryEpoch;
        stream=deps.connect(ownToken,instance,endpoint);
        stream.addEventListener("route",function(event){
          if(ownToken!==token || closed || ownRecoveryEpoch!==policy.recoveryEpoch)return;
          var route;try{route=JSON.parse(event.data);}catch{return;}
          if(route.serverInstanceId && route.serverInstanceId!==instance)return;
          if(!route.active){failed(instance);}
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
      if(token){if(deps.beacon)deps.beacon({op:"release",token:token,serverInstanceId:leaseInstance},leaseEndpoint);else releaseToken(token,leaseInstance,leaseEndpoint);}
    }
    function resume(){closed=false;failedInstance="";if(token||muted)stop(true).then(function(ok){if(ok)update(policy);});else update(policy);}
    return {update,suppressed:suppressed,suspend,resume,
      snapshot:function(){return {suppressed:muted,connecting:pending,active:Boolean(stream),instance:policy.instance,recoveryAttempt:retryCount,recoveryExhausted:retryCount>=3 && failedInstance===policy.instance};}};
  }
  return {create:create};
});
