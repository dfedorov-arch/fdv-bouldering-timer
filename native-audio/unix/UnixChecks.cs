#if FDV_AUDIO_SELF_TEST
using System.Collections;
using System.Reflection;

namespace FDVNativeAudio.Unix;

internal static class UnixChecks
{
    private static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    public static void Run()
    {
        Check(FdvBoulderingTimer.Launcher.LauncherBuildInfo.Read("{\"config\":{\"buildNumber\":436}}") == "436", "Launcher build metadata");
        foreach (var body in new[] { "invalid", "{}", "[]", "null", "{\"config\":null}", "{\"config\":{\"buildNumber\":\"436\"}}", "{\"config\":{\"buildNumber\":-1}}" })
            Check(FdvBoulderingTimer.Launcher.LauncherBuildInfo.Read(body) == "", "Invalid launcher metadata");
        using (var stoppedDevice = new PcmDevice())
        {
            stoppedDevice.Stop(); stoppedDevice.Stop();
            Check(stoppedDevice.GetPosition() == 0 && stoppedDevice.PlaybackState == PlaybackState.Stopped, "Stopped device must be idempotent");
        }
        var json = new ProtocolJson();
        var command = json.Deserialize<Dictionary<string, object>>("{\"op\":\"replace\",\"generation\":\"7\",\"cues\":[{\"key\":\"work\",\"kind\":\"start\",\"at\":123.456,\"grace\":300},{\"key\":\"quiet\",\"kind\":\"keep-awake\",\"at\":999}]}" );
        var process = typeof(Player).GetMethod("Process", BindingFlags.NonPublic | BindingFlags.Static);
        var queue = (IList)typeof(Player).GetField("queue", BindingFlags.NonPublic | BindingFlags.Static).GetValue(null);
        process.Invoke(null, new object[] { command }); Check(queue.Count == 2, "Protocol array conversion");
        process.Invoke(null, new object[] { json.Deserialize<Dictionary<string, object>>("{\"op\":\"cancel\",\"keepAwake\":true}") });
        Check(queue.Count == 1, "Quiet-only cancellation must preserve competition cues");
        process.Invoke(null, new object[] { json.Deserialize<Dictionary<string, object>>("{\"op\":\"stop\",\"generation\":\"8\"}") });
        Check(queue.Count == 0, "Stop must clear pending cues");
        var result = json.Deserialize<Dictionary<string, object>>(json.Serialize(new { ok = true, result = new { value = 123.456 } }));
        Check((bool)result["ok"] && (double)((Dictionary<string, object>)result["result"])["value"] == 123.456, "Reply conversion");

        string directory = Path.Combine(Path.GetTempPath(), "fdv-decoder-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            string file = Path.Combine(directory, "mono.wav");
            using (var writer = new BinaryWriter(File.Create(file)))
            {
                writer.Write("RIFF"u8); writer.Write(44); writer.Write("WAVEfmt "u8); writer.Write(16);
                writer.Write((short)1); writer.Write((short)1); writer.Write(22050); writer.Write(44100); writer.Write((short)2); writer.Write((short)16);
                writer.Write("data"u8); writer.Write(8); foreach (short sample in new short[] { 0, 16384, 0, -16384 }) writer.Write(sample);
            }
            var mono = AssetDecoder.Read(file);
            Check(mono.Length == 16 && mono[0] == 0 && mono[2] == .25f && mono[4] == .5f, "Mono resampling");
            for (int i = 0; i < mono.Length; i += 2) Check(mono[i] == mono[i + 1], "Stereo duplication");
            File.WriteAllBytes(file, new byte[] { 1, 2, 3 });
            bool rejected = false; try { AssetDecoder.Read(file); } catch { rejected = true; }
            Check(rejected, "Invalid asset must fail preparation");
        }
        finally { Directory.Delete(directory, true); }

        int count = 0;
        foreach (string file in Directory.EnumerateFiles("beeps", "*", SearchOption.AllDirectories)
                     .Where(p => new[] { ".wav", ".mp3" }.Contains(Path.GetExtension(p).ToLowerInvariant())))
        {
            float[] pcm = AssetDecoder.Read(file);
            Check(pcm.Length > 0 && pcm.Length % 2 == 0 && pcm.All(float.IsFinite), "Packaged asset: " + file);
            Check(pcm.Any(v => Math.Abs(v) > .001), "Unexpected silent asset: " + file); count++;
        }
        Check(count > 0, "No packaged assets checked");
        Console.WriteLine("PASS launcher build metadata, Unix JSON protocol, selective cancellation, Stop, mono resampling and " + count + " packaged MP3/WAV assets; no audio device opened");
    }
}
#endif
