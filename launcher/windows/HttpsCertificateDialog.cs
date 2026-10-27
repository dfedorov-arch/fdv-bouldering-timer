using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace FdvBoulderingTimerLauncher
{
    internal sealed class HttpsCertificateDialog : Form
    {
        private readonly string _root;
        private readonly TextBox _names = new TextBox();
        private readonly Label _status = new Label();
        private readonly Button _create = new CertificateButton();
        private readonly Button _folder = new CertificateButton();
        private readonly Button _close = new CertificateButton();
        private bool _busy;
        internal bool RestartRequested;
        internal string GeneratedDirectory;

        // Native disabled-button text follows the Windows theme, which can be
        // nearly black on our dark dialog. Keep actual Enabled semantics, but
        // render that state with an explicit contrasting palette (also on CLR2).
        private sealed class CertificateButton : Button
        {
            internal static readonly Color DisabledText = Color.FromArgb(170, 181, 196);

            internal CertificateButton()
            {
                FlatStyle = FlatStyle.Flat;
                UseVisualStyleBackColor = false;
                BackColor = Color.FromArgb(35, 43, 55);
                ForeColor = Color.FromArgb(244, 247, 251);
                FlatAppearance.BorderColor = Color.FromArgb(111, 126, 147);
                FlatAppearance.MouseOverBackColor = Color.FromArgb(48, 61, 77);
                FlatAppearance.MouseDownBackColor = Color.FromArgb(57, 74, 93);
            }

            protected override void OnPaint(PaintEventArgs args)
            {
                if (Enabled) { base.OnPaint(args); return; }
                args.Graphics.Clear(Color.FromArgb(29, 35, 44));
                using (var border = new Pen(Color.FromArgb(75, 87, 104)))
                    args.Graphics.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
                TextRenderer.DrawText(args.Graphics, Text, Font, ClientRectangle, DisabledText,
                    TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
            }
        }

        internal HttpsCertificateDialog(string root)
        {
            _root = root;
            Text = LauncherLanguage.Text("HTTPS certificate");
            StartPosition = FormStartPosition.CenterParent;
            MinimumSize = new Size(580, 560); ClientSize = new Size(680, 650);
            AutoScaleMode = AutoScaleMode.Font;
            Font = new Font("Segoe UI", 9F);
            BackColor = Color.FromArgb(23, 27, 34); ForeColor = Color.FromArgb(244, 247, 251);
            MaximizeBox = false; MinimizeBox = false; ShowInTaskbar = false;
            var layout = new TableLayoutPanel();
            layout.Dock = DockStyle.Fill; layout.Padding = new Padding(16); layout.ColumnCount = 1; layout.RowCount = 6;
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            for (int row = 2; row < 6; row++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            Controls.Add(layout);
            layout.Controls.Add(Label(LauncherLanguage.Text("Server IP addresses and DNS names, one per line.\nRemove unused entries and add the addresses your devices use.")), 0, 0);
            _names.Name = "certificateNames"; _names.Dock = DockStyle.Fill; _names.Multiline = true;
            _names.ScrollBars = ScrollBars.Vertical; _names.AcceptsReturn = true;
            _names.BackColor = Color.FromArgb(16, 20, 27); _names.ForeColor = ForeColor;
            _names.Text = String.Join(Environment.NewLine, HttpsCertificate.DefaultNames());
            layout.Controls.Add(_names, 0, 1);
            layout.Controls.Add(Label(LauncherLanguage.Text("Self-signed certificate: RSA 2048 / SHA-256, valid for 365 days.\nKeep localhost, 127.0.0.1 and ::1 for local access. Generation does not change DNS, firewall or device trust.")), 0, 2);
            layout.Controls.Add(Label((LauncherLanguage.Text("Directory: ")) + HttpsCertificate.PreferredDirectory(root)
                + (LauncherLanguage.Text("\nA user directory is used if this location is not writable."))), 0, 3);
            _status.Name = "certificateStatus"; _status.AutoSize = true; _status.Dock = DockStyle.Fill;
            _status.Margin = new Padding(3, 10, 3, 10);
            _status.Text = LauncherLanguage.Text("The server keeps running during generation. HTTPS uses the new certificate only after a separately confirmed restart.");
            layout.Controls.Add(_status, 0, 4);
            var actions = new FlowLayoutPanel(); actions.AutoSize = true; actions.Dock = DockStyle.Fill; actions.WrapContents = true;
            _create.Name = "createCertificate"; _create.Text = LauncherLanguage.Text("Create certificate");
            _create.AutoSize = true; _create.MinimumSize = new Size(155, 34); _create.Click += Generate;
            _folder.Name = "openCertificateFolder"; _folder.Text = LauncherLanguage.Text("Open directory");
            _folder.AutoSize = true; _folder.MinimumSize = new Size(155, 34); _folder.Enabled = false;
            _folder.Click += delegate { if (GeneratedDirectory != null) Process.Start(new ProcessStartInfo(GeneratedDirectory) { UseShellExecute = true }); };
            _close.Text = LauncherLanguage.Text("Close"); _close.AutoSize = true; _close.MinimumSize = new Size(100, 34);
            _close.Click += delegate { Close(); };
            actions.Controls.Add(_create); actions.Controls.Add(_folder); actions.Controls.Add(_close);
            layout.Controls.Add(actions, 0, 5);
            FormClosing += delegate(object sender, FormClosingEventArgs args) { if (_busy) args.Cancel = true; };
        }

        private static Label Label(string text)
        {
            var label = new Label(); label.Text = text; label.AutoSize = true; label.Dock = DockStyle.Fill;
            label.Margin = new Padding(3, 6, 3, 6); return label;
        }

        private void Generate(object sender, EventArgs args)
        {
            string[] names;
            try { names = HttpsCertificate.NormalizeNames(_names.Text); }
            catch (Exception error) { ShowError(error.Message); return; }
            bool replace = HttpsCertificate.Exists(_root);
            if (replace && MessageBox.Show(this, LauncherLanguage.Text("A certificate already exists. Create a new one and replace the active certificate after restart?\n\nPrevious files created here are kept as .backup files. Device trust must be configured again."),
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            _busy = true; _create.Enabled = false; _close.Enabled = false; _names.Enabled = false;
            _status.ForeColor = ForeColor; _status.Text = LauncherLanguage.Text("Creating certificate… The server keeps running.");
            ThreadPool.QueueUserWorkItem(delegate
            {
                string directory = null; Exception failure = null;
                try { directory = HttpsCertificate.Generate(_root, names, replace); }
                catch (Exception error) { failure = error; }
                try { BeginInvoke(new MethodInvoker(delegate { Completed(directory, failure); })); }
                catch (InvalidOperationException) { }
            });
        }

        private void Completed(string directory, Exception failure)
        {
            _busy = false; _create.Enabled = true; _close.Enabled = true; _names.Enabled = true;
            if (failure != null) { ShowError(failure.Message); return; }
            GeneratedDirectory = directory; _folder.Enabled = true; _status.ForeColor = Color.FromArgb(38, 208, 124);
            _status.Text = (LauncherLanguage.Text("Certificate created: ")) + directory + Environment.NewLine
                + (LauncherLanguage.Text("timer-public.cer is the public certificate for configuring trust.\ntimer-cert.pfx contains the private key: do not share it with displays.\nConfigure trust on devices and in Node.js on both servers."));
            if (MessageBox.Show(this, LauncherLanguage.Text("Restart the server now to apply the HTTPS certificate?\n\nBrowser connections will be interrupted temporarily. During a competition choose No and restart later."),
                Text, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.Yes)
            { RestartRequested = true; DialogResult = DialogResult.OK; Close(); }
        }

        private void ShowError(string error)
        {
            _status.ForeColor = Color.FromArgb(240, 90, 89);
            _status.Text = LauncherLanguage.Text("Certificate operation failed: ") + error;
        }
    }
}
