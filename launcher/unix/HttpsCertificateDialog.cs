using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace FdvBoulderingTimer.Launcher;

internal sealed class HttpsCertificateDialog : Window
{
    private readonly string _root;
    private readonly TextBox _names = new() { Name = "certificateNames", AcceptsReturn = true, MinHeight = 100 };
    private readonly TextBlock _status = new() { Name = "certificateStatus", TextWrapping = TextWrapping.Wrap };
    private readonly Button _create = new() { Name = "createCertificate", Content = "Create certificate" };
    private readonly Button _folder = new() { Content = "Open directory", IsEnabled = false };
    private readonly Button _close = new() { Content = "Close" };
    private bool _busy;
    internal bool RestartRequested { get; private set; }
    internal string? GeneratedDirectory { get; private set; }

    internal HttpsCertificateDialog(string root)
    {
        _root = root;
        Title = "HTTPS certificate";
        Width = 720; Height = 700; MinWidth = 580; MinHeight = 600;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        Background = new SolidColorBrush(Color.FromRgb(17, 23, 34));
        var layout = new Grid { Margin = new Thickness(20), RowSpacing = 14,
            RowDefinitions = new RowDefinitions("Auto,*,Auto,Auto,Auto,Auto") };
        Add(layout, Label("Server IP addresses and DNS names, one per line.\nRemove unused entries and add the addresses your devices use."), 0);
        try { _names.Text = string.Join(Environment.NewLine, HttpsCertificate.DefaultNames()); }
        catch (Exception error)
        {
            _names.Text = "localhost\n127.0.0.1\n::1";
            _status.Text = "Could not enumerate network addresses. Add them manually: " + error.Message;
        }
        Add(layout, _names, 1);
        Add(layout, Label("Self-signed certificate: RSA 2048 / SHA-256, valid for 365 days.\nKeep localhost, 127.0.0.1 and ::1 for local access. Generation does not change DNS, firewall or device trust."), 2);
        Add(layout, Label("Directory: " + HttpsCertificate.PreferredDirectory(root) +
            "\nA user directory is used if this location is not writable."), 3);
        if (string.IsNullOrEmpty(_status.Text)) _status.Text = "The server keeps running during generation. Apply HTTPS later or confirm a separate restart.";
        Add(layout, _status, 4);
        var actions = new WrapPanel { Orientation = Orientation.Horizontal };
        foreach (var button in new[] { _create, _folder, _close })
        { button.MinHeight = 34; button.Margin = new Thickness(0, 0, 8, 6); actions.Children.Add(button); }
        Add(layout, actions, 5);
        Content = layout;
        _create.Click += async (_, _) => await Generate();
        _folder.Click += (_, _) =>
        {
            try
            {
                if (GeneratedDirectory == null) return;
                var start = new ProcessStartInfo(OperatingSystem.IsMacOS() ? "/usr/bin/open" : "xdg-open") { UseShellExecute = false };
                start.ArgumentList.Add(GeneratedDirectory);
                Process.Start(start);
            }
            catch (Exception error) { ShowError(error.Message); }
        };
        _close.Click += (_, _) => Close();
        Closing += (_, args) => { if (_busy) args.Cancel = true; };
    }

    private static TextBlock Label(string text) => new() { Text = text, TextWrapping = TextWrapping.Wrap };
    private static void Add(Grid grid, Control control, int row) { Grid.SetRow(control, row); grid.Children.Add(control); }

    private async Task Generate()
    {
        if (_busy) return;
        string[] names;
        try { names = HttpsCertificate.NormalizeNames(_names.Text ?? ""); }
        catch (Exception error) { ShowError(error.Message); return; }
        // Lock controls before either modal confirmation, not just RSA generation.
        _busy = true; _create.IsEnabled = false; _close.IsEnabled = false; _names.IsEnabled = false;
        try
        {
            var replace = HttpsCertificate.Exists(_root);
            if (replace && !await Confirm(this, "A certificate already exists. Create a new one and replace it after restart?\n\nPrevious managed files are kept as .backup files. Device trust must be configured again.")) return;
            _status.Foreground = Brushes.White;
            _status.Text = "Creating certificate… The server keeps running.";
            GeneratedDirectory = await Task.Run(() => HttpsCertificate.Generate(_root, names, replace));
            _folder.IsEnabled = true;
            _status.Foreground = new SolidColorBrush(Color.FromRgb(38, 208, 124));
            _status.Text = "Certificate created: " + GeneratedDirectory +
                "\ntimer-public.cer is the public certificate for configuring trust.\ntimer-cert.pfx contains the private key: do not share it with displays.\nConfigure trust on devices and in Node.js on both servers.";
            if (await Confirm(this, "Restart the server now to apply the HTTPS certificate?\n\nBrowser connections will be interrupted temporarily. During a competition choose No and restart later."))
            { RestartRequested = true; _busy = false; Close(); }
        }
        catch (Exception error) { ShowError(error.Message); }
        finally { _busy = false; _create.IsEnabled = true; _close.IsEnabled = true; _names.IsEnabled = true; }
    }

    private void ShowError(string message)
    {
        _status.Foreground = new SolidColorBrush(Color.FromRgb(240, 90, 89));
        _status.Text = "Certificate operation failed: " + message;
    }

    private static Task<bool> Confirm(Window owner, string text)
    {
        var dialog = new Window { Title = "HTTPS certificate", Width = 560, MinWidth = 420,
            SizeToContent = SizeToContent.Height, CanResize = false, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        var layout = new StackPanel { Margin = new Thickness(20), Spacing = 18 };
        layout.Children.Add(Label(text));
        var actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Spacing = 10 };
        var yes = new Button { Content = "Yes" };
        var no = new Button { Content = "No", IsCancel = true };
        yes.Click += (_, _) => dialog.Close(true);
        no.Click += (_, _) => dialog.Close(false);
        actions.Children.Add(yes); actions.Children.Add(no); layout.Children.Add(actions);
        dialog.Content = layout;
        dialog.Opened += (_, _) => no.Focus();
        return dialog.ShowDialog<bool>(owner);
    }
}
