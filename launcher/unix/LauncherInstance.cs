using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;

namespace FdvBoulderingTimer.Launcher;

// One GUI per user, like the Windows launcher. A local current-user-only pipe
// reopens a hidden first instance; no TCP listener, discovery or polling.
internal sealed class LauncherInstance : IDisposable
{
    private readonly Mutex _mutex;
    private readonly string _pipeName;
    private readonly CancellationTokenSource _stop = new();
    private readonly Task? _listener;
    internal bool IsOwner { get; }

    internal LauncherInstance(Action reopen, string? identity = null)
    {
        identity ??= FdvBoulderingTimerLauncher.LauncherLanguage.PreferencePath;
        var suffix = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..24];
        _pipeName = "fdv-timer-launcher-" + suffix;
        _mutex = new Mutex(false, _pipeName);
        try { IsOwner = _mutex.WaitOne(0); }
        catch (AbandonedMutexException) { IsOwner = true; }
        if (IsOwner) _listener = Task.Run(async () =>
        {
            while (!_stop.IsCancellationRequested)
            {
                try
                {
                    using var pipe = new NamedPipeServerStream(_pipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                        PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                    await pipe.WaitForConnectionAsync(_stop.Token);
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(_stop.Token);
                    timeout.CancelAfter(TimeSpan.FromSeconds(2));
                    var message = new byte[4];
                    await pipe.ReadExactlyAsync(message, timeout.Token);
                    if (Encoding.ASCII.GetString(message) == "show")
                    {
                        try { reopen(); }
                        catch (InvalidOperationException) { /* UI dispatcher may already be shutting down. */ }
                    }
                }
                catch (OperationCanceledException) { }
                catch (IOException) { if (!_stop.IsCancellationRequested) await Task.Delay(100, _stop.Token).ConfigureAwait(false); }
            }
        });
    }

    internal bool ReopenExisting()
    {
        try
        {
            using var pipe = new NamedPipeClientStream(".", _pipeName, PipeDirection.Out,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            pipe.Connect(2500);
            pipe.Write(Encoding.ASCII.GetBytes("show"));
            return true;
        }
        catch (Exception error) when (error is IOException or TimeoutException) { return false; }
    }

    public void Dispose()
    {
        _stop.Cancel();
        try { _listener?.GetAwaiter().GetResult(); } catch (OperationCanceledException) { }
        _stop.Dispose();
        if (IsOwner) _mutex.ReleaseMutex();
        _mutex.Dispose();
    }
}
