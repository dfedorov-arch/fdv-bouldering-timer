using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace FdvBoulderingTimerLauncher
{
    internal static class Program
    {
        private const string MutexName = "Local\\FdvBoulderingTimerLauncher";
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern uint RegisterWindowMessage(string text);
        [DllImport("user32.dll")]
        private static extern bool SendNotifyMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
        internal static readonly uint ShowLauncherMessage = RegisterWindowMessage("FDV.BoulderingTimer.Launcher.Show");

        [STAThread]
        private static void Main()
        {
            LauncherLanguage.Load(LauncherLanguage.PreferencePath);
            bool created;
            using (var mutex = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    // Show the existing GUI rather than start/stop any server.
                    if (ShowLauncherMessage != 0 && SendNotifyMessage(new IntPtr(0xffff), ShowLauncherMessage, IntPtr.Zero, IntPtr.Zero)) return;
                    MessageBox.Show(
                        LauncherLanguage.Text("FDV Bouldering Timer Launcher is already running. Check the notification area."),
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
                        LauncherLanguage.Text("The launcher encountered an error but can continue working.\n\n") + args.Exception.Message,
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
        // CLR2's RNGCryptoServiceProvider is not IDisposable. Keep one
        // process-lifetime provider rather than allocating one per restart.
        private static readonly RNGCryptoServiceProvider LanguageRandom = new RNGCryptoServiceProvider();
        private readonly string _baseDirectory;
        private readonly string _languagePreferencePath;
        private LauncherSettings _settings;
        private bool _hasHttps;
        private readonly bool _openBrowserOnStart;
        private readonly ListBox _addresses = new ListBox();
        private readonly Label _status = new Label();
        private readonly Label _buildLabel = new Label();
        private readonly TextBox _log = new TextBox();
        private readonly Button _openButton = new Button();
        private readonly Button _copyButton = new Button();
        private readonly Button _restartButton = new Button();
        private readonly Button _stopButton = new Button();
        private readonly Button _certificateButton = new Button();
        private readonly Button _languageButton = new Button();
        private readonly Label _addressTitle = new Label();
        private readonly Label _logTitle = new Label();
        private string _statusEnglish = "Preparing server...";
        private string _trayEnglish = "FDV Bouldering Timer";
        private readonly NotifyIcon _tray = new NotifyIcon();
        private readonly System.Windows.Forms.Timer _startupTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer _healthTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer _restartTimer = new System.Windows.Forms.Timer();
        private readonly System.Windows.Forms.Timer _networkRefreshTimer = new System.Windows.Forms.Timer();
        private Process _serverProcess;
        private int _startupAttempts;
        private int _healthFailures;
        private int _restartAttempts;
        private bool _ready;
        private bool _allowClose;
        private bool _intentionalStop;
        private string _launcherLanguageToken;
        private string _pendingServerLanguage;
        private bool _languageSyncBusy;
        private long _languageIntentRevision;
        private bool _serverLanguageAvailable;
        private bool _openBrowserAfterLanguageSync;

        public LauncherForm() : this(AppDomain.CurrentDomain.BaseDirectory, true) { }

        // Passive construction is used only by off-screen native UI tests.
        internal LauncherForm(string baseDirectory, bool startAutomatically)
        {
            _baseDirectory = baseDirectory;
            _languagePreferencePath = startAutomatically ? LauncherLanguage.PreferencePath : Path.Combine(baseDirectory, "launcher-language.txt");
            _settings = LauncherSettings.Load(_baseDirectory);
            _hasHttps = HasHttpsCertificate();
            _openBrowserOnStart = Environment.GetEnvironmentVariable("FDV_LAUNCHER_NO_BROWSER") != "1";
            InitializeWindow();
            PopulateAddresses();
            ConfigureTray(startAutomatically);
            ApplyLanguage();

            if (startAutomatically) Shown += delegate { StartServer(_openBrowserOnStart); };
            FormClosing += OnFormClosing;
            if (startAutomatically) NetworkChange.NetworkAddressChanged += OnNetworkAddressChanged;
        }

        private void InitializeWindow()
        {
            Text = "FDV Bouldering Timer";
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(560, 510);
            ClientSize = new Size(620, 540);
            BackColor = Color.FromArgb(17, 23, 34);
            ForeColor = Color.FromArgb(244, 247, 251);
            Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            var header = new Label();
            header.Text = "FDV Bouldering Timer";
            header.Font = new Font(Font.FontFamily, 18F, FontStyle.Bold);
            header.AutoSize = true;
            header.Location = new Point(22, 18);
            _buildLabel.Name = "serverBuildNumber";
            _buildLabel.AutoSize = true;
            _buildLabel.Font = new Font(Font.FontFamily, 12F, FontStyle.Regular);
            _buildLabel.ForeColor = Color.FromArgb(160, 174, 192);
            _buildLabel.Location = new Point(header.Right + 14, 25);
            header.SizeChanged += delegate { _buildLabel.Left = header.Right + 14; };
            Controls.Add(_buildLabel);

            _languageButton.Name = "launcherLanguage";
            _languageButton.Location = new Point(548, 22);
            _languageButton.Size = new Size(46, 28);
            _languageButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            _languageButton.Click += delegate { SwitchLanguage(); };

            _status.Text = "Preparing server...";
            _status.AutoSize = false;
            _status.Location = new Point(24, 60);
            _status.Size = new Size(560, 25);
            _status.ForeColor = Color.FromArgb(255, 200, 87);

            var addressTitle = _addressTitle;
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
            _openButton.Size = new Size(110, 36);
            _openButton.Enabled = false;
            _openButton.Click += delegate { OpenSelectedAddress(); };

            _copyButton.Text = "Copy link";
            _copyButton.Location = new Point(142, 258);
            _copyButton.Size = new Size(125, 36);
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

            _certificateButton.Text = "Create HTTPS certificate";
            _certificateButton.Location = new Point(24, 304);
            _certificateButton.Size = new Size(240, 32);
            _certificateButton.Click += delegate { CreateHttpsCertificate(); };

            var logTitle = _logTitle;
            logTitle.Text = "Server log";
            logTitle.AutoSize = true;
            logTitle.Location = new Point(24, 352);
            logTitle.Font = new Font(Font, FontStyle.Bold);

            _log.Location = new Point(24, 375);
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
            Controls.Add(_languageButton);
            Controls.Add(_status);
            Controls.Add(addressTitle);
            Controls.Add(_addresses);
            Controls.Add(_openButton);
            Controls.Add(_copyButton);
            Controls.Add(_restartButton);
            Controls.Add(_stopButton);
            Controls.Add(_certificateButton);
            Controls.Add(logTitle);
            Controls.Add(_log);

            _startupTimer.Interval = 300;
            _startupTimer.Tick += CheckServerReady;
            _healthTimer.Interval = 1000;
            _healthTimer.Tick += CheckServerHealth;
            _restartTimer.Tick += RestartTimerTick;
            _networkRefreshTimer.Interval = 750;
            _networkRefreshTimer.Tick += RefreshNetworkAddresses;
        }

        private void ConfigureTray(bool visible)
        {
            var menu = new ContextMenuStrip();
            AddTrayItem(menu, "Show launcher", delegate { ShowLauncher(); });
            AddTrayItem(menu, "Open timer", delegate { OpenLocalTimer(); });
            AddTrayItem(menu, "Restart server", delegate { StartServer(false); });
            AddTrayItem(menu, "Create HTTPS certificate", delegate { ShowLauncher(); CreateHttpsCertificate(); });
            menu.Items.Add(new ToolStripSeparator());
            AddTrayItem(menu, "Stop and exit", delegate { StopAndExit(); });

            _tray.Icon = Icon;
            _tray.Text = "FDV Bouldering Timer";
            _tray.ContextMenuStrip = menu;
            _tray.Visible = visible;
            _tray.DoubleClick += delegate { ShowLauncher(); };
        }

        private static string T(string english) { return LauncherLanguage.Text(english); }

        private static void AddTrayItem(ContextMenuStrip menu, string text, EventHandler handler)
        {
            ToolStripItem item = menu.Items.Add(text, null, handler);
            item.Tag = text;
        }

        private void SetStatusText(string english)
        { _statusEnglish = english; _status.Text = T(english); }

        private void SetTrayText(string english)
        { _trayEnglish = english; _tray.Text = T(english); }

        private void ApplyLanguage()
        {
            _languageButton.Text = LauncherLanguage.Russian ? "EN" : "RU";
            _languageButton.AccessibleName = LauncherLanguage.Russian ? "Switch to English" : "Переключить на русский";
            _addressTitle.Text = T("Timer addresses");
            _logTitle.Text = T("Server log");
            _openButton.Text = T("Open timer");
            _copyButton.Text = T("Copy link");
            _restartButton.Text = T("Restart server");
            _stopButton.Text = T("Stop and exit");
            _certificateButton.Text = T("Create HTTPS certificate");
            _status.Text = T(_statusEnglish);
            _tray.Text = T(_trayEnglish);
            foreach (ToolStripItem item in _tray.ContextMenuStrip.Items)
                if (item.Tag is string) item.Text = T((string)item.Tag);
            PopulateAddresses(); // Preserve the selected URL; do not touch the server.
        }

        private void SwitchLanguage()
        {
            _languageIntentRevision++;
            LauncherLanguage.Russian = !LauncherLanguage.Russian;
            ApplyLanguage();
            if (!LauncherLanguage.Save(_languagePreferencePath))
                AppendLog("Could not save the launcher language preference.");
            QueueServerLanguage(false);
        }

        private void QueueServerLanguage(bool openBrowser)
        {
            _pendingServerLanguage = LauncherLanguage.Russian ? "ru" : "en";
            _openBrowserAfterLanguageSync = _openBrowserAfterLanguageSync || openBrowser;
            TrySyncServerLanguage();
        }

        private void TrySyncServerLanguage()
        {
            if (_allowClose || _languageSyncBusy || !_ready || _serverProcess == null || _pendingServerLanguage == null) return;
            string language = _pendingServerLanguage, token = _launcherLanguageToken;
            int port = _settings.HttpPort;
            Process process = _serverProcess;
            _pendingServerLanguage = null; _languageSyncBusy = true;
            _languageButton.Enabled = false;
            ThreadPool.QueueUserWorkItem(delegate
            {
                Exception failure = null;
                try { SendServerLanguage(port, token, language); }
                catch (Exception error) { failure = error; }
                try
                {
                    BeginInvoke(new MethodInvoker(delegate
                    {
                        _languageIntentRevision++;
                        _languageSyncBusy = false; _languageButton.Enabled = true;
                        if (_allowClose) return;
                        if (_serverProcess != process) { TrySyncServerLanguage(); return; }
                        if (failure != null) AppendLog("Could not change the timer language: " + failure.Message);
                        if (_pendingServerLanguage != null) { TrySyncServerLanguage(); return; }
                        if (_openBrowserAfterLanguageSync)
                        { _openBrowserAfterLanguageSync = false; OpenLocalTimer(); }
                    }));
                }
                catch (InvalidOperationException) { }
            });
        }

        internal static void SendServerLanguage(int port, string token, string language)
        {
            if (language != "ru" && language != "en") throw new ArgumentException("Invalid language");
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/launcher/language");
            request.Method = "POST"; request.Proxy = null; request.AllowAutoRedirect = false;
            request.Timeout = 7000; request.ReadWriteTimeout = 7000; request.KeepAlive = false;
            request.ContentType = "application/json";
            request.Headers["X-FDV-Launcher-Token"] = token;
            byte[] body = Encoding.UTF8.GetBytes("{\"language\":\"" + language + "\"}");
            request.ContentLength = body.Length;
            using (var stream = request.GetRequestStream()) stream.Write(body, 0, body.Length);
            using (var response = (HttpWebResponse)request.GetResponse())
                if (response.StatusCode != HttpStatusCode.OK) throw new IOException("Language command was not accepted");
        }

        private void AdoptServerLanguage(string[] state, long intentRevision)
        {
            if (!LauncherLanguage.ValidServerLanguage(state) || _allowClose ||
                intentRevision != _languageIntentRevision || _languageSyncBusy ||
                _pendingServerLanguage != null || OwnedForms.Length != 0) return;
            bool russian = state[0] == "ru";
            if (LauncherLanguage.Russian == russian) return;
            LauncherLanguage.Russian = russian;
            ApplyLanguage();
            if (!LauncherLanguage.Save(_languagePreferencePath))
                AppendLog("Could not save the launcher language preference.");
            // No POST here: adopting the server state must not echo a command.
        }

        private static string NewLanguageToken()
        {
            byte[] bytes = new byte[32];
            LanguageRandom.GetBytes(bytes);
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }

        private bool HasHttpsCertificate()
        {
            return HttpsCertificate.Exists(_baseDirectory);
        }

        private void CreateHttpsCertificate()
        {
            using (var dialog = new HttpsCertificateDialog(_baseDirectory))
            {
                dialog.ShowDialog(this);
                if (dialog.GeneratedDirectory != null) AppendLog(String.Format(T("HTTPS certificate created in {0}. Restart is required to apply it."), dialog.GeneratedDirectory));
                // Never interrupt the server or advertise a new HTTPS listener
                // merely because generation succeeded. Restart needs consent.
                if (dialog.RestartRequested) StartServer(false);
            }
        }

        private bool PopulateAddresses()
        {
            var selected = _addresses.SelectedItem as TimerAddress;
            var selectedUrl = selected == null ? null : selected.Url;
            var updatedAddresses = new List<TimerAddress>();
            AddAddress(updatedAddresses, T("Local HTTP"), "http://127.0.0.1:" + _settings.HttpPort + "/");
            if (_hasHttps) AddAddress(updatedAddresses, T("Local HTTPS"), "https://127.0.0.1:" + _settings.HttpsPort + "/");

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
                    AddAddress(updatedAddresses, type + " HTTP", "http://" + ip + ":" + _settings.HttpPort + "/");
                    if (_hasHttps) AddAddress(updatedAddresses, type + " HTTPS", "https://" + ip + ":" + _settings.HttpsPort + "/");
                }
            }
            if (HasSameAddresses(updatedAddresses)) return false;

            _addresses.Items.Clear();
            foreach (var address in updatedAddresses) _addresses.Items.Add(address);
            var selectedIndex = -1;
            if (selectedUrl != null)
            {
                for (var index = 0; index < _addresses.Items.Count; index++)
                {
                    var item = _addresses.Items[index] as TimerAddress;
                    if (item != null && item.Url == selectedUrl)
                    {
                        selectedIndex = index;
                        break;
                    }
                }
            }
            if (_addresses.Items.Count > 0) _addresses.SelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
            return true;
        }

        private static string NetworkType(NetworkInterface network)
        {
            if (network.NetworkInterfaceType == NetworkInterfaceType.Wireless80211) return "Wi-Fi";
            if (network.NetworkInterfaceType == NetworkInterfaceType.Ethernet ||
                network.NetworkInterfaceType == NetworkInterfaceType.GigabitEthernet ||
                network.NetworkInterfaceType == NetworkInterfaceType.FastEthernetFx ||
                network.NetworkInterfaceType == NetworkInterfaceType.FastEthernetT) return "Ethernet";
            return T("Network");
        }

        private bool HasSameAddresses(List<TimerAddress> updatedAddresses)
        {
            if (_addresses.Items.Count != updatedAddresses.Count) return false;
            var current = new HashSet<string>(StringComparer.Ordinal);
            foreach (var item in _addresses.Items)
            {
                var address = item as TimerAddress;
                if (address == null) return false;
                current.Add(AddressKey(address));
            }
            foreach (var address in updatedAddresses)
            {
                if (!current.Contains(AddressKey(address))) return false;
            }
            return true;
        }

        private static string AddressKey(TimerAddress address)
        {
            return address.Label + "\u001f" + address.Url;
        }

        private static void AddAddress(List<TimerAddress> addresses, string label, string url)
        {
            addresses.Add(new TimerAddress { Label = label, Url = url });
        }

        private void OnNetworkAddressChanged(object sender, EventArgs args)
        {
            if (_allowClose || IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke(new MethodInvoker(delegate
                {
                    if (_allowClose) return;
                    // Windows can report several interface changes for one
                    // connection. Coalesce them instead of polling the network.
                    _networkRefreshTimer.Stop();
                    _networkRefreshTimer.Start();
                }));
            }
            catch (InvalidOperationException) { }
        }

        private void RefreshNetworkAddresses(object sender, EventArgs args)
        {
            _networkRefreshTimer.Stop();
            if (_allowClose) return;
            if (PopulateAddresses()) AppendLog("Network addresses changed.");
        }

        private void StartServer(bool openBrowser)
        {
            _pendingServerLanguage = null; _openBrowserAfterLanguageSync = false;
            _startupTimer.Stop();
            _healthTimer.Stop();
            _restartTimer.Stop();
            _ready = false;
            _intentionalStop = true;
            _openButton.Enabled = false;
            SetStatusText("Starting server...");
            _status.ForeColor = Color.FromArgb(255, 200, 87);
            AppendLog("Starting server...");

            StopServerProcess();
            StopPortListeners();
            _settings = LauncherSettings.Load(_baseDirectory);
            UpdateBuildNumber("");
            _hasHttps = HasHttpsCertificate();
            PopulateAddresses();
            // Also stop a stale listener if the configured ports changed.
            StopPortListeners();
            _intentionalStop = false;

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
                _launcherLanguageToken = NewLanguageToken();
                start.EnvironmentVariables["FDV_LAUNCHER_LANGUAGE_TOKEN"] = _launcherLanguageToken;
                start.StandardOutputEncoding = Encoding.UTF8;
                start.StandardErrorEncoding = Encoding.UTF8;

                _serverProcess = new Process();
                _serverProcess.StartInfo = start;
                _serverProcess.EnableRaisingEvents = true;
                _serverProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) AppendRawLog(args.Data); };
                _serverProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { if (args.Data != null) AppendRawLog(args.Data); };
                _serverProcess.Exited += OnServerProcessExited;
                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();
                AppendLog("Using Node.js: " + nodePath);

                _startupAttempts = 0;
                _healthFailures = 0;
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
            if (CanReach("http://127.0.0.1:" + _settings.HttpPort + "/api/state", true))
            {
                _startupTimer.Stop();
                _ready = true;
                _restartAttempts = 0;
                _healthFailures = 0;
                _openButton.Enabled = true;
                SetStatusText("Server is running");
                _status.ForeColor = Color.FromArgb(87, 211, 140);
                SetTrayText("FDV Bouldering Timer - running");
                AppendLog("Server is ready.");
                AppendLog("Keep this computer connected to power and disable sleep while the timer is running.");
                _healthTimer.Start();
                bool openBrowser = _startupTimer.Tag is bool && (bool)_startupTimer.Tag;
                if (_serverLanguageAvailable && _pendingServerLanguage == null)
                { if (openBrowser) OpenLocalTimer(); }
                else QueueServerLanguage(openBrowser); // Compatibility with older servers.
                return;
            }

            if (_serverProcess == null || _serverProcess.HasExited || _startupAttempts >= 30)
            {
                _startupTimer.Stop();
                SetError("The server did not start. Check the server log and configured ports.");
                ScheduleServerRestart("server did not become ready");
            }
        }

        private void UpdateBuildNumber(string state)
        {
            var match = Regex.Match(state, "\"buildNumber\"\\s*:\\s*([0-9]+)(?=\\s*[,}])");
            _buildLabel.Text = match.Success ? "(" + match.Groups[1].Value + ")" : "";
            Text = "FDV Bouldering Timer" + (match.Success ? "   " + _buildLabel.Text : "");
        }

        private bool CanReach(string url, bool readBuildNumber = false)
        {
            _serverLanguageAvailable = false;
            long intentRevision = _languageIntentRevision;
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 250;
                request.ReadWriteTimeout = 250;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        string[] state = new string[] { response.Headers["X-FDV-Language"],
                            response.Headers["X-FDV-Server-Instance"], response.Headers["X-FDV-State-Version"] };
                        _serverLanguageAvailable = LauncherLanguage.ValidServerLanguage(state);
                        AdoptServerLanguage(state, intentRevision);
                    }
                    if (response.StatusCode == HttpStatusCode.OK && readBuildNumber)
                    {
                        using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                            UpdateBuildNumber(reader.ReadToEnd());
                    }
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private void CheckServerHealth(object sender, EventArgs args)
        {
            if (_allowClose || !_ready) return;
            if (_serverProcess == null || _serverProcess.HasExited)
            {
                ScheduleServerRestart("server process exited");
                return;
            }

            if (CanReach("http://127.0.0.1:" + _settings.HttpPort + "/api/state"))
            {
                _healthFailures = 0;
                return;
            }

            _healthFailures++;
            if (_healthFailures < 6) return;
            AppendLog(String.Format(T("Health check failed for {0} seconds; restarting server."), _healthFailures));
            ScheduleServerRestart("server health check failed");
        }

        private void ScheduleServerRestart(string reason)
        {
            if (_allowClose) return;
            _startupTimer.Stop();
            _healthTimer.Stop();
            _restartTimer.Stop();
            _ready = false;
            _openButton.Enabled = false;
            SetStatusText("Restarting server...");
            _status.ForeColor = Color.FromArgb(255, 200, 87);
            SetTrayText("FDV Bouldering Timer - restarting");
            AppendLog("Scheduling server restart: " + reason);

            _intentionalStop = true;
            StopServerProcess();
            _intentionalStop = false;

            _restartAttempts++;
            var delay = RestartDelayMs(_restartAttempts);
            if (_restartAttempts >= 5)
            {
                SetStatusText("Server is restarting repeatedly; check the log.");
                AppendLog("Crash-loop warning: multiple restarts in a row.");
            }
            _restartTimer.Interval = delay;
            _restartTimer.Start();
        }

        private static int RestartDelayMs(int attempt)
        {
            if (attempt <= 1) return 500;
            if (attempt == 2) return 1000;
            if (attempt == 3) return 2000;
            return 5000;
        }

        private void RestartTimerTick(object sender, EventArgs args)
        {
            _restartTimer.Stop();
            StartServer(false);
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
#if FDV_LEGACY_WINDOWS
            // Windows 7 has no NetTCPIP cmdlets. Stop only our tracked child;
            // never kill an unrelated listener by its port on this build.
            return;
#else
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
#endif
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
            if (_allowClose || _intentionalStop) return;
            _ready = false;
            _openButton.Enabled = false;
            SetStatusText("Server stopped unexpectedly");
            _status.ForeColor = Color.FromArgb(240, 90, 89);
            SetTrayText("FDV Bouldering Timer - stopped");
            ScheduleServerRestart("server process exited unexpectedly");
        }

        private void OnServerProcessExited(object sender, EventArgs args)
        {
            var exitedProcess = sender as Process;
            try
            {
                BeginInvoke(new MethodInvoker(delegate
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
                MessageBox.Show(error.Message, T("Unable to open browser"), MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                    T("Windows clipboard is busy. Wait a moment and click Copy link again."),
                    T("Unable to copy link"),
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private void SetError(string message)
        {
            _ready = false;
            _openButton.Enabled = false;
            SetStatusText(message);
            _status.ForeColor = Color.FromArgb(240, 90, 89);
            SetTrayText("FDV Bouldering Timer - error");
            AppendLog(message);
        }

        private void AppendLog(string message)
        {
            AppendRawLog(T(message));
        }

        private void AppendRawLog(string message)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action<string>(AppendRawLog), message);
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

        protected override void WndProc(ref Message message)
        {
            if (Program.ShowLauncherMessage != 0 && (uint)message.Msg == Program.ShowLauncherMessage)
            { ShowLauncher(); return; }
            base.WndProc(ref message);
        }

        private void StopAndExit()
        {
            PrepareExit();
            Close();
        }

        private void PrepareExit()
        {
            if (_allowClose) return;
            _allowClose = true;
            StopNetworkMonitoring();
            _startupTimer.Stop();
            _healthTimer.Stop();
            _restartTimer.Stop();
            _intentionalStop = true;
            StopServerProcess();
            _tray.Visible = false;
        }

        private void OnFormClosing(object sender, FormClosingEventArgs args)
        {
            if (_allowClose) return;
            if (args.CloseReason == CloseReason.WindowsShutDown || args.CloseReason == CloseReason.TaskManagerClosing
                || args.CloseReason == CloseReason.ApplicationExitCall)
            { PrepareExit(); return; }
            args.Cancel = true;
            Hide();
            _tray.ShowBalloonTip(1800, "FDV Bouldering Timer", T("The server is still running. Use the tray icon to open or stop it."), ToolTipIcon.Info);
        }

        private void StopNetworkMonitoring()
        {
            _networkRefreshTimer.Stop();
            NetworkChange.NetworkAddressChanged -= OnNetworkAddressChanged;
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                StopNetworkMonitoring();
                _startupTimer.Dispose();
                _healthTimer.Dispose();
                _restartTimer.Dispose();
                _networkRefreshTimer.Dispose();
                _tray.Dispose();
                if (_serverProcess != null) _serverProcess.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
