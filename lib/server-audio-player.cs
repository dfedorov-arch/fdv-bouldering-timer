// Shared native PCM output. Assets are decoded once; cues are mixed into
// the output sample stream before their deadlines, independently of browser JS.
using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
#if FDV_UNIX_AUDIO
using FDVNativeAudio.Unix;
using JavaScriptSerializer = FDVNativeAudio.Unix.ProtocolJson;
using WaveOutEvent = FDVNativeAudio.Unix.PcmDevice;
#else
using System.Web.Script.Serialization;
using System.Speech.Synthesis;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
#endif
using System.Globalization;

namespace FDVNativeAudio {
  public static class Player {
    const int Rate=44100,FrameBytes=4;
    const int OutputBufferMs=120,OutputBufferCount=3;
    static readonly object gate=new object(),commands=new object(),output=new object();
    static readonly Dictionary<string,float[]> assets=new Dictionary<string,float[]>();
    static readonly HashSet<string> consumed=new HashSet<string>();
    static readonly List<Cue> queue=new List<Cue>();
    static readonly List<Voice> voices=new List<Voice>();
    static readonly List<Start> starts=new List<Start>();
    static readonly Queue<object> renderEvents=new Queue<object>();
    static readonly ManualResetEvent stopped=new ManualResetEvent(true);
    static WaveOutEvent device;
    static bool alive=true,expired=false;
    static string generation="";
    static double lastInput=Now();
    static long renderedFrames=0,previousPosition=0,positionWrap=0;
    static long renderReads=0,emptyQueueReads=0;
    static double previousReadAt=0,maxReadGapMs=0,maxRenderMs=0;
    static int maxSimultaneousVoices=0;
    class Cue { public string key,kind;public double at,grace,duration; }
    class Voice { public Cue cue;public float[] data;public long frame;public int length; }
    class Start { public Cue cue;public long frame; }
    static double Now(){return Stopwatch.GetTimestamp()*1000.0/Stopwatch.Frequency;}
    static void Emit(object value){lock(output){Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush();}}
    static string Text(Dictionary<string,object> data,string key){object v;return data.TryGetValue(key,out v)?Convert.ToString(v,CultureInfo.InvariantCulture):"";}
    static double Number(Dictionary<string,object> data,string key,double fallback){double v;return double.TryParse(Text(data,key),NumberStyles.Float,CultureInfo.InvariantCulture,out v)?v:fallback;}
    static long Position(){
      long raw=device.GetPosition();
      lock(gate){if(raw<previousPosition && previousPosition-raw>2147483648L)positionWrap+=4294967296L;previousPosition=raw;return (positionWrap+raw)/FrameBytes;}
    }
    sealed class PcmOutput:IWaveProvider {
      public WaveFormat WaveFormat { get{return new WaveFormat(Rate,16,2);} }
      public int Read(byte[] buffer,int offset,int count){
        double now=Now();long played=Position();
        lock(gate){
          renderReads++;
          if(previousReadAt>0)maxReadGapMs=Math.Max(maxReadGapMs,now-previousReadAt);
          previousReadAt=now;
          // A drained queue means the driver had no reserve at this refill.
          // This is an underrun indicator, not a microphone measurement.
          if(renderedFrames>0 && played>=renderedFrames)emptyQueueReads++;
        }
        int result=Render(buffer,offset,count,now,played);
        lock(gate)maxRenderMs=Math.Max(maxRenderMs,Now()-now);
        return result;
      }
    }
    static void RenderEvent(object value){if(renderEvents.Count<64)renderEvents.Enqueue(value);}
    static int Render(byte[] buffer,int offset,int count,double now,long played){
        Array.Clear(buffer,offset,count);
        lock(gate){
          if(!alive || now-lastInput>2200)return count;
          int frames=count/FrameBytes;
          bool priorityAudio=voices.Exists(delegate(Voice v){return v.cue.kind!="keep-awake";})
            || queue.Exists(delegate(Cue c){return c.kind!="keep-awake" && c.at<=now+1000;});
          if(priorityAudio){queue.RemoveAll(delegate(Cue c){return c.kind=="keep-awake";});voices.RemoveAll(delegate(Voice v){return v.cue.kind=="keep-awake";});}
          double begin=now+(renderedFrames-played)*1000.0/Rate,end=begin+frames*1000.0/Rate;
          for(int i=queue.Count-1;i>=0;i--){
            Cue cue=queue[i];if(cue.at>=end)continue;queue.RemoveAt(i);
            if(consumed.Contains(cue.key))continue;consumed.Add(cue.key);
            float[] data;if(!assets.TryGetValue(cue.kind,out data))continue;
            if(begin-cue.at>cue.grace){RenderEvent(new{stage="expired",key=cue.key,lateness=begin-cue.at});continue;}
            long start=renderedFrames+Math.Max(0,(long)Math.Round((cue.at-begin)*Rate/1000));
            int length=data.Length/2;
            if(cue.duration>0)length=Math.Min(length,(int)(cue.duration*Rate/1000));
            voices.Add(new Voice{cue=cue,data=data,frame=start,length=length});
            starts.Add(new Start{cue=cue,frame=start});
            RenderEvent(new{stage="queued",key=cue.key,estimatedStartErrorMs=begin+(start-renderedFrames)*1000.0/Rate-cue.at});
          }
          for(int frame=0;frame<frames;frame++){
            float left=0,right=0;long at=renderedFrames+frame;int activeVoices=0;
            foreach(Voice voice in voices){
              long source=at-voice.frame;if(source<0 || source>=voice.length)continue;
              activeVoices++;
              float volume=voice.cue.kind=="warn"?.82f:1;
              // Match the browser's short fade when a long warning is clipped.
              if(voice.length<voice.data.Length/2 && source>voice.length-441)volume*=(voice.length-source)/441f;
              left+=voice.data[(int)source*2]*volume;right+=voice.data[(int)source*2+1]*volume;
            }
            maxSimultaneousVoices=Math.Max(maxSimultaneousVoices,activeVoices);
            short l=(short)(Math.Max(-1,Math.Min(1,left))*32767),r=(short)(Math.Max(-1,Math.Min(1,right))*32767);
            int index=offset+frame*4;buffer[index]=(byte)l;buffer[index+1]=(byte)(l>>8);buffer[index+2]=(byte)r;buffer[index+3]=(byte)(r>>8);
          }
          renderedFrames+=frames;
          voices.RemoveAll(delegate(Voice voice){return voice.frame+voice.length<renderedFrames;});
        }
        return count;
    }
    static void Stop(){
      if(device!=null){device.Stop();if(!stopped.WaitOne(1500))throw new InvalidOperationException("PCM output did not stop");}
      lock(gate){queue.Clear();voices.Clear();starts.Clear();renderedFrames=0;previousPosition=0;positionWrap=0;previousReadAt=0;}
    }
    static bool Cancelled(Cue cue,bool breakWarnings,bool festival){return (breakWarnings && cue.key.IndexOf(":break:warn:",StringComparison.Ordinal)>=0)||(festival && cue.kind.StartsWith("festival",StringComparison.Ordinal));}
    static float[] Decode(string file){
#if FDV_UNIX_AUDIO
      return AssetDecoder.Read(file);
#else
      using(AudioFileReader reader=new AudioFileReader(file)){
        ISampleProvider source=reader;
        if(source.WaveFormat.Channels==1)source=new MonoToStereoSampleProvider(source);
        if(source.WaveFormat.Channels!=2)throw new InvalidOperationException("Unsupported audio channel count");
        if(source.WaveFormat.SampleRate!=Rate)source=new WdlResamplingSampleProvider(source,Rate);
        List<float> samples=new List<float>();float[] block=new float[8192];int read;
        while((read=source.Read(block,0,block.Length))>0){for(int i=0;i<read;i++)samples.Add(block[i]);if(samples.Count>Rate*2*120)throw new InvalidOperationException("Native cue exceeds120s");}
        return samples.ToArray();
      }
#endif
    }
    static object Load(Dictionary<string,object> data){
      Stop();lock(gate){assets.Clear();consumed.Clear();}
      Dictionary<string,object> sources=(Dictionary<string,object>)data["sources"];
      Dictionary<string,object> speech=data.ContainsKey("speech")?(Dictionary<string,object>)data["speech"]:new Dictionary<string,object>();
      Dictionary<string,double> lengths=new Dictionary<string,double>();
      foreach(KeyValuePair<string,object> entry in sources){
        string file=Convert.ToString(entry.Value);bool temporary=false;
        try{
          if(String.IsNullOrEmpty(file) && speech.ContainsKey(entry.Key)){
            file=Path.Combine(Path.GetTempPath(),"fdv-native-speech-"+Guid.NewGuid().ToString("N")+".wav");temporary=true;
#if FDV_UNIX_AUDIO
            UnixSpeech.Synthesize(Convert.ToString(speech[entry.Key]),Text(data,"language"),file);
#else
            using(SpeechSynthesizer voice=new SpeechSynthesizer()){
              try{voice.SelectVoiceByHints(VoiceGender.Female,VoiceAge.NotSet,0,new CultureInfo(Text(data,"language")=="en"?"en-US":"ru-RU"));}catch{}
              voice.Rate=-1;voice.SetOutputToWaveFile(file);voice.Speak(Convert.ToString(speech[entry.Key]));
            }
#endif
          }
          float[] samples=Decode(file);lock(gate){assets.Add(entry.Key,samples);}lengths.Add(entry.Key,samples.Length*500.0/Rate);
        }finally{if(temporary)try{File.Delete(file);}catch{}}
      }
      if(device==null){
        // Three40ms blocks tolerate a delayed refill without emptying output.
        // Cue placement still accounts for queued frames and the playhead;
        // increasing reserve does not shift canonical targets or user offsets.
        device=new WaveOutEvent();device.DesiredLatency=OutputBufferMs;device.NumberOfBuffers=OutputBufferCount;
        device.PlaybackStopped+=delegate(object sender,StoppedEventArgs args){stopped.Set();if(args.Exception!=null)Emit(new{stage="fatal",error=args.Exception.Message});};
        device.Init(new PcmOutput());
        // Prime the device with silence before the browser relinquishes audio.
        // An open decoder alone does not mean the Windows output clock runs.
        stopped.Reset();device.Play();double deadline=Now()+5000;
        while(Position()<Rate/10 && Now()<deadline)Thread.Sleep(10);
        if(Position()<Rate/10)throw new InvalidOperationException("Native output clock did not start");
      }
      return lengths;
    }
    static void Poll(){
      List<object> reports=new List<object>();
      while(alive){
        try{reports.Clear();lock(commands){
          double now=Now();
          if(now-lastInput>2200 && !expired){Stop();expired=true;Emit(new{stage="watchdog"});}
          if(device!=null && device.PlaybackState==PlaybackState.Playing){
            long played=Position();lock(gate){for(int i=starts.Count-1;i>=0;i--){Start start=starts[i];if(played<start.frame)continue;
              starts.RemoveAt(i);RenderEvent(new{stage="played",key=start.cue.key,kind=start.cue.kind,lateness=now-(played-start.frame)*1000.0/Rate-start.cue.at});
            }}
          }
          lock(gate){while(renderEvents.Count>0)reports.Add(renderEvents.Dequeue());}
        }
        // JSON/pipe I/O must never hold the PCM mixer lock or run on its
        // refill thread: a slow reader must not cause audible buffer gaps.
        foreach(object report in reports)Emit(report);
        }catch(Exception error){Emit(new{stage="fatal",error=error.Message});alive=false;}
        Thread.Sleep(10);
      }
    }
    static object Process(Dictionary<string,object> data){
      string op=Text(data,"op");
      if(op=="ping")return Now();
      if(op=="status"){long position=device==null?0:Position();lock(gate)return new{now=Now(),queued=queue.Count,next=queue.Count>0?queue[0].at:0,played=consumed.Count,renderedFrames,position,playback=device==null?"none":device.PlaybackState.ToString(),bufferMs=OutputBufferMs,bufferCount=OutputBufferCount,renderReads,emptyQueueReads,maxReadGapMs,maxRenderMs,maxSimultaneousVoices};}
      if(op=="load")return Load(data);
      if(op=="stop"){Stop();generation=Text(data,"generation");lock(gate)consumed.Clear();return null;}
      if(op=="cancel"){
        bool breakWarnings=Text(data,"breakWarnings")=="True",festival=Text(data,"festival")=="True";
        bool keepAwake=Text(data,"keepAwake")=="True";
        lock(gate){queue.RemoveAll(delegate(Cue cue){return (keepAwake && cue.kind=="keep-awake")||Cancelled(cue,breakWarnings,festival);});voices.RemoveAll(delegate(Voice voice){return (keepAwake && voice.cue.kind=="keep-awake")||Cancelled(voice.cue,breakWarnings,festival);});}
        // At most the already submitted120ms hardware buffer can remain; an
        // ordinary Stop/route release resets that buffer before acknowledging.
        return null;
      }
      if(op=="replace"){
        string next=Text(data,"generation");if(generation!=next){Stop();generation=next;lock(gate)consumed.Clear();}
        lock(gate){queue.Clear();foreach(object item in (IEnumerable)data["cues"]){
          Dictionary<string,object> cue=(Dictionary<string,object>)item;
          queue.Add(new Cue{key=Text(cue,"key"),kind=Text(cue,"kind"),at=Number(cue,"at",0),grace=Number(cue,"grace",300),duration=Number(cue,"maxDurationMs",0)});
        }}
        if(device!=null && device.PlaybackState!=PlaybackState.Playing){stopped.Reset();device.Play();}
        return null;
      }
      if(op=="close"){Stop();alive=false;return null;}
      if(op=="keepalive"){lock(gate)return new{bufferMs=OutputBufferMs,bufferCount=OutputBufferCount,renderReads,emptyQueueReads,maxReadGapMs,maxRenderMs,maxSimultaneousVoices};}
      throw new InvalidOperationException("Unknown player operation");
    }
    public static void Run(){
      Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
      SynchronizationContext.SetSynchronizationContext(null);
      int workerCount,completionCount;ThreadPool.GetMinThreads(out workerCount,out completionCount);ThreadPool.SetMinThreads(Math.Max(4,workerCount),Math.Max(4,completionCount));
      Thread worker=new Thread(Poll);worker.IsBackground=true;worker.Start();Emit(new{stage="ready"});
      try{string line;
        while(alive && (line=Console.ReadLine())!=null){
          if(line.Length>131072)break;Dictionary<string,object> data=null;
          try{data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(line);
            lock(commands){lastInput=Now();expired=false;object result=Process(data);Emit(new{id=Text(data,"id"),ok=true,result=result});}
          }catch(Exception error){try{Stop();}catch{}Emit(new{id=data==null?"":Text(data,"id"),ok=false,error=error.Message});}
        }
      }finally{alive=false;worker.Join(2000);Stop();if(device!=null)device.Dispose();}
    }
  }
}
