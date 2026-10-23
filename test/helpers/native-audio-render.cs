using System;
using System.Collections;
using System.Reflection;
using FDVNativeAudio;

public static class NativeRenderChecks {
  static readonly BindingFlags Flags=BindingFlags.NonPublic|BindingFlags.Static;
  static FieldInfo Field(string name){return typeof(Player).GetField(name,Flags);}
  static void Check(bool value,string message){if(!value)throw new Exception(message);}
  public static void Run(){
    MethodInfo render=typeof(Player).GetMethod("Render",Flags);
    Type cueType=typeof(Player).GetNestedType("Cue",BindingFlags.NonPublic);
    foreach(string kind in new string[]{"start","warn"})foreach(int block in new int[]{882,1764}){
      typeof(Player).GetMethod("Stop",Flags).Invoke(null,null);
      ((IDictionary)Field("assets").GetValue(null)).Clear();
      Field("consumed").GetValue(null).GetType().GetMethod("Clear").Invoke(Field("consumed").GetValue(null),null);
      const int frames=17640,begin=8952,total=35280;
      float[] source=new float[frames*2];
      for(int i=0;i<frames;i++){source[i*2]=(float)(Math.Sin(i*2*Math.PI*733/44100)*.3);source[i*2+1]=(float)(Math.Sin(i*2*Math.PI*911/44100)*.2);}
      ((IDictionary)Field("assets").GetValue(null)).Add(kind,source);
      ((IDictionary)Field("assets").GetValue(null)).Add("keep-awake",source);
      IList queue=(IList)Field("queue").GetValue(null);
      for(int at=0;at<total;at+=block){
        // Repeated server replacement may submit the same key again. It must
        // never create a second voice or discontinuity in the PCM waveform.
        object cue=Activator.CreateInstance(cueType,true);
        cueType.GetField("key").SetValue(cue,"same-cue");cueType.GetField("kind").SetValue(cue,kind);
        cueType.GetField("at").SetValue(cue,203d);cueType.GetField("grace").SetValue(cue,1200d);
        queue.Add(cue);
        object quiet=Activator.CreateInstance(cueType,true);
        cueType.GetField("key").SetValue(quiet,"quiet-"+at);cueType.GetField("kind").SetValue(quiet,"keep-awake");
        cueType.GetField("at").SetValue(quiet,203d);cueType.GetField("grace").SetValue(quiet,1200d);
        queue.Add(quiet);
        byte[] bytes=new byte[block*4];
        render.Invoke(null,new object[]{bytes,0,bytes.Length,at*1000d/44100,(long)at});
        for(int frame=0;frame<block;frame++)for(int channel=0;channel<2;channel++){
          int index=at+frame-begin;
          float value=index>=0&&index<frames?source[index*2+channel]*(kind=="warn"?.82f:1):0;
          short expected=(short)(value*32767),actual=BitConverter.ToInt16(bytes,frame*4+channel*2);
          Check(expected==actual,"PCM mismatch "+kind+" frame "+(at+frame)+" channel "+channel);
        }
      }
      Check((int)Field("maxSimultaneousVoices").GetValue(null)==1,"Duplicate native voice");
    }
    Console.WriteLine("PASS exact continuous START/WARN PCM and duplicate-key suppression; no audio device opened");
  }
}
