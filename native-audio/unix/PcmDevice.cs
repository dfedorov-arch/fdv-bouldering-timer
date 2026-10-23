using System.Runtime.InteropServices;

namespace FDVNativeAudio.Unix;

public sealed class WaveFormat
{
    public readonly int SampleRate, BitsPerSample, Channels;
    public WaveFormat(int rate, int bits, int channels) { SampleRate = rate; BitsPerSample = bits; Channels = channels; }
}
public interface IWaveProvider { WaveFormat WaveFormat { get; } int Read(byte[] buffer, int offset, int count); }
public enum PlaybackState { Stopped, Playing }
public sealed class StoppedEventArgs : EventArgs { public Exception Exception { get; init; } }

// Core Audio and ALSA expose actual device progress. The shared mixer therefore
// accounts for queued frames exactly as on Windows, rather than timing writes
// to an external player whose hidden buffer could shift the competition cues.
public sealed class PcmDevice : IDisposable
{
    public int DesiredLatency { get; set; } = 120;
    public int NumberOfBuffers { get; set; } = 3;
    public event EventHandler<StoppedEventArgs> PlaybackStopped;
    public PlaybackState PlaybackState => running ? PlaybackState.Playing : PlaybackState.Stopped;
    private IWaveProvider provider;
    private IntPtr pcm, queue;
    private Thread worker;
    private volatile bool running;
    private bool timelineStarted, positionConfirmed, outputStarted;
    private long writtenFrames;
    private readonly object positionLock = new();
    private readonly List<IntPtr> buffers = new();
    private readonly Dictionary<IntPtr, byte[]> queueBytes = new();
    private QueueCallback callback;
    private IntPtr timestamp;
    private int blockBytes;

    public void Init(IWaveProvider source)
    {
        if (source.WaveFormat.SampleRate != 44100 || source.WaveFormat.BitsPerSample != 16 || source.WaveFormat.Channels != 2)
            throw new NotSupportedException("Native output requires 44100Hz stereo PCM16");
        provider = source;
        blockBytes = Math.Max(4, 44100 * (DesiredLatency / NumberOfBuffers) / 1000) * 4;
        if (OperatingSystem.IsLinux())
        {
            Check(snd_pcm_open(out pcm, "default", 0, 1), "open ALSA output"); // playback, nonblocking
            try { Check(snd_pcm_set_params(pcm, 2, 3, 2, 44100, 1, (uint)DesiredLatency * 1000), "configure ALSA output"); }
            catch { snd_pcm_close(pcm); pcm = IntPtr.Zero; throw; }
        }
        else if (OperatingSystem.IsMacOS())
        {
            var format = new StreamFormat { Rate = 44100, Format = 0x6c70636d, Flags = 4 | 8, BytesPerPacket = 4, FramesPerPacket = 1, BytesPerFrame = 4, Channels = 2, Bits = 16 };
            callback = OnQueueBuffer;
            Check(AudioQueueNewOutput(ref format, callback, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out queue), "open Core Audio output");
            try
            {
                timestamp = Marshal.AllocHGlobal(128);
                for (int i = 0; i < NumberOfBuffers; i++) { Check(AudioQueueAllocateBuffer(queue, (uint)blockBytes, out var buffer), "allocate Core Audio buffer"); buffers.Add(buffer); queueBytes.Add(buffer, new byte[blockBytes]); }
            }
            catch { Dispose(); throw; }
        }
        else throw new PlatformNotSupportedException("Unix audio requires macOS or Linux");
    }

    public void Play()
    {
        if (running) return;
        running = true;
        try
        {
            if (pcm != IntPtr.Zero)
            {
                Check(snd_pcm_prepare(pcm), "prepare ALSA output");
                outputStarted = true;
                worker = new Thread(FeedAlsa) { IsBackground = true, Name = "FDV PCM refill" }; worker.Start();
            }
            else
            {
                foreach (var buffer in buffers) FillQueueBuffer(buffer);
                Check(AudioQueueStart(queue, IntPtr.Zero), "start Core Audio output");
                timelineStarted = true;
            }
        }
        catch { running = false; throw; }
    }

    public void Stop()
    {
        running = false;
        if (pcm != IntPtr.Zero)
        {
            if (worker != null && worker != Thread.CurrentThread && !worker.Join(1000)) throw new IOException("ALSA refill did not stop");
            if (outputStarted) Check(snd_pcm_drop(pcm), "stop ALSA output");
            outputStarted = false; worker = null;
            Interlocked.Exchange(ref writtenFrames, 0);
        }
        if (queue != IntPtr.Zero) { Check(AudioQueueStop(queue, 1), "stop Core Audio output"); timelineStarted = false; positionConfirmed = false; }
        PlaybackStopped?.Invoke(this, new StoppedEventArgs());
    }

    public long GetPosition()
    {
        if (!running) return 0;
        if (pcm != IntPtr.Zero)
        {
            Check(snd_pcm_delay(pcm, out var delay), "read ALSA position");
            return Math.Max(0, Interlocked.Read(ref writtenFrames) - delay.ToInt64()) * 4;
        }
        if (queue != IntPtr.Zero)
        {
            if (!timelineStarted) return 0;
            lock (positionLock)
            {
                int result = AudioQueueGetCurrentTime(queue, IntPtr.Zero, timestamp, IntPtr.Zero);
                // Start is asynchronous. Until the first advancing timestamp,
                // the shared five-second prime deadline handles readiness.
                if (result != 0 && !positionConfirmed) return 0;
                Check(result, "read Core Audio position");
                if ((Marshal.ReadInt32(timestamp, 56) & 1) == 0)
                {
                    if (!positionConfirmed) return 0;
                    throw new IOException("Core Audio sample position is unavailable");
                }
                double frame = Marshal.PtrToStructure<double>(timestamp);
                if (!double.IsFinite(frame) || frame < 0)
                {
                    if (!positionConfirmed) return 0;
                    throw new IOException("Invalid Core Audio position");
                }
                if (frame > 0) positionConfirmed = true;
                return (long)frame * 4;
            }
        }
        return 0;
    }

    private void FeedAlsa()
    {
        try
        {
            var bytes = new byte[blockBytes];
            while (running)
            {
                provider.Read(bytes, 0, bytes.Length);
                var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
                try
                {
                    int sent = 0, frames = bytes.Length / 4;
                    while (running && sent < frames)
                    {
                        long n = snd_pcm_writei(pcm, IntPtr.Add(pinned.AddrOfPinnedObject(), sent * 4), (UIntPtr)(uint)(frames - sent)).ToInt64();
                        if (n == -11) { Thread.Sleep(2); continue; } // EAGAIN; cancellation remains bounded.
                        if (n <= 0) throw new IOException("ALSA underrun or output failure: " + n);
                        sent += checked((int)n); Interlocked.Add(ref writtenFrames, n);
                    }
                }
                finally { pinned.Free(); }
            }
        }
        catch (Exception error)
        {
            running = false;
            PlaybackStopped?.Invoke(this, new StoppedEventArgs { Exception = error });
        }
    }

    private void FillQueueBuffer(IntPtr pointer)
    {
        if (!running) return;
        var buffer = Marshal.PtrToStructure<QueueBuffer>(pointer);
        var bytes = queueBytes[pointer]; provider.Read(bytes, 0, bytes.Length);
        if (!running) return;
        Marshal.Copy(bytes, 0, buffer.Data, bytes.Length);
        buffer.Size = (uint)bytes.Length; Marshal.StructureToPtr(buffer, pointer, false);
        Check(AudioQueueEnqueueBuffer(queue, pointer, 0, IntPtr.Zero), "enqueue Core Audio buffer");
    }
    private void OnQueueBuffer(IntPtr user, IntPtr audioQueue, IntPtr buffer)
    {
        if (!running) return;
        try { FillQueueBuffer(buffer); }
        catch (Exception error) { if (running) { running = false; PlaybackStopped?.Invoke(this, new StoppedEventArgs { Exception = error }); } }
    }

    public void Dispose()
    {
        try { Stop(); }
        finally
        {
            if (pcm != IntPtr.Zero) { snd_pcm_close(pcm); pcm = IntPtr.Zero; }
            if (queue != IntPtr.Zero) { AudioQueueDispose(queue, 1); queue = IntPtr.Zero; }
            if (timestamp != IntPtr.Zero) { Marshal.FreeHGlobal(timestamp); timestamp = IntPtr.Zero; }
            buffers.Clear(); queueBytes.Clear(); GC.KeepAlive(callback);
        }
    }
    private static void Check(int result, string action) { if (result < 0 || (result != 0 && action.Contains("Core Audio"))) throw new IOException("Cannot " + action + ": " + result); }
    [StructLayout(LayoutKind.Sequential)] private struct StreamFormat { public double Rate; public uint Format, Flags, BytesPerPacket, FramesPerPacket, BytesPerFrame, Channels, Bits, Reserved; }
    [StructLayout(LayoutKind.Sequential)] private struct QueueBuffer { public uint Capacity; public IntPtr Data; public uint Size; public IntPtr User; public uint PacketCapacity; public IntPtr Packets; public uint PacketCount; }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void QueueCallback(IntPtr user, IntPtr queue, IntPtr buffer);
    private const string AudioToolbox = "/System/Library/Frameworks/AudioToolbox.framework/AudioToolbox";
    [DllImport(AudioToolbox)] private static extern int AudioQueueNewOutput(ref StreamFormat format, QueueCallback callback, IntPtr user, IntPtr runLoop, IntPtr mode, uint flags, out IntPtr queue);
    [DllImport(AudioToolbox)] private static extern int AudioQueueAllocateBuffer(IntPtr queue, uint bytes, out IntPtr buffer);
    [DllImport(AudioToolbox)] private static extern int AudioQueueEnqueueBuffer(IntPtr queue, IntPtr buffer, uint packets, IntPtr descriptions);
    [DllImport(AudioToolbox)] private static extern int AudioQueueStart(IntPtr queue, IntPtr time);
    [DllImport(AudioToolbox)] private static extern int AudioQueueStop(IntPtr queue, byte immediate);
    [DllImport(AudioToolbox)] private static extern int AudioQueueDispose(IntPtr queue, byte immediate);
    [DllImport(AudioToolbox)] private static extern int AudioQueueGetCurrentTime(IntPtr queue, IntPtr timeline, IntPtr timestamp, IntPtr discontinuity);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_open(out IntPtr pcm, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, int stream, int mode);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_set_params(IntPtr pcm, int format, int access, uint channels, uint rate, int resample, uint latency);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_prepare(IntPtr pcm);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_drop(IntPtr pcm);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_close(IntPtr pcm);
    [DllImport("libasound.so.2")] private static extern int snd_pcm_delay(IntPtr pcm, out IntPtr delay);
    [DllImport("libasound.so.2")] private static extern IntPtr snd_pcm_writei(IntPtr pcm, IntPtr samples, UIntPtr frames);
}
