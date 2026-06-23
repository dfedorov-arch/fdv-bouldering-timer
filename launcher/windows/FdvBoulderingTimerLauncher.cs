using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace FdvBoulderingTimerLauncher
{
    internal static class Program
    {
        private const string MutexName = "Local\\FdvBoulderingTimerLauncher";

        [STAThread]
        private static void Main()
        {
            bool created;
            using (var mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    MessageBox.Show(
                        "FDV Bouldering Timer Launcher is already running. Check the notification area.",
                        "FDV Bouldering Timer",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs args)
                {
                    MessageBox.Show(
                        "The launcher encountered an error but can continue working.\n\n" + args.Exception.Message,
                        "FDV Bouldering Timer",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                };
                Application.Run(new LauncherForm());
            }
        }
    }

    internal sealed class LauncherSettings
    {
        public int HttpPort = 8008;
        public int HttpsPort = 8443;
        public string PortableNode = @"runtime\win\node.exe";

        public static LauncherSettings Load(string baseDirectory)
        {
            var settings = new LauncherSettings();
            var path = Path.Combine(baseDirectory, "params.txt");
            if (!File.Exists(path)) return settings;

            foreach (var sourceLine in File.ReadAllLines(path, Encoding.UTF8))
            {
                var line = sourceLine.Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;
                var separator = line.IndexOf('=');
                if (separator <= 0) continue;
                var key = line.Substring(0, separator).Trim().ToLowerInvariant();
                var value = line.Substring(separator + 1).Trim();
                int port;
                if (key == "http_port" && Int32.TryParse(value, out port) && IsPort(port)) settings.HttpPort = port;
                if (key == "https_port" && Int32.TryParse(value, out port) && IsPort(port)) settings.HttpsPort = port;
                if (key == "portable_node_win" && value.Length > 0) settings.PortableNode = value;
            }
            return settings;
        }

        private static bool IsPort(int value)
        {
            return value > 0 && value <= 65535;
        }
    }

    internal sealed class TimerAddress
    {
        public string Label;
        public string Url;

        public override string ToString()
        {
            return Label + "  " + Url;
        }
    }

    internal sealed class LauncherForm : Form
    {
        private readonly string _baseDirectory;
        private readonly LauncherSettings _settings;
        private readonly bool _hasHttps;
        private readonly bool _openBrowserOnStart;
        private readonly ListBox _addresses = new ListBox();
        private readonly Label _status = new Label();
        private readonly TextBox _log = new TextBox();
        private readonly Button _openButton = new Button();
        private readonly Button _copyButton = new Button();
        private readonly Button _restartButton = new Button();
        private readonly Button _stopButton = new Button();
        private readonly NotifyIcon _tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer _startupTimer = new System.Windows.Forms.Timer();
        private Process _serverProcess;
        private int _startupAttempts;
        private bool _ready;
        private bool _allowClose;

        public LauncherForm()
        {
            _baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            _settings = LauncherSettings.Load(_baseDirectory);
            _hasHttps = HasHttpsCertificate();
            _openBrowserOnStart = Environment.GetEnvironmentVariable("FDV_LAUNCHER_NO_BROWSER") != "1";
            InitializeWindow();
            PopulateAddresses();
            ConfigureTray();

            Shown += delegate { StartServer(_openBrowserOnStart); };
            FormClosing += OnFormClosing;
        }

        private void InitializeWindow()
        {
            Text = "FDV Bouldering Timer";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(560, 470);
            ClientSize = new Size(620, 500);
            BackColor = Color.FromArgb(17, 23, 34);
            ForeColor = Color.FromArgb(244, 247, 251);
            Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            var header = new Label();
            header.Text = "FDV Bouldering Timer";
            header.Font = new Font(Font.FontFamily, 18F, FontStyle.Bold);
            header.AutoSize = true;
            header.Location = new Point(22, 18);

            _status.Text = "Preparing server...";
            _status.AutoSize = false;
            _status.Location = new Point(24, 60);
            _status.Size = new Size(560, 25);
            _status.ForeColor = Color.FromArgb(255, 200, 87);

            var addressTitle = new Label();
            addressTitle.Text = "Timer addresses";
            addressTitle.AutoSize = true;
            addressTitle.Location = new Point(24, 96);
            addressTitle.Font = new Font(Font, FontStyle.Bold);

            _addresses.Location = new Point(24, 119);
            _addresses.Size = new Size(570, 126);
            _addresses.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            _addresses.BackColor = Color.FromArgb(16, 20, 27);
            _addresses.ForeColor = ForeColor;
            _addresses.BorderStyle = BorderStyle.FixedSingle;
            _addresses.IntegralHeight = false;
            _addresses.DoubleClick += delegate { OpenSelectedAddress(); };
            _addresses.SelectedIndexChanged += delegate { _copyButton.Enabled = _addresses.SelectedItem != null; };

            _openButton.Text = "Open timer";
            _openButton.Location = new Point(24, 258);
            _openButton.Size = new Size(125, 36);
            _openButton.Enabled = false;
            _openButton.Click += delegate { OpenSelectedAddress(); };

            _copyButton.Text = "Copy link";
            _copyButton.Location = new Point(157, 258);
            _copyButton.Size = new Size(110, 36);
            _copyButton.Enabled = false;
            _copyButton.Click += delegate { CopySelectedAddress(); };

            _restartButton.Text = "Restart server";
            _restartButton.Location = new Point(275, 258);
            _restartButton.Size = new Size(130, 36);
            _restartButton.Click += delegate { StartServer(false); };

            _stopButton.Text = "Stop and exit";
            _stopButton.Location = new Point(413, 258);
            _stopButton.Size = new Size(130, 36);
            _stopButton.Click += delegate { StopAndExit(); };

            var logTitle = new Label();
            logTitle.Text = "Server log";
            logTitle.AutoSize = true;
            logTitle.Location = new Point(24, 312);
            logTitle.Font = new Font(Font, FontStyle.Bold);

            _log.Location = new Point(24, 335);
            _log.Size = new Size(570, 135);
            _log.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            _log.BackColor = Color.FromArgb(16, 20, 27);
            _log.ForeColor = Color.FromArgb(190, 200, 214);
            _log.BorderStyle = BorderStyle.FixedSingle;
            _log.Multiline = true;
            _log.ReadOnly = true;
            _log.ScrollBars = ScrollBars.Vertical;
            _log.Font = new Font("Consolas", 8.5F);

            Controls.Add(header);
            Controls.Add(_status);
            Controls.Add(addressTitle);
            Controls.Add(_addresses);
            Controls.Add(_openButton);
            Controls.Add(_copyButton);
            Controls.Add(_restartButton);
            Controls.Add(_stopButton);
            Controls.Add(logTitle);
            Controls.Add(_log);

            _startupTimer.Interval = 300;
            _startupTimer.Tick += CheckServerReady;
        }

        private void ConfigureTray()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Show launcher", null, delegate { ShowLauncher(); });
            menu.Items.Add("Open timer", null, delegate { OpenLocalTimer(); });
            menu.Items.Add("Restart server", null, delegate { StartServer(false); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Stop and exit", null, delegate { StopAndExit(); });

            _tray.Icon = Icon;
            _tray.Text = "FDV Bouldering Timer";
            _tray.ContextMenuStrip = menu;
            _tray.Visible = true;
            _tray.DoubleClick += delegate { ShowLauncher(); };
        }

        private bool HasHttpsCertificate()
        {
            var pem = File.Exists(Path.Combine(_baseDirectory, "timer-key.pem")) &&
                      File.Exists(Path.Combine(_baseDirectory, "timer-cert.pem"));
            return pem || File.Exists(Path.Combine(_baseDirectory, "timer-cert.pfx"));
        }

        private void PopulateAddresses()
        {
            _addresses.Items.Clear();
            AddAddress("Local HTTP", "http://127.0.0.1:" + _settings.HttpPort + "/");
            if (_hasHttps) AddAddress("Local HTTPS", "https://127.0.0.1:" + _settings.HttpsPort + "/");

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var network in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (network.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var address in network.GetIPProperties().UnicastAddresses)
                {
                    if (address.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var ip = address.Address.ToString();
                    if (IPAddress.IsLoopback(address.Address) || ip.StartsWith("169.254.") || !seen.Add(ip)) continue;
                    var type = NetworkType(network);
                    AddAddress(type + " HTTP", "http://" + ip + ":" + _settings.HttpPort + "/");
                    if (_hasHttps) AddAddress(type + " HTTPS", "https://" + ip + ":" + _settings.HttpsPort + "/");
                }
            }
            if (_addresses.Items.Count > 0) _addresses.SelectedIndex = 0;
        }

        private static string NetworkType(NetworkInterface network)
        {
            if (network.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) return "Wi-Fi";
            if (network.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                network.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet ||
                network.NetworkInterfaceType == NetworkInterfaceType.FastEthernetFx ||
                network.NetworkInterfaceType == NetworkInterfaceType.FastEthernetT) return "Ethernet";
            return "Network";
        }

        private void AddAddress(string label, string url)
        {
            _addresses.Items.Add(new TimerAddress { Label = label, Url = url });
        }

        private void StartServer(bool openBrowser)
        {
            _startupTimer.Stop();
            _ready = false;
            _openButton.Enabled = false;
            _status.Text = "Starting server...";
            _status.ForeColor = Color.FromArgb(255, 200, 87);
            AppendLog("Starting server...");

            StopServerProcess();
            StopPortListeners();

            var nodePath = FindNodeExecutable();
            if (nodePath == null)
            {
                SetError("Node.js was not found. Check portable_node_win in params.txt or install Node.js LTS.");
                return;
            }

            var serverScript = Path.Combine(_baseDirectory, "serve-bouldering-timer.js");
            if (!File.Exists(serverScript))
            {
                SetError("serve-bouldering-timer.js was not found next to the launcher.");
                return;
            }

            try
            {
                var start = new ProcessStartInfo();
                start.FileName = nodePath;
                start.Arguments = QuoteArgument(serverScript);
                start.WorkingDirectory = _baseDirectory;
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                start.RedirectStandardOutput = true;
                start.RedirectStandardError = true;
                start.StandardOutputEncoding = Encoding.UTF8;
                start.StandardErrorEncoding = Encoding.UTF8;

                _serverProcess = new Process();
                _serverProcess.StartInfo = start;
                _serverProcess.EnableRaisingEvents = true;
                _serverProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) AppendLog(args.Data); };
                _serverProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) AppendLog(args.Data); };
                _serverProcess.Exited += OnServerProcessExited;
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
                AppendLog("Using Node.js: " + nodePath);

                _startupAttempts = 0;
                _startupTimer.Tag = openBrowser;
                _startupTimer.Start();
            }
            catch (Exception error)
            {
                SetError("Unable to start server: " + error.Message);
            }
        }

        private void CheckServerReady(object sender, EventArgs args)
        {
            _startupAttempts++;
            if (CanReach("http://127.0.0.1:" + _settings.HttpPort + "/api/state"))
            {
                _startupTimer.Stop();
                _ready = true;
                _openButton.Enabled = true;
                _status.Text = "Server is running";
                _status.ForeColor = Color.FromArgb(87, 211, 140);
                _tray.Text = "FDV Bouldering Timer - running";
                AppendLog("Server is ready.");
                if (_startupTimer.Tag is bool && (bool)_startupTimer.Tag) OpenLocalTimer();
                return;
            }

            if (_serverProcess == null || _serverProcess.HasExited || _startupAttempts >= 30)
            {
                _startupTimer.Stop();
                SetError("The server did not start. Check the server log and configured ports.");
            }
        }

        private static bool CanReach(string url)
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 250;
                request.ReadWriteTimeout = 250;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private string FindNodeExecutable()
        {
            var portable = Environment.ExpandEnvironmentVariables(_settings.PortableNode.Trim('"'));
            if (!Path.IsPathRooted(portable)) portable = Path.Combine(_baseDirectory, portable);
            if (File.Exists(portable)) return Path.GetFullPath(portable);

            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var folder in path.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var candidate = Path.Combine(folder.Trim().Trim('"'), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }
            return null;
        }

        private void StopPortListeners()
        {
            try
            {
                var powershell = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.System),
                    @"WindowsPowerShell\v1.0\powershell.exe");
                if (!File.Exists(powershell)) return;
                var command = "$ports=@(" + _settings.HttpPort + "," + _settings.HttpsPort + ");" +
                    "$connections=Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object{$ports -contains $_.LocalPort};" +
                    "$connections|Select-Object -ExpandProperty OwningProcess -Unique|ForEach-Object{Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue}";
                var info = new ProcessStartInfo();
                info.FileName = powershell;
                info.Arguments = "-NoProfile -NonInteractive -Command \"" + command + "\"";
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                using (var process = Process.Start(info))
                {
                    process.WaitForExit(5000);
                }
                Thread.Sleep(300);
            }
            catch (Exception error)
            {
                AppendLog("Could not stop previous port listeners: " + error.Message);
            }
        }

        private void StopServerProcess()
        {
            try
            {
                if (_serverProcess != null && !_serverProcess.HasExited)
                {
                    _serverProcess.EnableRaisingEvents = false;
                    _serverProcess.Kill();
                    _serverProcess.WaitForExit(3000);
                }
            }
            catch { }
            finally
            {
                if (_serverProcess != null) _serverProcess.Dispose();
                _serverProcess = null;
            }
        }

        private void OnServerExited()
        {
            if (_allowClose) return;
            _ready = false;
            _openButton.Enabled = false;
            _status.Text = "Server stopped";
            _status.ForeColor = Color.FromArgb(240, 90, 89);
            _tray.Text = "FDV Bouldering Timer - stopped";
        }

        private void OnServerProcessExited(object sender, EventArgs args)
        {
            var exitedProcess = sender as Process;
            try
            {
                BeginInvoke(new Action(delegate
                {
                    if (_serverProcess == exitedProcess) OnServerExited();
                }));
            }
            catch (InvalidOperationException) { }
        }

        private void OpenSelectedAddress()
        {
            var selected = _addresses.SelectedItem as TimerAddress;
            if (selected == null || !_ready) return;
            OpenUrl(selected.Url);
        }

        private void OpenLocalTimer()
        {
            if (!_ready) return;
            OpenUrl("http://127.0.0.1:" + _settings.HttpPort + "/");
        }

        private static void OpenUrl(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "Unable to open browser", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void CopySelectedAddress()
        {
            var selected = _addresses.SelectedItem as TimerAddress;
            if (selected == null) return;

            try
            {
                Clipboard.SetDataObject(selected.Url, true, 20, 100);
                AppendLog("Link copied: " + selected.Url);
            }
            catch (ExternalException error)
            {
                AppendLog("Clipboard is busy: " + error.Message);
                MessageBox.Show(
                    "Windows clipboard is busy. Wait a moment and click Copy link again.",
                    "Unable to copy link",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private void SetError(string message)
        {
            _ready = false;
            _openButton.Enabled = false;
            _status.Text = message;
            _status.ForeColor = Color.FromArgb(240, 90, 89);
            _tray.Text = "FDV Bouldering Timer - error";
            AppendLog(message);
        }

        private void AppendLog(string message)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(AppendLog), message);
                return;
            }
            _log.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message + Environment.NewLine);
        }

        private void ShowLauncher()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        private void StopAndExit()
        {
            _allowClose = true;
            _startupTimer.Stop();
            StopServerProcess();
            StopPortListeners();
            _tray.Visible = false;
            Close();
        }

        private void OnFormClosing(object sender, FormClosingEventArgs args)
        {
            if (_allowClose) return;
            args.Cancel = true;
            Hide();
            _tray.ShowBalloonTip(1800, "FDV Bouldering Timer", "The server is still running. Use the tray icon to open or stop it.", ToolTipIcon.Info);
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _startupTimer.Dispose();
                _tray.Dispose();
                if (_serverProcess != null) _serverProcess.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
