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
using Avalonia.Threading;
using Avalonia.Themes.Fluent;

namespace FdvBoulderingTimer.Launcher;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
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
        Styles.Add(new FluentTheme());
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new LauncherWindow();
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
    private readonly string _baseDirectory;
    private readonly LauncherSettings _settings;
    private readonly bool _hasHttps;
    private readonly ListBox _addresses = new();
    private readonly TextBlock _status = new();
    private readonly TextBox _log = new();
    private readonly Button _openButton = new() { Content = "Open timer", IsEnabled = false };
    private readonly Button _copyButton = new() { Content = "Copy link", IsEnabled = false };
    private readonly Button _restartButton = new() { Content = "Restart server" };
    private readonly Button _stopButton = new() { Content = "Stop and exit" };
    private readonly DispatcherTimer _startupTimer = new() { Interval = TimeSpan.FromMilliseconds(300) };
    private Process? _serverProcess;
    private int _startupAttempts;
    private bool _ready;
    private bool _allowClose;
    private bool _openBrowserAfterStart = true;

    public LauncherWindow()
    {
        _baseDirectory = DetectBaseDirectory();
        _settings = LauncherSettings.Load(_baseDirectory);
        _hasHttps = HasHttpsCertificate();

        Title = "FDV Bouldering Timer";
        Width = 660;
        Height = 540;
        MinWidth = 560;
        MinHeight = 470;
        Background = Brush(17, 23, 34);
        Foreground = Brush(244, 247, 251);
        FontFamily = new FontFamily("Arial");

        Content = BuildLayout();
        PopulateAddresses();

        Opened += (_, _) => StartServer(_openBrowserAfterStart);
        Closing += OnClosing;
        _startupTimer.Tick += CheckServerReady;
    }

    private static string DetectBaseDirectory()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        var contentsDirectory = directory.Parent;
        var appDirectory = contentsDirectory?.Parent;
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX) &&
            string.Equals(directory.Name, "MacOS", StringComparison.Ordinal) &&
            string.Equals(contentsDirectory?.Name, "Contents", StringComparison.Ordinal) &&
            string.Equals(appDirectory?.Extension, ".app", StringComparison.OrdinalIgnoreCase) &&
            appDirectory.Parent != null)
        {
            return appDirectory.Parent.FullName;
        }
        return directory.FullName;
    }

    private Control BuildLayout()
    {
        var root = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,Auto,Auto,Auto,*,Auto"),
            Margin = new Thickness(24),
            RowSpacing = 14
        };

        root.Children.Add(new TextBlock
        {
            Text = "FDV Bouldering Timer",
            FontSize = 24,
            FontWeight = FontWeight.Bold
        });

        _status.Text = "Preparing server...";
        _status.Foreground = Brush(255, 200, 87);
        Grid.SetRow(_status, 1);
        root.Children.Add(_status);

        var addressPanel = new StackPanel { Spacing = 8 };
        addressPanel.Children.Add(new TextBlock { Text = "Timer addresses", FontWeight = FontWeight.Bold });
        _addresses.Height = 130;
        _addresses.Background = Brush(16, 20, 27);
        _addresses.Foreground = Brush(244, 247, 251);
        _addresses.DoubleTapped += (_, _) => OpenSelectedAddress();
        _addresses.SelectionChanged += (_, _) => _copyButton.IsEnabled = _addresses.SelectedItem != null;
        addressPanel.Children.Add(_addresses);
        Grid.SetRow(addressPanel, 2);
        root.Children.Add(addressPanel);

        var buttons = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Spacing = 8
        };
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

        var logPanel = new Grid
        {
            RowDefinitions = new RowDefinitions("Auto,*"),
            RowSpacing = 8
        };
        logPanel.Children.Add(new TextBlock { Text = "Server log", FontWeight = FontWeight.Bold });
        _log.AcceptsReturn = true;
        _log.IsReadOnly = true;
        _log.Background = Brush(16, 20, 27);
        _log.Foreground = Brush(190, 200, 214);
        _log.FontFamily = new FontFamily("Consolas, monospace");
        _log.FontSize = 12;
        _log.SetValue(ScrollViewer.VerticalScrollBarVisibilityProperty, ScrollBarVisibility.Auto);
        Grid.SetRow(_log, 1);
        logPanel.Children.Add(_log);
        Grid.SetRow(logPanel, 4);
        root.Children.Add(logPanel);

        var hint = new TextBlock
        {
            Text = "Closing this window stops the server. Use Restart server if you change ports or Node.js settings.",
            Foreground = Brush(149, 161, 181),
            TextWrapping = TextWrapping.Wrap
        };
        Grid.SetRow(hint, 5);
        root.Children.Add(hint);

        return root;
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
                if (IPAddress.IsLoopback(address.Address) || ip.StartsWith("169.254.", StringComparison.Ordinal) || !seen.Add(ip)) continue;
                var type = NetworkType(network);
                AddAddress(type + " HTTP", "http://" + ip + ":" + _settings.HttpPort + "/");
                if (_hasHttps) AddAddress(type + " HTTPS", "https://" + ip + ":" + _settings.HttpsPort + "/");
            }
        }
        if (_addresses.Items.Count > 0) _addresses.SelectedIndex = 0;
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

    private void AddAddress(string label, string url)
    {
        _addresses.Items.Add(new TimerAddress { Label = label, Url = url });
    }

    private void StartServer(bool openBrowser)
    {
        _startupTimer.Stop();
        _ready = false;
        _openButton.IsEnabled = false;
        _status.Text = "Starting server...";
        _status.Foreground = Brush(255, 200, 87);
        AppendLog("Starting server...");

        StopServerProcess();
        StopPortListeners();

        var nodePath = FindNodeExecutable();
        if (nodePath == null)
        {
            SetError("Node.js was not found. Check portable_node_mac/portable_node_linux in params.txt or install Node.js LTS.");
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
            var start = new ProcessStartInfo
            {
                FileName = nodePath,
                WorkingDirectory = _baseDirectory,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            start.ArgumentList.Add(serverScript);

            _serverProcess = new Process { StartInfo = start, EnableRaisingEvents = true };
            _serverProcess.OutputDataReceived += (_, args) => { if (args.Data != null) AppendLog(args.Data); };
            _serverProcess.ErrorDataReceived += (_, args) => { if (args.Data != null) AppendLog(args.Data); };
            _serverProcess.Exited += OnServerProcessExited;
            _serverProcess.Start();
            _serverProcess.BeginOutputReadLine();
            _serverProcess.BeginErrorReadLine();
            AppendLog("Using Node.js: " + nodePath);

            _startupAttempts = 0;
            _openBrowserAfterStart = openBrowser;
            _startupTimer.Start();
        }
        catch (Exception error)
        {
            SetError("Unable to start server: " + error.Message);
        }
    }

    private async void CheckServerReady(object? sender, EventArgs args)
    {
        _startupAttempts++;
        if (await CanReach("http://127.0.0.1:" + _settings.HttpPort + "/api/state"))
        {
            _startupTimer.Stop();
            _ready = true;
            _openButton.IsEnabled = true;
            _status.Text = "Server is running";
            _status.Foreground = Brush(87, 211, 140);
            AppendLog("Server is ready.");
            if (_openBrowserAfterStart) OpenLocalTimer();
            return;
        }

        if (_serverProcess == null || _serverProcess.HasExited || _startupAttempts >= 30)
        {
            _startupTimer.Stop();
            SetError("The server did not start. Check the server log and configured ports.");
        }
    }

    private static async Task<bool> CanReach(string url)
    {
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromMilliseconds(250) };
            using var response = await client.GetAsync(url);
            return response.StatusCode == HttpStatusCode.OK;
        }
        catch
        {
            return false;
        }
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
                AppendLog("Could not stop listeners on port " + port + ": " + error.Message);
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
            if (_allowClose) return;
            _ready = false;
            _openButton.IsEnabled = false;
            _status.Text = "Server stopped";
            _status.Foreground = Brush(240, 90, 89);
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

    private static void OpenUrl(string url)
    {
        var command = RuntimeInformation.IsOSPlatform(OSPlatform.OSX) ? "open" :
            CommandExists("xdg-open") ? "xdg-open" :
            CommandExists("gio") ? "gio" : "";
        if (command.Length == 0) return;

        var info = new ProcessStartInfo { FileName = command, UseShellExecute = false };
        if (command == "gio") info.ArgumentList.Add("open");
        info.ArgumentList.Add(url);
        Process.Start(info);
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
        _status.Text = message;
        _status.Foreground = Brush(240, 90, 89);
        AppendLog(message);
    }

    private void AppendLog(string message)
    {
        Dispatcher.UIThread.Post(() =>
        {
            _log.Text += "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message + Environment.NewLine;
            _log.CaretIndex = _log.Text.Length;
        });
    }

    private void StopAndExit()
    {
        _allowClose = true;
        _startupTimer.Stop();
        StopServerProcess();
        Close();
    }

    private void OnClosing(object? sender, WindowClosingEventArgs args)
    {
        if (_allowClose) return;
        _allowClose = true;
        _startupTimer.Stop();
        StopServerProcess();
    }

    private static IBrush Brush(byte red, byte green, byte blue)
    {
        return new SolidColorBrush(Color.FromRgb(red, green, blue));
    }
}
