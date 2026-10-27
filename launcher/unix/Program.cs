using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Controls.Primitives;
using Avalonia.Input.Platform;
using Avalonia.Layout;
using Avalonia.Logging;
using Avalonia.Media;
using Avalonia.Styling;
using Avalonia.Threading;
using Avalonia.Themes.Fluent;
using LauncherLanguage = FdvBoulderingTimerLauncher.LauncherLanguage;

namespace FdvBoulderingTimer.Launcher;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        LauncherLanguage.Load(LauncherLanguage.PreferencePath);
        using var instance = new LauncherInstance(() => Dispatcher.UIThread.Post(() =>
        {
            if (Application.Current?.ApplicationLifetime is IClassicDesktopStyleApplicationLifetime { MainWindow: LauncherWindow window })
                window.ShowLauncher();
        }));
        if (!instance.IsOwner)
        {
            if (!instance.ReopenExisting()) Console.Error.WriteLine(LauncherLanguage.Text("The launcher is already running. Open it from the tray or menu bar."));
            return;
        }
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    private static AppBuilder BuildAvaloniaApp()
    {
        return AppBuilder.Configure<LauncherApp>()
            .UsePlatformDetect()
            .LogToTrace();
    }
}

internal sealed class LauncherApp : Application
{
    public override void Initialize()
    {
        RequestedThemeVariant = ThemeVariant.Dark;
        Styles.Add(new FluentTheme());
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var window = new LauncherWindow();
            desktop.MainWindow = window;
            desktop.ShutdownRequested += (_, _) => window.PrepareExit();
            if (TryGetFeature(typeof(IActivatableLifetime)) is IActivatableLifetime activation)
                activation.Activated += (_, args) => { if (args.Kind == ActivationKind.Reopen) window.ShowLauncher(); };
        }
        base.OnFrameworkInitializationCompleted();
    }
}

internal sealed class LauncherSettings
{
    public int HttpPort { get; private set; } = 8008;
    public int HttpsPort { get; private set; } = 8443;
    public string PortableNodeMac { get; private set; } = "runtime/mac/bin/node";
    public string PortableNodeLinux { get; private set; } = "runtime/linux/bin/node";

    public static LauncherSettings Load(string baseDirectory)
    {
        var settings = new LauncherSettings();
        var path = Path.Combine(baseDirectory, "params.txt");
        if (!File.Exists(path)) return settings;

        foreach (var sourceLine in File.ReadAllLines(path, Encoding.UTF8))
        {
            var line = sourceLine.Trim();
            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
            var separator = line.IndexOf('=');
            if (separator <= 0) continue;

            var key = line[..separator].Trim().ToLowerInvariant();
            var value = line[(separator + 1)..].Trim();
            if (key == "http_port" && int.TryParse(value, out var httpPort) && IsPort(httpPort)) settings.HttpPort = httpPort;
            if (key == "https_port" && int.TryParse(value, out var httpsPort) && IsPort(httpsPort)) settings.HttpsPort = httpsPort;
            if (key == "portable_node_mac" && value.Length > 0) settings.PortableNodeMac = value;
            if (key == "portable_node_linux" && value.Length > 0) settings.PortableNodeLinux = value;
        }
        return settings;
    }

    public string PortableNodeForCurrentOs()
    {
        return RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? PortableNodeMac : PortableNodeLinux;
    }

    private static bool IsPort(int value)
    {
        return value > 0 && value <= 65535;
    }
}

internal sealed class TimerAddress
{
    public required string Label { get; init; }
    public required string Url { get; init; }

    public override string ToString()
    {
        return Label + "  " + Url;
    }
}

internal sealed class LauncherWindow : Window
{
    private const int MaximumStartupAttempts = 30;

    [DllImport("libSystem.B.dylib", EntryPoint = "removexattr", CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
    private static extern int RemoveExtendedAttribute(
        [MarshalAs(UnmanagedType.LPUTF8Str)] string path,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string name,
        int options);

    private readonly string _baseDirectory;
    private readonly string _languagePreferencePath;
    private LauncherSettings _settings;
    private bool _hasHttps;
    private readonly ListBox _addresses = new();
    private readonly TextBlock _status = new();
    private readonly TextBlock _buildLabel = new();
    private readonly TextBox _log = new();
    private readonly Button _openButton = new() { Content = "Open timer", IsEnabled = false };
    private readonly Button _copyButton = new() { Content = "Copy link", IsEnabled = false };
    private readonly Button _restartButton = new() { Content = "Restart server" };
    private readonly Button _stopButton = new() { Content = "Stop and exit" };
    private readonly Button _certificateButton = new() { Content = "Create HTTPS certificate" };
    private readonly Button _languageButton = new() { Name = "launcherLanguage" };
    private readonly TextBlock _addressTitle = new();
    private readonly TextBlock _logTitle = new();
    private readonly TextBlock _hint = new() { TextWrapping = TextWrapping.Wrap };
    private readonly TrayIcon _tray = new();
    private readonly List<(NativeMenuItem Item, string English)> _trayItems = new();
    private string _statusEnglish = "Preparing server...";
    private string? _pendingServerLanguage;
    private string _launcherLanguageToken = "";
    private bool _languageSyncBusy;
    private bool _initialStartRequested;
    private bool _openBrowserAfterLanguageSync;
    private HttpsCertificateDialog? _certificateDialog;
    private readonly HttpClient _languageClient = new(new SocketsHttpHandler
    { UseProxy = false, AllowAutoRedirect = false, ConnectTimeout = TimeSpan.FromSeconds(2) }) { Timeout = TimeSpan.FromSeconds(7) };
    private readonly DispatcherTimer _startupTimer = new() { Interval = TimeSpan.FromMilliseconds(300) };
    private readonly DispatcherTimer _healthTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _restartTimer = new();
    private readonly DispatcherTimer _networkRefreshTimer = new() { Interval = TimeSpan.FromMilliseconds(750) };
    private readonly HttpClient _healthClient = new(new SocketsHttpHandler
    {
        ConnectTimeout = TimeSpan.FromMilliseconds(500),
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
        UseProxy = false
    })
    {
        Timeout = Timeout.InfiniteTimeSpan
    };
    private CancellationTokenSource _probeCancellation = new();
    private Process? _serverProcess;
    private int _startupAttempts;
    private int _healthFailures;
    private int _restartAttempts;
    private bool _ready;
    private bool _allowClose;
    private bool _intentionalStop;
    private bool _openBrowserAfterStart = true;
    private bool _startupAccessNoticeShown;
    private bool _startupCheckInProgress;
    private bool _healthCheckInProgress;
    private int _probeGeneration;

    public LauncherWindow() : this(null, true) { }

    // Passive construction is used by headless UI regression tests only.
    internal LauncherWindow(string? baseDirectory, bool startAutomatically, Action? initialStartOverride = null)
    {
        _baseDirectory = baseDirectory ?? DetectBaseDirectory();
        _languagePreferencePath = startAutomatically ? LauncherLanguage.PreferencePath : Path.Combine(_baseDirectory, "launcher-language.txt");
        _settings = LauncherSettings.Load(_baseDirectory);
        _hasHttps = HasHttpsCertificate();

        Title = "FDV Bouldering Timer";
        SetLauncherIcon();
        Width = 660;
        Height = 585;
        MinWidth = 560;
        MinHeight = 515;
        Background = Brush(17, 23, 34);
        Foreground = Brush(244, 247, 251);
        FontFamily = new FontFamily("Arial");

        Content = BuildLayout();
        ConfigureTray();
        ApplyLanguage();

        Opened += (_, _) =>
        {
            // Avalonia raises Opened again after Hide/Show. Window restoration
            // must never re-enter startup or stop/restart the running child.
            if (_initialStartRequested) return;
            _initialStartRequested = true;
            if (initialStartOverride != null) initialStartOverride();
            else if (startAutomatically) StartServer(_openBrowserAfterStart);
        };
        Closing += OnClosing;
        _startupTimer.Tick += CheckServerReady;
        _healthTimer.Tick += CheckServerHealth;
        _restartTimer.Tick += RestartTimerTick;
        _networkRefreshTimer.Tick += RefreshNetworkAddresses;
        NetworkChange.NetworkAddressChanged += OnNetworkAddressChanged;
    }

    private static string DetectBaseDirectory()
    {
        var configuredBaseDirectory = Environment.GetEnvironmentVariable("FDV_TIMER_BASE_DIR");
        if (!string.IsNullOrWhiteSpace(configuredBaseDirectory) &&
            Directory.Exists(configuredBaseDirectory) &&
            File.Exists(Path.Combine(configuredBaseDirectory, "serve-bouldering-timer.js")))
        {
            return Path.GetFullPath(configuredBaseDirectory);
        }

        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        var contentsDirectory = directory.Parent;
        var appDirectory = contentsDirectory?.Parent;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX) &&
            string.Equals(directory.Name, "MacOS", StringComparison.Ordinal) &&
            string.Equals(contentsDirectory?.Name, "Contents", StringComparison.Ordinal) &&
            string.Equals(appDirectory?.Extension, ".app", StringComparison.OrdinalIgnoreCase) &&
            appDirectory is { Parent: not null } detectedAppDirectory)
        {
            return detectedAppDirectory.Parent.FullName;
        }
        return directory.FullName;
    }

    private void SetLauncherIcon()
    {
        foreach (var iconPath in new[]
        {
            Path.Combine(AppContext.BaseDirectory, "timer-launcher.png"),
            Path.Combine(_baseDirectory, "timer-launcher.png")
        })
        {
            try
            {
                if (File.Exists(iconPath))
                {
                    Icon = new WindowIcon(iconPath);
                    return;
                }
            }
            catch
            {
            }
        }
    }

    private Control BuildLayout()
    {
        var root = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,Auto,Auto,Auto,*,Auto"),
            Margin = new Thickness(24),
            RowSpacing = 14
        };

        var heading = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var title = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 14 };
        title.Children.Add(new TextBlock
        {
            Text = "FDV Bouldering Timer",
            FontSize = 24,
            FontWeight = FontWeight.Bold
        });
        _buildLabel.FontSize = 16;
        _buildLabel.VerticalAlignment = VerticalAlignment.Center;
        _buildLabel.Foreground = Brush(149, 161, 181);
        title.Children.Add(_buildLabel);
        heading.Children.Add(title);
        ConfigureButton(_languageButton, 46);
        _languageButton.Click += (_, _) => SwitchLanguage();
        Grid.SetColumn(_languageButton, 1);
        heading.Children.Add(_languageButton);
        root.Children.Add(heading);

        _status.Text = "Preparing server...";
        _status.Foreground = Brush(255, 200, 87);
        Grid.SetRow(_status, 1);
        root.Children.Add(_status);

        var addressPanel = new StackPanel { Spacing = 8 };
        _addressTitle.FontWeight = FontWeight.Bold;
        addressPanel.Children.Add(_addressTitle);
        _addresses.Height = 130;
        _addresses.Background = Brush(16, 20, 27);
        _addresses.Foreground = Brush(244, 247, 251);
        _addresses.DoubleTapped += (_, _) => OpenSelectedAddress();
        _addresses.SelectionChanged += (_, _) => _copyButton.IsEnabled = _addresses.SelectedItem != null;
        addressPanel.Children.Add(_addresses);
        Grid.SetRow(addressPanel, 2);
        root.Children.Add(addressPanel);

        var buttons = new WrapPanel
        {
            Orientation = Orientation.Horizontal,
        };
        ConfigureButton(_openButton, 96);
        ConfigureButton(_copyButton, 88);
        ConfigureButton(_restartButton, 120);
        ConfigureButton(_stopButton, 112);
        foreach (var button in new[] { _openButton, _copyButton, _restartButton, _stopButton }) button.Margin = new Thickness(0, 0, 8, 6);
        _openButton.Click += (_, _) => OpenSelectedAddress();
        _copyButton.Click += async (_, _) => await CopySelectedAddress();
        _restartButton.Click += (_, _) => StartServer(false);
        _stopButton.Click += (_, _) => StopAndExit();
        buttons.Children.Add(_openButton);
        buttons.Children.Add(_copyButton);
        buttons.Children.Add(_restartButton);
        buttons.Children.Add(_stopButton);
        Grid.SetRow(buttons, 3);
        root.Children.Add(buttons);

        ConfigureButton(_certificateButton, 210);
        _certificateButton.HorizontalAlignment = HorizontalAlignment.Left;
        _certificateButton.Click += async (_, _) => await CreateHttpsCertificate();
        Grid.SetRow(_certificateButton, 4);
        root.Children.Add(_certificateButton);

        var logPanel = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,*"),
            RowSpacing = 8
        };
        _logTitle.FontWeight = FontWeight.Bold;
        logPanel.Children.Add(_logTitle);
        _log.AcceptsReturn = true;
        _log.IsReadOnly = true;
        _log.Background = Brush(16, 20, 27);
        _log.Foreground = Brush(190, 200, 214);
        _log.FontFamily = new FontFamily("Consolas, monospace");
        _log.FontSize = 12;
        _log.SetValue(ScrollViewer.VerticalScrollBarVisibilityProperty, ScrollBarVisibility.Auto);
        Grid.SetRow(_log, 1);
        logPanel.Children.Add(_log);
        Grid.SetRow(logPanel, 5);
        root.Children.Add(logPanel);

        _hint.Foreground = Brush(149, 161, 181);
        Grid.SetRow(_hint, 6);
        root.Children.Add(_hint);

        return root;
    }

    private static void ConfigureButton(Button button, double minWidth)
    {
        button.MinWidth = minWidth;
        button.MinHeight = 32;
        button.Padding = new Thickness(12, 6);
        button.Background = Brush(31, 42, 58);
        button.Foreground = Brush(244, 247, 251);
        button.BorderBrush = Brush(70, 85, 108);
        button.BorderThickness = new Thickness(1);
        button.HorizontalContentAlignment = HorizontalAlignment.Center;
        button.VerticalContentAlignment = VerticalAlignment.Center;
    }

    private bool HasHttpsCertificate()
    {
        return HttpsCertificate.Exists(_baseDirectory);
    }

    private async Task CreateHttpsCertificate()
    {
        if (_certificateDialog != null) { _certificateDialog.Activate(); return; }
        _certificateButton.IsEnabled = false;
        try
        {
            var dialog = new HttpsCertificateDialog(_baseDirectory);
            _certificateDialog = dialog;
            await dialog.ShowDialog(this);
            if (dialog.GeneratedDirectory != null)
                AppendLog(string.Format(T("HTTPS certificate created in {0}. Restart is required to apply it."), dialog.GeneratedDirectory));
            // Do not advertise an HTTPS listener until a confirmed restart.
            if (dialog.RestartRequested && !_allowClose) StartServer(false);
        }
        catch (Exception error) { AppendLog("Unable to create HTTPS certificate: " + error.Message); }
        finally { _certificateDialog = null; _certificateButton.IsEnabled = true; }
    }

    private static string T(string english) => LauncherLanguage.Text(english);

    private void SetStatusText(string english) { _statusEnglish = english; _status.Text = T(english); _tray.ToolTipText = "FDV Bouldering Timer — " + T(english); }

    private void ApplyLanguage()
    {
        _languageButton.Content = LauncherLanguage.Russian ? "EN" : "RU";
        Avalonia.Automation.AutomationProperties.SetName(_languageButton, LauncherLanguage.Russian ? "Switch to English" : "Переключить на русский");
        _addressTitle.Text = T("Timer addresses"); _logTitle.Text = T("Server log");
        _openButton.Content = T("Open timer"); _copyButton.Content = T("Copy link");
        _restartButton.Content = T("Restart server"); _stopButton.Content = T("Stop and exit");
        _certificateButton.Content = T("Create HTTPS certificate");
        _status.Text = T(_statusEnglish);
        _tray.ToolTipText = "FDV Bouldering Timer — " + T(_statusEnglish);
        _hint.Text = T("Closing this window hides the launcher. The server keeps running. Use Stop and exit to stop it. Launch the app again to reopen the window.");
        foreach (var item in _trayItems) item.Item.Header = T(item.English);
        PopulateAddresses(); // Keep the selected URL, health probes and running child intact.
    }

    private void SwitchLanguage()
    {
        LauncherLanguage.Russian = !LauncherLanguage.Russian;
        ApplyLanguage();
        if (!LauncherLanguage.Save(_languagePreferencePath)) AppendLog("Could not save the launcher language preference.");
        QueueServerLanguage(false);
    }

    private void QueueServerLanguage(bool openBrowser)
    {
        _pendingServerLanguage = LauncherLanguage.Russian ? "ru" : "en";
        _openBrowserAfterLanguageSync |= openBrowser;
        _ = TrySyncServerLanguage();
    }

    private async Task TrySyncServerLanguage()
    {
        if (_allowClose || _languageSyncBusy || !_ready || _serverProcess == null || _pendingServerLanguage == null) return;
        var language = _pendingServerLanguage; var process = _serverProcess;
        var generation = _probeGeneration; var token = _launcherLanguageToken; var port = _settings.HttpPort;
        _pendingServerLanguage = null; _languageSyncBusy = true; _languageButton.IsEnabled = false;
        try { await LauncherLanguageCommand.SendAsync(_languageClient, port, token, language, _probeCancellation.Token); }
        catch (Exception error)
        {
            if (!_allowClose && generation == _probeGeneration && _serverProcess == process)
                AppendLog("Could not change the timer language: " + error.Message);
        }
        finally { _languageSyncBusy = false; _languageButton.IsEnabled = true; }
        if (_allowClose) return;
        if (_pendingServerLanguage != null) { _ = TrySyncServerLanguage(); return; }
        if (generation != _probeGeneration || _serverProcess != process) return;
        if (_openBrowserAfterLanguageSync) { _openBrowserAfterLanguageSync = false; OpenLocalTimer(); }
    }

    internal void ShowLauncher()
    {
        if (_allowClose) return;
        Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
        _certificateDialog?.Activate();
    }

    private void ConfigureTray()
    {
        var menu = new NativeMenu();
        void Add(string text, Action action)
        {
            var item = new NativeMenuItem(text); item.Click += (_, _) => action();
            menu.Items.Add(item); _trayItems.Add((item, text));
        }
        Add("Show launcher", ShowLauncher);
        Add("Open timer", OpenLocalTimer);
        Add("Restart server", () => StartServer(false));
        Add("Create HTTPS certificate", () => { ShowLauncher(); _ = CreateHttpsCertificate(); });
        menu.Items.Add(new NativeMenuItemSeparator());
        Add("Stop and exit", StopAndExit);
        _tray.Icon = Icon; _tray.Menu = menu; _tray.ToolTipText = "FDV Bouldering Timer";
        _tray.Clicked += (_, _) => ShowLauncher();
        _tray.IsVisible = true;
        if (Application.Current != null) TrayIcon.SetIcons(Application.Current, new TrayIcons { _tray });
    }

    private bool PopulateAddresses()
    {
        var selectedUrl = (_addresses.SelectedItem as TimerAddress)?.Url;
        var updatedAddresses = new List<TimerAddress>();
        AddAddress(updatedAddresses, "Local HTTP", "http://127.0.0.1:" + _settings.HttpPort + "/");
        if (_hasHttps) AddAddress(updatedAddresses, "Local HTTPS", "https://127.0.0.1:" + _settings.HttpsPort + "/");

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var network in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (network.OperationalStatus != OperationalStatus.Up) continue;
            foreach (var address in network.GetIPProperties().UnicastAddresses)
            {
                if (address.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                var ip = address.Address.ToString();
                if (IPAddress.IsLoopback(address.Address) || ip.StartsWith("169.254.", StringComparison.Ordinal) || !seen.Add(ip)) continue;
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
                if (_addresses.Items[index] is TimerAddress address && address.Url == selectedUrl)
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
        return network.NetworkInterfaceType switch
        {
            NetworkInterfaceType.Wireless80211 => "Wi-Fi",
            NetworkInterfaceType.Ethernet => "Ethernet",
            NetworkInterfaceType.GigabitEthernet => "Ethernet",
            NetworkInterfaceType.FastEthernetFx => "Ethernet",
            NetworkInterfaceType.FastEthernetT => "Ethernet",
            _ => "Network"
        };
    }

    private bool HasSameAddresses(List<TimerAddress> updatedAddresses)
    {
        if (_addresses.Items.Count != updatedAddresses.Count) return false;
        var current = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in _addresses.Items)
        {
            if (item is not TimerAddress address) return false;
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
        addresses.Add(new TimerAddress { Label = T(label), Url = url });
    }

    private void OnNetworkAddressChanged(object? sender, EventArgs args)
    {
        Dispatcher.UIThread.Post(() =>
        {
            if (_allowClose) return;
            // Interface changes often arrive in short bursts. Refresh once after
            // the network has settled instead of polling continuously.
            _networkRefreshTimer.Stop();
            _networkRefreshTimer.Start();
        });
    }

    private void RefreshNetworkAddresses(object? sender, EventArgs args)
    {
        _networkRefreshTimer.Stop();
        if (_allowClose) return;
        if (PopulateAddresses()) AppendLog("Network addresses changed.");
    }

    private void StartServer(bool openBrowser)
    {
        _pendingServerLanguage = null; _openBrowserAfterLanguageSync = false;
        BeginNewProbeCycle();
        _startupTimer.Stop();
        _healthTimer.Stop();
        _restartTimer.Stop();
        _ready = false;
        _intentionalStop = true;
        _openButton.IsEnabled = false;
        SetStatusText("Starting server...");
        _buildLabel.Text = "";
        Title = "FDV Bouldering Timer";
        _status.Foreground = Brush(255, 200, 87);
        AppendLog("Starting server...");

        StopServerProcess();
        StopPortListeners();
        _settings = LauncherSettings.Load(_baseDirectory);
        _hasHttps = HasHttpsCertificate();
        PopulateAddresses();
        // The configured ports may have changed since the previous start.
        StopPortListeners();
        _intentionalStop = false;

        var nodePath = FindNodeExecutable();
        if (nodePath == null)
        {
            SetError(NodeNotFoundMessage());
            return;
        }
        RemovePortableRuntimeQuarantine(nodePath);

        var serverScript = Path.Combine(_baseDirectory, "serve-bouldering-timer.js");
        if (!File.Exists(serverScript))
        {
            SetError(ServerScriptNotFoundMessage());
            return;
        }

        try
        {
            var start = new ProcessStartInfo
            {
                FileName = nodePath,
                WorkingDirectory = _baseDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.ArgumentList.Add(serverScript);
            _launcherLanguageToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            start.Environment["FDV_LAUNCHER_LANGUAGE_TOKEN"] = _launcherLanguageToken;

            _serverProcess = new Process { StartInfo = start, EnableRaisingEvents = true };
            _serverProcess.OutputDataReceived += (_, args) => { if (args.Data != null) AppendLog(args.Data, technical: true); };
            _serverProcess.ErrorDataReceived += (_, args) => { if (args.Data != null) AppendLog(args.Data, technical: true); };
            _serverProcess.Exited += OnServerProcessExited;
            _serverProcess.Start();
            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();
            AppendLog("Using Node.js: " + nodePath);

            _startupAttempts = 0;
            _healthFailures = 0;
            _startupAccessNoticeShown = false;
            _openBrowserAfterStart = openBrowser;
            _startupTimer.Start();
        }
        catch (Exception error)
        {
            SetError("Unable to start server: " + error.Message);
        }
    }

    private string NodeNotFoundMessage()
    {
        if (IsProbablyTranslocatedMacApp())
        {
            return "Node.js was not found because macOS started the app from a temporary translocated folder. Start fdv-bouldering-timer from the archive folder instead, or remove quarantine from the extracted folder.";
        }
        return "Node.js was not found. Check portable_node_mac/portable_node_linux in params.txt or install Node.js LTS.";
    }

    private string ServerScriptNotFoundMessage()
    {
        if (IsProbablyTranslocatedMacApp())
        {
            return "serve-bouldering-timer.js was not found because macOS started the app from a temporary translocated folder. Start fdv-bouldering-timer from the archive folder instead, or remove quarantine from the extracted folder.";
        }
        return "serve-bouldering-timer.js was not found next to the launcher.";
    }

    private static bool IsProbablyTranslocatedMacApp()
    {
        return RuntimeInformation.IsOSPlatform(OSPlatform.OSX) &&
            AppContext.BaseDirectory.Contains("/AppTranslocation/", StringComparison.OrdinalIgnoreCase);
    }

    private async void CheckServerReady(object? sender, EventArgs args)
    {
        if (_allowClose || _startupCheckInProgress) return;
        _startupCheckInProgress = true;
        var generation = _probeGeneration;
        try
        {
            _startupAttempts++;
            string build = "";
            var reachable = await CanReach(
                "http://127.0.0.1:" + _settings.HttpPort + "/api/state",
                _probeCancellation.Token, value => build = value);
            if (generation != _probeGeneration || _allowClose) return;
            if (reachable)
            {
                _buildLabel.Text = build.Length > 0 ? "(" + build + ")" : "";
                Title = "FDV Bouldering Timer" + (build.Length > 0 ? " (" + build + ")" : "");
                _startupTimer.Stop();
                _ready = true;
                _restartAttempts = 0;
                _healthFailures = 0;
                _openButton.IsEnabled = true;
                SetStatusText("Server is running");
                _status.Foreground = Brush(87, 211, 140);
                AppendLog("Server is ready.");
                AppendLog("Keep this computer connected to power and disable sleep while the timer is running.");
                _healthTimer.Start();
                QueueServerLanguage(_openBrowserAfterStart);
                return;
            }

            if (_serverProcess == null || _serverProcess.HasExited)
            {
                _startupTimer.Stop();
                return;
            }

            if (_startupAttempts >= MaximumStartupAttempts && !_startupAccessNoticeShown)
            {
                _startupTimer.Stop();
                _startupAccessNoticeShown = true;
                SetStatusText("Server process is running, but the local timer is unavailable");
                _status.Foreground = Brush(255, 200, 87);
                AppendLog("Node.js is running, but the launcher cannot reach the local timer. Click Restart server to try again.");
            }
        }
        finally
        {
            if (generation == _probeGeneration) _startupCheckInProgress = false;
        }
    }

    private async Task<bool> CanReach(string url, CancellationToken cancellationToken, Action<string>? readBuild = null)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromMilliseconds(750));
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            using var response = await _healthClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                timeout.Token);
            if (response.StatusCode == HttpStatusCode.OK && readBuild != null)
            {
                readBuild(LauncherBuildInfo.Read(await response.Content.ReadAsStringAsync(timeout.Token)));
            }
            return response.StatusCode == HttpStatusCode.OK;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
        catch (HttpRequestException)
        {
            return false;
        }
    }

    private async void CheckServerHealth(object? sender, EventArgs args)
    {
        if (_allowClose || !_ready || _healthCheckInProgress) return;
        if (_serverProcess == null || _serverProcess.HasExited)
        {
            ScheduleServerRestart("server process exited");
            return;
        }

        _healthCheckInProgress = true;
        var generation = _probeGeneration;
        try
        {
            var reachable = await CanReach(
                "http://127.0.0.1:" + _settings.HttpPort + "/api/state",
                _probeCancellation.Token);
            if (generation != _probeGeneration || _allowClose || !_ready) return;
            if (reachable)
            {
                _healthFailures = 0;
                return;
            }

            _healthFailures++;
            if (_healthFailures < 6) return;
            AppendLog(string.Format(T("Health check failed for {0} seconds; restarting server."), _healthFailures));
            ScheduleServerRestart("server health check failed");
        }
        finally
        {
            if (generation == _probeGeneration) _healthCheckInProgress = false;
        }
    }

    private void ScheduleServerRestart(string reason)
    {
        if (_allowClose) return;
        CancelPendingProbes();
        _startupTimer.Stop();
        _healthTimer.Stop();
        _restartTimer.Stop();
        _ready = false;
        _openButton.IsEnabled = false;
        SetStatusText("Restarting server...");
        _status.Foreground = Brush(255, 200, 87);
        AppendLog("Scheduling server restart: " + reason);

        _intentionalStop = true;
        StopServerProcess();
        _intentionalStop = false;

        _restartAttempts++;
        var delay = RestartDelay(_restartAttempts);
        if (_restartAttempts >= 5)
        {
            SetStatusText("Server is restarting repeatedly; check the log.");
            AppendLog("Crash-loop warning: multiple restarts in a row.");
        }
        _restartTimer.Interval = delay;
        _restartTimer.Start();
    }

    private static TimeSpan RestartDelay(int attempt)
    {
        return attempt switch
        {
            <= 1 => TimeSpan.FromMilliseconds(500),
            2 => TimeSpan.FromSeconds(1),
            3 => TimeSpan.FromSeconds(2),
            _ => TimeSpan.FromSeconds(5)
        };
    }

    private void RestartTimerTick(object? sender, EventArgs args)
    {
        _restartTimer.Stop();
        StartServer(false);
    }

    private string? FindNodeExecutable()
    {
        var portable = Environment.ExpandEnvironmentVariables(_settings.PortableNodeForCurrentOs().Trim('"'));
        if (!Path.IsPathRooted(portable)) portable = Path.Combine(_baseDirectory, portable);
        if (File.Exists(portable)) return Path.GetFullPath(portable);

        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var folder in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(folder.Trim().Trim('"'), "node");
                if (File.Exists(candidate)) return candidate;
            }
            catch
            {
            }
        }
        return null;
    }

    private void RemovePortableRuntimeQuarantine(string nodePath)
    {
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) return;

        try
        {
            var runtimeRoot = Path.GetFullPath(Path.Combine(_baseDirectory, "runtime", "mac"));
            var relativeNodePath = Path.GetRelativePath(runtimeRoot, Path.GetFullPath(nodePath));
            if (relativeNodePath == ".." ||
                relativeNodePath.StartsWith(".." + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            {
                return;
            }

            var removed = 0;
            foreach (var path in Directory.EnumerateFileSystemEntries(runtimeRoot, "*", SearchOption.AllDirectories).Prepend(runtimeRoot))
            {
                if (RemoveExtendedAttribute(path, "com.apple.quarantine", 0) == 0) removed++;
            }
            if (removed > 0) AppendLog("Prepared the portable Node.js runtime for macOS (removed quarantine).");
        }
        catch (Exception error)
        {
            AppendLog("Unable to prepare the portable Node.js runtime: " + error.Message);
        }
    }

    private void StopPortListeners()
    {
        foreach (var port in new[] { _settings.HttpPort, _settings.HttpsPort })
        {
            try
            {
                var pids = FindListenerPids(port).Distinct().ToArray();
                foreach (var pid in pids)
                {
                    try
                    {
                        Process.GetProcessById(pid).Kill();
                    }
                    catch
                    {
                    }
                }
            }
            catch (Exception error)
            {
                AppendLog(string.Format(T("Could not stop listeners on port {0}: {1}"), port, error.Message));
            }
        }
    }

    private static IEnumerable<int> FindListenerPids(int port)
    {
        if (CommandExists("lsof"))
        {
            foreach (var pid in RunAndReadLines("lsof", "-tiTCP:" + port, "-sTCP:LISTEN"))
            {
                if (int.TryParse(pid.Trim(), out var parsed)) yield return parsed;
            }
            yield break;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux) && CommandExists("fuser"))
        {
            foreach (var token in RunAndReadLines("fuser", port + "/tcp").SelectMany(line => line.Split(' ', StringSplitOptions.RemoveEmptyEntries)))
            {
                if (int.TryParse(token.Trim(), out var parsed)) yield return parsed;
            }
        }
    }

    private static bool CommandExists(string command)
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? "";
        return path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Any(folder => File.Exists(Path.Combine(folder, command)));
    }

    private static IEnumerable<string> RunAndReadLines(string fileName, params string[] arguments)
    {
        try
        {
            var info = new ProcessStartInfo
            {
                FileName = fileName,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            foreach (var argument in arguments) info.ArgumentList.Add(argument);
            using var process = Process.Start(info);
            if (process == null) yield break;
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(1500);
            foreach (var line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                yield return line;
            }
        }
        finally
        {
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
        catch
        {
        }
        finally
        {
            _serverProcess?.Dispose();
            _serverProcess = null;
        }
    }

    private void OnServerProcessExited(object? sender, EventArgs args)
    {
        Dispatcher.UIThread.Post(() =>
        {
            if (_allowClose || _intentionalStop) return;
            _ready = false;
            _openButton.IsEnabled = false;
            SetStatusText("Server stopped unexpectedly");
            _status.Foreground = Brush(240, 90, 89);
            ScheduleServerRestart("server process exited unexpectedly");
        });
    }

    private void OpenSelectedAddress()
    {
        if (_addresses.SelectedItem is not TimerAddress selected || !_ready) return;
        OpenUrl(selected.Url);
    }

    private void OpenLocalTimer()
    {
        if (!_ready) return;
        OpenUrl("http://127.0.0.1:" + _settings.HttpPort + "/");
    }

    private void OpenUrl(string url)
    {
        var command = RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "open" :
            CommandExists("xdg-open") ? "xdg-open" :
            CommandExists("gio") ? "gio" : "";
        if (command.Length == 0) { AppendLog("No supported browser opener was found."); return; }

        var info = new ProcessStartInfo { FileName = command, UseShellExecute = false };
        if (command == "gio") info.ArgumentList.Add("open");
        info.ArgumentList.Add(url);
        try { Process.Start(info); }
        catch (Exception error) { AppendLog("Unable to open browser: " + error.Message); }
    }

    private async Task CopySelectedAddress()
    {
        if (_addresses.SelectedItem is not TimerAddress selected) return;
        try
        {
            var clipboard = GetClipboard();
            if (clipboard != null)
            {
                await clipboard.SetTextAsync(selected.Url);
                AppendLog("Link copied: " + selected.Url);
            }
        }
        catch (Exception error)
        {
            AppendLog("Unable to copy link: " + error.Message);
        }
    }

    private IClipboard? GetClipboard()
    {
        return TopLevel.GetTopLevel(this)?.Clipboard;
    }

    private void SetError(string message)
    {
        _ready = false;
        _openButton.IsEnabled = false;
        SetStatusText(message);
        _status.Foreground = Brush(240, 90, 89);
        AppendLog(message);
    }

    private void AppendLog(string message, bool technical = false)
    {
        var text = technical ? message : T(message);
        Dispatcher.UIThread.Post(() =>
        {
            _log.Text += "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + text + Environment.NewLine;
            _log.CaretIndex = _log.Text.Length;
        });
    }

    private void StopAndExit()
    {
        PrepareExit();
        Close();
    }

    internal void PrepareExit()
    {
        if (_allowClose) return;
        _allowClose = true;
        CancelPendingProbes();
        StopNetworkMonitoring();
        _startupTimer.Stop();
        _healthTimer.Stop();
        _restartTimer.Stop();
        _intentionalStop = true;
        StopServerProcess();
        _tray.IsVisible = false; _tray.Dispose();
    }

    private void OnClosing(object? sender, WindowClosingEventArgs args)
    {
        if (_allowClose) return;
        if (args.CloseReason is WindowCloseReason.ApplicationShutdown or WindowCloseReason.OSShutdown) { PrepareExit(); return; }
        args.Cancel = true;
        if (_certificateDialog != null) { _certificateDialog.Activate(); return; }
        Hide(); // Same as Windows: only explicit Exit/OS shutdown stops the child.
    }

    private void BeginNewProbeCycle()
    {
        CancelPendingProbes();
        _probeCancellation.Dispose();
        _probeCancellation = new CancellationTokenSource();
    }

    private void CancelPendingProbes()
    {
        _probeGeneration++;
        _probeCancellation.Cancel();
        _startupCheckInProgress = false;
        _healthCheckInProgress = false;
    }

    private void StopNetworkMonitoring()
    {
        _networkRefreshTimer.Stop();
        NetworkChange.NetworkAddressChanged -= OnNetworkAddressChanged;
    }

    private static IBrush Brush(byte red, byte green, byte blue)
    {
        return new SolidColorBrush(Color.FromRgb(red, green, blue));
    }
}
