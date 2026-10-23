(function(root,factory){
  if(typeof module==="object" && module.exports)module.exports=factory();
  else root.FDVSpeakerKeepAwake=factory();
})(typeof window!=="undefined"?window:this,function(){
  "use strict";
  function settings(value){
    value=value||{};
    function bounded(key,fallback,min,max){var n=Number(value[key]);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
    return {intervalMs:bounded("speakerKeepAwakeIntervalSeconds",180,10,600)*1000,
      gain:bounded("speakerKeepAwakeGain",0.006,0.0001,0.1),frequency:bounded("speakerKeepAwakeFrequencyHz",440,100,2000),durationMs:150};
  }
  function create(){
    var due=0,windows=[],lastNow=null;
    return {
      note:function(start,end){if(Number.isFinite(start)&&Number.isFinite(end))windows.push({start:start,end:end});},
      tick:function(now,enabled,config){
        var p=settings(config);
        if(!enabled){due=0;windows=[];lastNow=null;return null;}
        if(lastNow!==null && now<lastNow-10){due=0;windows=[];}
        lastNow=now;
        if(!due)due=now+p.intervalMs;
        windows=windows.filter(function(w){return w.end>=now-p.intervalMs;}).slice(-1000);
        windows.forEach(function(w){if(w.start<=now+1000)due=Math.max(due,w.end+p.intervalMs);});
        if(now<due)return null;
        var at=now+200;
        for(var i=0;i<windows.length;i++)if(windows[i].start<at+p.durationMs+1000 && windows[i].end>at-1000){due=windows[i].end+p.intervalMs;return null;}
        due=now+p.intervalMs;
        return {at:at,durationMs:p.durationMs,gain:p.gain,frequency:p.frequency};
      }
    };
  }
  return {settings:settings,create:create};
});
