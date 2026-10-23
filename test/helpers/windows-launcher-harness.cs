using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using FdvBoulderingTimerLauncher;

internal static class WindowsLauncherHarness
{
    private static object Field(object target, string name)
    { return target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic).GetValue(target); }
    private static void Call(object target, string name, params object[] args)
    { target.GetType().GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(target, args); }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Render(Form form, string path)
    {
        using (var bitmap = new Bitmap(form.Width, form.Height))
        { form.DrawToBitmap(bitmap, new Rectangle(0, 0, form.Width, form.Height)); bitmap.Save(path); }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args[0] == "send-language")
            {
                LauncherForm.SendServerLanguage(Int32.Parse(args[1]), args[2], args[3]);
                return 0;
            }
            if (args[0] == "switch-server-language")
            {
                MethodInfo createToken = typeof(LauncherForm).GetMethod("NewLanguageToken", BindingFlags.Static | BindingFlags.NonPublic);
                string firstToken = (string)createToken.Invoke(null, null), secondToken = (string)createToken.Invoke(null, null);
                Check(firstToken.Length == 64 && firstToken != secondToken, "Each child launch needs a fresh random capability");
                string fixtureRoot = args[1], desired = args[4];
                Directory.CreateDirectory(fixtureRoot);
                LauncherLanguage.Russian = desired == "en";
                using (var form = new LauncherForm(fixtureRoot, false))
                {
                    form.StartPosition = FormStartPosition.Manual; form.Location = new Point(-10000, -10000);
                    form.Opacity = 0; form.Show(); Application.DoEvents();
                    var self = System.Diagnostics.Process.GetCurrentProcess();
                    form.GetType().GetField("_serverProcess", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(form, self);
                    form.GetType().GetField("_launcherLanguageToken", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(form, args[3]);
                    ((LauncherSettings)Field(form, "_settings")).HttpPort = Int32.Parse(args[2]);
                    Call(form, "CanReach", "http://127.0.0.1:" + args[2] + "/api/state", true);
                    Check(((Label)Field(form, "_buildLabel")).Text == "(" + args[5] + ")", "Build comes from actual readiness response");
                    form.GetType().GetField("_ready", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(form, true);
                    ((Button)Field(form, "_languageButton")).PerformClick();
                    DateTime deadline = DateTime.UtcNow.AddSeconds(10);
                    while ((bool)Field(form, "_languageSyncBusy"))
                    {
                        if (DateTime.UtcNow > deadline) throw new Exception("Language worker timed out");
                        Application.DoEvents(); System.Threading.Thread.Sleep(10);
                    }
                    Check(((Button)Field(form, "_languageButton")).Enabled, "Button is re-enabled after synchronization");
                    Check(Object.ReferenceEquals(Field(form, "_serverProcess"), self), "Do not replace the process");
                    string log = ((TextBox)Field(form, "_log")).Text;
                    Check(!log.Contains("Could not change") && !log.Contains("Не удалось изменить"), "Language worker failed: " + log);
                    foreach (string timer in new string[] { "_startupTimer", "_healthTimer", "_restartTimer" })
                        Check(!((System.Windows.Forms.Timer)Field(form, timer)).Enabled, "Do not start timer: " + timer);
                }
                return 0;
            }
            string root = args[0], preference = Path.Combine(root, "launcher-language.txt");
            Directory.CreateDirectory(root);
            System.Threading.Thread.CurrentThread.CurrentUICulture = new CultureInfo("en-US");
            LauncherLanguage.Load(preference);
            Check(LauncherLanguage.Russian, "First launch must default to Russian even on English Windows");
            File.WriteAllText(preference, "invalid"); LauncherLanguage.Load(preference);
            Check(LauncherLanguage.Russian, "Invalid preference must default to Russian");
            LauncherLanguage.Russian = false;
            Check(LauncherLanguage.Save(preference), "Save English preference");
            System.Threading.Thread.CurrentThread.CurrentUICulture = new CultureInfo("ru-RU");
            LauncherLanguage.Load(preference);
            Check(!LauncherLanguage.Russian, "Saved English must override Russian default and OS");
            System.Threading.Thread.CurrentThread.CurrentUICulture = new CultureInfo("en-US");
            LauncherLanguage.Russian = true;
            Check(LauncherLanguage.Save(preference), "Save language");
            LauncherLanguage.Russian = false; LauncherLanguage.Load(preference);
            Check(LauncherLanguage.Russian, "Saved RU must override English OS");
            string paramsPath = Path.Combine(root, "params.txt");
            File.WriteAllText(paramsPath, "language=en\nhttp_port=12345\n");
            Application.EnableVisualStyles();
            using (var form = new LauncherForm(root, false))
            {
                form.StartPosition = FormStartPosition.Manual; form.Location = new Point(-10000, -10000);
                form.Opacity = 0; form.Show(); Application.DoEvents();
                var button = (Button)Field(form, "_languageButton");
                var addresses = (ListBox)Field(form, "_addresses");
                var status = (Label)Field(form, "_status");
                var tray = (NotifyIcon)Field(form, "_tray");
                var log = (TextBox)Field(form, "_log");
                var build = (Label)Field(form, "_buildLabel");
                Check(build.Text == "", "No invented build before server readiness");
                Call(form, "UpdateBuildNumber", "{\"config\":{\"buildNumber\":430}}");
                Application.DoEvents();
                Check(build.Text == "(430)" && form.Text.EndsWith("   (430)"), "Build from server response");
                var originalSize = form.Size;
                form.Size = form.MinimumSize; Application.DoEvents();
                Check(build.Left > 300 && build.Right + 10 < button.Left, "Build fits beside title at minimum width");
                Render(form, args[1] + "-build-minimum.png");
                form.Size = originalSize; Application.DoEvents();
                Call(form, "UpdateBuildNumber", "{\"config\":{\"buildNumber\":431}}");
                Check(build.Text == "(431)", "Restart may change server build");
                Call(form, "UpdateBuildNumber", "");
                Check(build.Text == "" && form.Text == "FDV Bouldering Timer", "Clear stale build on restart");
                Call(form, "UpdateBuildNumber", "{\"buildNumber\":430.5}");
                Check(build.Text == "", "Reject malformed build");
                Call(form, "UpdateBuildNumber", "{\"config\":{\"buildNumber\":430}}");
                string url = ((TimerAddress)addresses.SelectedItem).Url;
                Call(form, "SetStatusText", "Server is running");
                Call(form, "SetTrayText", "FDV Bouldering Timer - running");
                Call(form, "AppendRawLog", "Original server output");
                string originalLog = log.Text;
                Check(button.Text == "EN" && status.Text == "Сервер работает", "Initial RU labels/status");
                Check(tray.ContextMenuStrip.Items[0].Text == "Открыть лаунчер", "Initial RU tray");
                Check(((Button)Field(form, "_copyButton")).Text == "Копировать ссылку", "Full Russian copy label");
                Check(((Button)Field(form, "_restartButton")).Text == "Перезапуск сервера", "Full Russian restart label");
                foreach (string name in new string[] { "_openButton", "_copyButton", "_restartButton", "_stopButton" })
                {
                    var action = (Button)Field(form, name);
                    Check(TextRenderer.MeasureText(action.Text, action.Font).Width + 6 <= action.Width, "Button text must fit: " + action.Text);
                }
                Render(form, args[1] + "-ru.png");
                button.PerformClick(); Application.DoEvents();
                Check(!LauncherLanguage.Russian && button.Text == "RU", "Actual language-button click");
                Check(status.Text == "Server is running", "Live status translated without restart");
                Check(build.Text == "(430)", "Build survives language switch");
                Check(tray.Text == "FDV Bouldering Timer - running", "Live tray status translated");
                Check(tray.ContextMenuStrip.Items[0].Text == "Show launcher", "English tray");
                Check(((TimerAddress)addresses.SelectedItem).Url == url, "Selected address preserved");
                Check(log.Text == originalLog, "Do not rewrite technical log history");
                Check(!((Button)Field(form, "_openButton")).Enabled, "Do not enable a not-ready server");
                Check(File.ReadAllText(preference).Trim() == "en", "Button persists language in isolated fixture");
                using (var dialog = new HttpsCertificateDialog(root)) Check(dialog.Text == "HTTPS certificate", "Certificate uses chosen language, not OS");
                Render(form, args[1] + "-en.png");
                form.GetType().GetField("_ready", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(form, true);
                ((Button)Field(form, "_openButton")).Enabled = true;
                button.PerformClick();
                Check(((Button)Field(form, "_openButton")).Enabled, "Ready button state preserved");
                Check(status.Text == "Сервер работает", "Second switch updates status");
                using (var dialog = new HttpsCertificateDialog(root)) Check(dialog.Text == "HTTPS-сертификат", "Russian certificate dialog");
                foreach (string timer in new string[] { "_startupTimer", "_healthTimer", "_restartTimer", "_networkRefreshTimer" })
                    Check(!((System.Windows.Forms.Timer)Field(form, timer)).Enabled, "Language must not start timers: " + timer);
                Check(Field(form, "_serverProcess") == null, "Language must not spawn a server");
                Check(File.ReadAllText(paramsPath) == "language=en\nhttp_port=12345\n", "Do not change server/browser configuration");
            }
            LauncherLanguage.Russian = false; LauncherLanguage.Load(preference);
            Check(LauncherLanguage.Russian, "Language survives a new load");
            string blocked = Path.Combine(root, "blocked"); File.WriteAllText(blocked, "file");
            Check(!LauncherLanguage.Save(Path.Combine(blocked, "language.txt")), "Saving failure is non-fatal");
            Console.WriteLine("Language switch, persistence, passive server safety and RU/EN renders passed.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
    }
}
