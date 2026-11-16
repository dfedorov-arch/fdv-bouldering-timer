using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Reflection;
using FdvBoulderingTimerLauncher;

internal static class LauncherProcessChecks
{
    internal delegate bool Condition();
    internal delegate void Step();
    internal delegate object WindowFactory(string root);
    internal delegate void WindowAction(object window);
    private delegate string[][] NetworkReader();
    internal static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    internal static int Child(string[] args)
    {
        string mode = args[1];
        if (mode == "flood") { Console.Error.Write(new string('x', 300000)); Console.WriteLine("12345"); return 0; }
        if (mode == "overflow") { Console.Write(new string('7', 20000)); return 0; }
        if (mode == "fail") { Console.WriteLine("12345"); return 7; }
        File.WriteAllText(args[2], Process.GetCurrentProcess().Id.ToString());
        Console.WriteLine("12345"); Thread.Sleep(10000); return 0;
    }
    private static ProcessStartInfo ChildInfo(string executable, string mode, string path)
    {
        var start = new ProcessStartInfo(); start.FileName = executable;
        start.Arguments = "command-child " + mode + " \"" + path + "\"";
        start.UseShellExecute = false; start.CreateNoWindow = true;
        return start;
    }
    internal static bool Alive(int pid)
    {
        try { using (var process = Process.GetProcessById(pid)) return !process.HasExited; }
        catch (ArgumentException) { return false; }
    }
    internal static void WaitUntil(Condition predicate, int timeout)
    {
        var elapsed = Stopwatch.StartNew();
        while (!predicate()) { Check(elapsed.ElapsedMilliseconds < timeout, "Process check timed out"); Thread.Sleep(10); }
    }
    internal static int Run(string executable, string root)
    {
        Directory.CreateDirectory(root);
        var output = LauncherProcess.RunLines(ChildInfo(executable, "flood", "unused"), 4000, null);
        Check(output.Length == 1 && output[0] == "12345", "Large stderr must drain without deadlock");
        Check(LauncherProcess.RunLines(ChildInfo(executable, "fail", "unused"), 4000, null).Length == 0, "Failed command cannot supply partial PIDs");
        bool overflow = false;
        try { LauncherProcess.RunLines(ChildInfo(executable, "overflow", "unused"), 4000, null); }
        catch (InvalidDataException) { overflow = true; }
        Check(overflow, "Truncated output must never supply a partial PID");
        var pidFile = Path.Combine(root, "timeout.pid");
        var clock = Stopwatch.StartNew(); bool timedOut = false;
        try { LauncherProcess.RunLines(ChildInfo(executable, "slow", pidFile), 1500, null); }
        catch (TimeoutException) { timedOut = true; }
        Check(timedOut && clock.ElapsedMilliseconds < 3500, "Exit and pipe reads share the real deadline");
        if (File.Exists(pidFile)) { int pid = Int32.Parse(File.ReadAllText(pidFile)); WaitUntil(delegate { return !Alive(pid); }, 3000); }

        var cancelled = new LauncherOperation(10000);
        var pending = new Process(); pending.StartInfo = ChildInfo(executable, "owned", Path.Combine(root, "pending.pid"));
        Check(cancelled.Start(pending), "Start an owned pending child");
        int pendingPid = pending.Id; cancelled.Cancel();
        Check(cancelled.Take() == null, "Cancelled operation cannot adopt a late child");
        WaitUntil(delegate { return !Alive(pendingPid); }, 3000);

        var transferred = new LauncherOperation(10000);
        var child = new Process(); child.StartInfo = ChildInfo(executable, "owned", Path.Combine(root, "transferred.pid"));
        Check(transferred.Start(child), "Start a transferable child");
        var taken = transferred.Take(); Check(taken == child, "Transfer once to UI ownership");
        transferred.Cancel();
        Check(!child.HasExited, "Cancelling completed preparation must not stop the adopted server");
        LauncherProcess.SignalStop(child); LauncherProcess.Release(child);

        var late = new LauncherOperation(1); Thread.Sleep(5);
        var neverStarted = new Process(); neverStarted.StartInfo = ChildInfo(executable, "owned", Path.Combine(root, "never.pid"));
        Check(!late.Start(neverStarted), "Expired preparation cannot start a new process");
        Check(!File.Exists(Path.Combine(root, "never.pid")), "No late process after expiry");
        Console.WriteLine("Process deadlines, both pipes, bounded output, cancellation and ownership transfer OK");
        return 0;
    }
    internal static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop(); return port;
    }
    internal static void WriteServer(string root, string node, int port)
    {
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "params.txt"), "http_port=" + port + "\nhttps_port=65432\nportable_node_win=" + node + "\nportable_node_linux=" + node + "\nportable_node_mac=" + node + "\n");
        File.WriteAllText(Path.Combine(root, "serve-bouldering-timer.js"),
            "var fs=require('fs'),http=require('http');var p=Number(fs.readFileSync('params.txt','utf8').match(/http_port=(\\d+)/)[1]);var language='ru';" +
            "var server=http.createServer(function(req,res){function send(){res.setHeader('Content-Type','application/json');res.setHeader('X-FDV-Language',language);res.setHeader('X-FDV-Server-Instance','11111111-1111-4111-8111-111111111111');res.setHeader('X-FDV-State-Version','1');res.end(JSON.stringify({config:{buildNumber:454},language:language}));}" +
            "if(req.method==='POST'){var b='';req.on('data',function(c){b+=c;});req.on('end',function(){try{language=JSON.parse(b).language||language;}catch(e){}send();});}else send();});" +
            "server.listen(p,'127.0.0.1',function(){fs.appendFileSync('started.txt',process.pid+':'+p+'\\n');console.log('fixture ready');});");
    }
    private static object Field(object window, string name)
    { return window.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(window); }
    private static void Set(object window, string name, object value)
    { window.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(window, value); }
    private static void Hook(object window, string name, Delegate value)
    {
        var field = window.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic);
        field.SetValue(window, value == null ? null : value.Target == null
            ? Delegate.CreateDelegate(field.FieldType, value.Method)
            : Delegate.CreateDelegate(field.FieldType, value.Target, value.Method));
    }
    private static void Call(object window, string name, params object[] args)
    { window.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(window, args); }
    private static void PumpUntil(Condition condition, Step pump, int timeout)
    {
        var clock = Stopwatch.StartNew();
        while (!condition()) { Check(clock.ElapsedMilliseconds < timeout, "UI startup check timed out"); pump(); Thread.Sleep(5); }
        pump();
    }
    private static void PumpFor(Step pump, int ms)
    { var clock = Stopwatch.StartNew(); while (clock.ElapsedMilliseconds < ms) { pump(); Thread.Sleep(5); } }

    internal static int StartupUi(string root, string node, WindowFactory create, WindowAction show, WindowAction close, Step pump)
    {
        int portA = FreePort(), portB; do { portB = FreePort(); } while (portA == portB);
        var fixture = Path.Combine(root, "responsive"); WriteServer(fixture, node, portA);
        var prepGate = new ManualResetEvent(false); var prepEntered = new ManualResetEvent(false);
        var networkGate = new ManualResetEvent(false); var networkEntered = new ManualResetEvent(false);
        int cleanupCalls = 0, uiThread = Thread.CurrentThread.ManagedThreadId, prepThread = uiThread, networkThread = uiThread;
        var window = create(fixture);
        Hook(window, "_startupPreparationOverride", new Step(delegate { prepThread = Thread.CurrentThread.ManagedThreadId; prepEntered.Set(); prepGate.WaitOne(10000); }));
        Hook(window, "_portCleanupOverride", new Step(delegate { Interlocked.Increment(ref cleanupCalls); }));
        Hook(window, "_networkReadOverride", new NetworkReader(delegate
        {
            networkThread = Thread.CurrentThread.ManagedThreadId; networkEntered.Set(); networkGate.WaitOne(10000);
            return new string[][] { new string[] { "Ethernet", "10.9.8.7" } };
        }));
        try
        {
            show(window); pump(); Set(window, "_startupTimeoutMs", 350);
            var elapsed = Stopwatch.StartNew(); Call(window, "StartServer", false);
            Check(elapsed.ElapsedMilliseconds < 500, "Start must return to the UI before preparation finishes");
            PumpUntil(delegate { return prepEntered.WaitOne(0) && networkEntered.WaitOne(0); }, pump, 2000);
            elapsed.Reset(); elapsed.Start(); Call(window, "SwitchLanguage");
            Check(elapsed.ElapsedMilliseconds < 500, "Language/controls remain responsive during preparation and interface scan");
            PumpUntil(delegate { return !(bool)Field(window, "_startupInProgress"); }, pump, 2500);
            Check(((string)Field(window, "_statusEnglish")).Contains("timed out"), "Preparation reports a bounded timeout");
            Check(Field(window, "_serverProcess") == null, "Timed-out preparation does not adopt a server");
            Check(prepThread != uiThread && networkThread != uiThread, "Preparation and network enumeration both run off the UI");

            // Retry succeeds even while both abandoned preparation and network scan remain blocked.
            Hook(window, "_startupPreparationOverride", null); Set(window, "_startupTimeoutMs", 5000);
            Call(window, "StartServer", false);
            PumpUntil(delegate { return (bool)Field(window, "_ready"); }, pump, 7000);
            var first = (Process)Field(window, "_serverProcess"); int firstPid = first.Id;
            Check(!networkGate.WaitOne(0), "Server readiness does not wait for network enumeration");
            prepGate.Set(); networkGate.Set();
            PumpUntil(delegate { return !(bool)Field(window, "_networkRefreshBusy"); }, pump, 2000);
            PumpFor(pump, 200);
            Check(Object.ReferenceEquals(first, Field(window, "_serverProcess")) && (bool)Field(window, "_ready"), "Abandoned completion cannot overwrite a newer ready server");
            Check(cleanupCalls == 1, "Cancelled preparation cannot run late port cleanup");
            Check(File.ReadAllLines(Path.Combine(fixture, "started.txt")).Length == 1, "Exactly one server was started");

            WriteServer(fixture, node, portB); Call(window, "StartServer", false);
            PumpUntil(delegate { return (bool)Field(window, "_ready"); }, pump, 7000);
            var second = (Process)Field(window, "_serverProcess"); int secondPid = second.Id;
            Check(firstPid != secondPid, "Explicit restart starts a replacement process");
            WaitUntil(delegate { return !Alive(firstPid); }, 3000);
            var starts = File.ReadAllLines(Path.Combine(fixture, "started.txt"));
            Check(starts.Length == 2 && starts[1].EndsWith(":" + portB), "Restart reloads the configured port");
            Call(window, "OnServerProcessExited", first, EventArgs.Empty); PumpFor(pump, 100);
            Check((bool)Field(window, "_ready") && Object.ReferenceEquals(second, Field(window, "_serverProcess")), "Old process exit cannot restart the replacement");
            elapsed.Reset(); elapsed.Start(); Call(window, "PrepareExit");
            Check(elapsed.ElapsedMilliseconds < 500, "Exit must not synchronously wait for process completion");
            WaitUntil(delegate { return !Alive(secondPid); }, 3000);
        }
        finally { prepGate.Set(); networkGate.Set(); Call(window, "PrepareExit"); close(window); pump(); }

        // A child that started on the worker but has not been adopted must be stopped on exit.
        var pendingRoot = Path.Combine(root, "pending"); WriteServer(pendingRoot, node, FreePort());
        var createdGate = new ManualResetEvent(false); var createdEntered = new ManualResetEvent(false);
        var pendingWindow = create(pendingRoot);
        Hook(pendingWindow, "_portCleanupOverride", new Step(delegate { }));
        Hook(pendingWindow, "_startupCreatedOverride", new Step(delegate { createdEntered.Set(); createdGate.WaitOne(10000); }));
        try
        {
            show(pendingWindow); Call(pendingWindow, "StartServer", false);
            PumpUntil(delegate { return createdEntered.WaitOne(0) && File.Exists(Path.Combine(pendingRoot, "started.txt")); }, pump, 7000);
            int pendingPid = Int32.Parse(File.ReadAllLines(Path.Combine(pendingRoot, "started.txt"))[0].Split(':')[0]);
            Check(Field(pendingWindow, "_serverProcess") == null, "Worker still owns unadopted child");
            Call(pendingWindow, "PrepareExit"); createdGate.Set();
            PumpFor(pump, 150); WaitUntil(delegate { return !Alive(pendingPid); }, 3000);
            Check(Field(pendingWindow, "_serverProcess") == null, "Exit rejects late startup completion");
        }
        finally { createdGate.Set(); Call(pendingWindow, "PrepareExit"); close(pendingWindow); pump(); }
        Console.WriteLine("UI responsive during stalled preparation/network; timeout, retry, settings reload, stale exit and pending-child cleanup OK");
        return 0;
    }
}
