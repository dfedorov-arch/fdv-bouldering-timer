using System.Diagnostics;
using System.Reflection;
using System.Text;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Interactivity;
using Avalonia.Threading;
using Avalonia.VisualTree;
using FdvBoulderingTimer.Launcher;
using LauncherLanguage = FdvBoulderingTimerLauncher.LauncherLanguage;

internal static class UnixLauncherHarness
{
    private static object? Field(object instance, string name) => instance.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(instance);
    private static void Set(object instance, string name, object? value) => instance.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(instance, value);
    private static object? Call(object instance, string name, params object[] args) => instance.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(instance, args);
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Pump(Func<bool> done)
    {
        var until = DateTime.UtcNow.AddSeconds(12);
        do { Dispatcher.UIThread.RunJobs(); if (done()) return; Thread.Sleep(5); } while (DateTime.UtcNow < until);
        throw new Exception("UI operation timed out");
    }
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args[0] == "instance")
            {
                using var instance = new LauncherInstance(() => { Console.WriteLine("reopened"); Console.Out.Flush(); }, args[1]);
                if (instance.IsOwner) { Console.WriteLine("owner"); Console.Out.Flush(); Console.ReadLine(); }
                else { Check(instance.ReopenExisting(), "Existing instance could not be reopened"); Console.WriteLine("existing"); }
                return 0;
            }
            if (args[0] == "language-path") { Console.WriteLine(LauncherLanguage.PreferencePath); return 0; }
            if (args[0] == "send-language")
            {
                using var client = new HttpClient(new SocketsHttpHandler { UseProxy = false, AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(7) };
                LauncherLanguageCommand.SendAsync(client, int.Parse(args[1]), args[2], args[3], CancellationToken.None).GetAwaiter().GetResult();
                return 0;
            }
            if (args[0] == "render")
            {
                Directory.CreateDirectory(args[1]); LauncherLanguage.Russian = args[3] == "ru";
                AppBuilder.Configure<LauncherApp>().UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false }).UseSkia().SetupWithoutStarting();
                var form = new LauncherWindow(args[1], false);
                if (args.Length > 4 && args[4] == "min") { form.Width = form.MinWidth; form.Height = form.MinHeight; }
                form.Show();
                try
                {
                    ((TextBlock)Field(form, "_buildLabel")!).Text = "(442)";
                    Call(form, "SetStatusText", "Server is running");
                    ((TextBlock)Field(form, "_status")!).Foreground = new Avalonia.Media.SolidColorBrush(Avalonia.Media.Color.FromRgb(87, 211, 140));
                    ((Button)Field(form, "_openButton")!).IsEnabled = true;
                    ((TextBox)Field(form, "_log")!).Text = LauncherLanguage.Text("Server is ready.");
                    var addresses = (ListBox)Field(form, "_addresses")!; addresses.Items.Clear();
                    addresses.Items.Add(new TimerAddress { Label = LauncherLanguage.Text("Local HTTP"), Url = "http://127.0.0.1:8008/" });
                    addresses.Items.Add(new TimerAddress { Label = "Wi-Fi HTTP", Url = "http://192.168.1.10:8008/" }); addresses.SelectedIndex = 0;
                    Dispatcher.UIThread.RunJobs();
                    using var frame = form.CaptureRenderedFrame() ?? throw new Exception("No rendered frame"); frame.Save(args[2]);
                    foreach (var name in new[] { "_languageButton", "_openButton", "_copyButton", "_restartButton", "_stopButton", "_certificateButton", "_hint" })
                    {
                        var control = (Control)Field(form, name)!; var point = control.TranslatePoint(new Point(0, 0), form)!.Value;
                        Check(point.X >= 0 && point.Y >= 0 && point.X + control.Bounds.Width <= form.ClientSize.Width + 1 && point.Y + control.Bounds.Height <= form.ClientSize.Height + 1,
                            "Control must fit the window: " + name);
                    }
                }
                finally { form.PrepareExit(); form.Close(); }
                return 0;
            }
            if (args[0] != "ui") throw new ArgumentException("Unknown mode");
            var root = args[1]; Directory.CreateDirectory(root);
            File.WriteAllText(Path.Combine(root, "params.txt"), "http_port=" + args[2] + "\nhttps_port=65432\n");
            var preference = Path.Combine(root, "launcher-language.txt");
            LauncherLanguage.Load(preference); Check(LauncherLanguage.Russian, "Missing preference defaults to RU");
            AppBuilder.Configure<LauncherApp>().UseHeadless(new AvaloniaHeadlessPlatformOptions()).SetupWithoutStarting();
            SynchronizationContext.SetSynchronizationContext(new AvaloniaSynchronizationContext());
            var initialStarts = 0;
            var window = new LauncherWindow(root, false, () => initialStarts++); window.Show(); Dispatcher.UIThread.RunJobs();
            Check(initialStarts == 1, "First show must invoke the startup action once");
            try
            {
                var fakeProcess = new Process(); // Correlation identity only: never points at or kills a real server.
                Set(window, "_ready", true); Set(window, "_serverProcess", fakeProcess); Set(window, "_launcherLanguageToken", args[3]);
                Call(window, "SetStatusText", "Server is running");
                var generation = Field(window, "_probeGeneration");
                var addresses = (ListBox)Field(window, "_addresses")!;
                addresses.SelectedIndex = Math.Min(1, addresses.Items.Count - 1);
                var selected = ((TimerAddress)addresses.SelectedItem!).Url;
                var language = (Button)Field(window, "_languageButton")!;
                Check((string)language.Content! == "EN", "RU UI offers EN");
                Check((string)((Button)Field(window, "_openButton")!).Content! == "Открыть таймер", "RU buttons");
                foreach (var desired in new[] { "en", "ru" })
                {
                    language.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Pump(() => !(bool)Field(window, "_languageSyncBusy")!);
                    Check(File.ReadAllText(preference, Encoding.UTF8).Trim() == desired, "Preference must be saved");
                    Check(Equals(Field(window, "_probeGeneration"), generation), "Language must not invalidate health probes");
                    Check(ReferenceEquals(Field(window, "_serverProcess"), fakeProcess), "Language must not restart child");
                    Check((bool)Field(window, "_ready")!, "Language must not reset readiness");
                    Check(((TimerAddress)addresses.SelectedItem!).Url == selected, "Selected URL must survive translation");
                    var dialog = new HttpsCertificateDialog(root); dialog.Show(); Dispatcher.UIThread.RunJobs();
                    try
                    {
                        Check(dialog.Title == (desired == "ru" ? "HTTPS-сертификат" : "HTTPS certificate"), "Certificate title language");
                        Check((string)((Button)Field(dialog, "_create")!).Content! == (desired == "ru" ? "Создать сертификат" : "Create certificate"), "Certificate button language");
                        var status = ((TextBlock)Field(dialog, "_status")!).Text!;
                        Check(status.Contains(desired == "ru" ? "Сервер продолжит" : "The server keeps"), "Certificate explanation language");
                    }
                    finally { dialog.Close(); }
                }
                window.Close(); Dispatcher.UIThread.RunJobs();
                Check(!window.IsVisible && !(bool)Field(window, "_allowClose")!, "Close hides instead of exiting");
                Check((bool)Field(window, "_ready")! && Equals(Field(window, "_probeGeneration"), generation), "Close preserves running server/probes");
                window.ShowLauncher(); Dispatcher.UIThread.RunJobs(); Check(window.IsVisible, "Reopen restores window");
                Check(initialStarts == 1, "Reopening must never invoke the startup action again");
                for (var repeat = 0; repeat < 3; repeat++) { window.Close(); window.ShowLauncher(); Dispatcher.UIThread.RunJobs(); }
                Check(initialStarts == 1 && ReferenceEquals(Field(window, "_serverProcess"), fakeProcess)
                    && Equals(Field(window, "_probeGeneration"), generation), "Repeated hide/show preserves startup count, child and probes");
                var tray = (TrayIcon)Field(window, "_tray")!;
                Check(tray.IsVisible, "Tray must remain available while running");
                Check(tray.Menu!.Items.OfType<NativeMenuItem>().Any(item => (string?)item.Header == "Стоп и выход"), "Tray exit translated");
                window.PrepareExit(); Check(!tray.IsVisible && (bool)Field(window, "_allowClose")!, "Explicit Exit retires tray and stops lifecycle");
                File.WriteAllText(preference, "invalid"); LauncherLanguage.Load(preference); Check(LauncherLanguage.Russian, "Invalid preference defaults to RU");
                LauncherLanguage.Russian = false; Check(LauncherLanguage.Save(preference), "Can save EN"); LauncherLanguage.Russian = true;
                LauncherLanguage.Load(preference); Check(!LauncherLanguage.Russian, "Saved EN survives relaunch");
                Console.WriteLine("RU/EN, certificate labels, preference, selected URL, child identity, probes, hide/reopen and explicit exit: OK");
            }
            finally { window.PrepareExit(); window.Close(); Dispatcher.UIThread.RunJobs(); }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
