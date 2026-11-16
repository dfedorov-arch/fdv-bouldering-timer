using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace FdvBoulderingTimerLauncher
{
    // CLR2-compatible ownership fence shared by all desktop launchers.
    internal sealed class LauncherOperation
    {
        private readonly object _gate = new object();
        private readonly Stopwatch _clock = Stopwatch.StartNew();
        private readonly int _timeout;
        private volatile bool _cancelled, _completed;
        private Process _pending;
        private bool _started;
        internal LauncherOperation(int timeout) { _timeout = timeout; }
        internal bool Expired { get { return !_completed && _clock.ElapsedMilliseconds >= _timeout; } }
        internal bool Cancelled { get { return _cancelled || Expired; } }
        internal void Check() { if (Cancelled) throw new TimeoutException("Server startup preparation was cancelled or timed out."); }
        internal bool Start(Process process)
        {
            lock (_gate)
            {
                if (Cancelled) { process.Dispose(); return false; }
                _pending = process;
            }
            try { process.Start(); }
            catch { Cancel(); process.Dispose(); throw; }
            lock (_gate) { _started = true; }
            if (Cancelled) { Cancel(); return false; }
            return true;
        }
        internal Process Take()
        {
            lock (_gate)
            {
                if (!Cancelled && _started && _pending != null)
                {
                    var process = _pending; _pending = null; _completed = true;
                    return process;
                }
            }
            Cancel(); return null;
        }
        internal void Cancel()
        {
            _cancelled = true;
            Process process = null;
            lock (_gate) { if (_started) { process = _pending; _pending = null; } }
            LauncherProcess.SignalStop(process);
            LauncherProcess.ReleaseLater(process);
        }
    }

    internal static class LauncherProcess
    {
        private sealed class Drain
        {
            internal volatile bool Done;
            internal bool Truncated;
            internal readonly StringBuilder Text = new StringBuilder();
            internal Drain(StreamReader reader)
            {
                var thread = new Thread(delegate()
                {
                    try
                    {
                        var buffer = new char[1024]; int count;
                        while ((count = reader.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            // Drain everything, retain only bounded diagnostic/PID output.
                            if (Text.Length + count > 16384) Truncated = true;
                            if (Text.Length < 16384) Text.Append(buffer, 0, Math.Min(count, 16384 - Text.Length));
                        }
                    }
                    catch (IOException) { }
                    catch (ObjectDisposedException) { }
                    finally { Done = true; }
                });
                thread.IsBackground = true; thread.Start();
            }
        }

        // Must be called on a worker. Timeout includes process exit AND both pipes.
        // A timed-out/failed command can never supply a partial PID list.
        internal static string[] RunLines(ProcessStartInfo start, int timeoutMs, LauncherOperation owner)
        {
            var clock = Stopwatch.StartNew();
            var process = new Process(); process.StartInfo = start;
            start.UseShellExecute = false; start.CreateNoWindow = true;
            start.RedirectStandardOutput = true; start.RedirectStandardError = true;
            try
            {
                if (owner != null) owner.Check();
                process.Start();
                var output = new Drain(process.StandardOutput);
                var errors = new Drain(process.StandardError);
                while (true)
                {
                    if ((owner != null && owner.Cancelled) || clock.ElapsedMilliseconds >= timeoutMs)
                        throw new TimeoutException("Launcher command timed out: " + start.FileName);
                    if (process.HasExited && output.Done && errors.Done)
                    {
                        if (output.Truncated) throw new InvalidDataException("Launcher command output is too large.");
                        return process.ExitCode == 0
                            ? output.Text.ToString().Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                            : new string[0];
                    }
                    Thread.Sleep(10);
                }
            }
            finally { SignalStop(process); ReleaseLater(process); }
        }

        // Only explicitly owned Process objects are passed here; no port scans.
        // Signal promptly before UI shutdown; waiting/disposal stays off the UI.
        internal static void SignalStop(Process process)
        {
            if (process == null) return;
            try { process.EnableRaisingEvents = false; if (!process.HasExited) process.Kill(); }
            catch { }
        }
        internal static void Release(Process process)
        {
            if (process == null) return;
            try { process.WaitForExit(3000); } catch { }
            finally
            {
                try { process.StandardOutput.Close(); } catch { }
                try { process.StandardError.Close(); } catch { }
                try { process.Dispose(); } catch { }
            }
        }
        internal static void ReleaseLater(Process process)
        {
            if (process == null) return;
            ThreadPool.QueueUserWorkItem(delegate { Release(process); });
        }
    }
}
