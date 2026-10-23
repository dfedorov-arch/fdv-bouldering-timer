using System;
using System.IO;
using System.Drawing;
using System.Globalization;
using System.Windows.Forms;
using FdvBoulderingTimerLauncher;

internal static class HttpsCertificateHarness
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args[0] == "names") Console.WriteLine(String.Join("|", HttpsCertificate.NormalizeNames(args[1])));
            else if (args[0] == "generate") Console.WriteLine(HttpsCertificate.Generate(args[1], HttpsCertificate.NormalizeNames(args[2]), args[3] == "replace", Path.Combine(args[1], "test-fallback")));
            else if (args[0] == "storage-error")
            {
                string fallback = Path.Combine(args[1], "test-fallback");
                int attempts = 0;
                string result = HttpsCertificate.Generate(args[1], HttpsCertificate.NormalizeNames(args[2]), args[3] == "replace", fallback,
                    delegate(string directory)
                    {
                        attempts++;
                        if (directory != fallback || args[4] == "both")
                        {
                            if (args[4] == "unsupported") throw new NotSupportedException("Filesystem has no ACL support");
                            if (args[4] == "bug") throw new ArgumentException("Unexpected test failure");
                            throw new InvalidOperationException("Method failed with unexpected error code 1.");
                        }
                        HttpsCertificate.PrepareDirectory(directory);
                    });
                if (attempts != 2) throw new Exception("Expected exactly one protected-directory fallback");
                Console.WriteLine(result);
            }
            else if (args[0] == "directory") Console.WriteLine(HttpsCertificate.PreferredDirectory(args[1]));
            else if (args[0] == "permissions")
            {
                string user = System.Security.Principal.WindowsIdentity.GetCurrent().User.Value;
                var rules = File.GetAccessControl(args[1]).GetAccessRules(true, true, typeof(System.Security.Principal.SecurityIdentifier));
                foreach (System.Security.AccessControl.FileSystemAccessRule rule in rules)
                    if (rule.IdentityReference.Value != user && rule.IdentityReference.Value != "S-1-5-18") throw new Exception("Unexpected key ACL identity");
                if (rules.Count < 2) throw new Exception("Missing owner/system key ACL");
                Console.WriteLine("private");
            }
            else if (args[0] == "render")
            {
                System.Threading.Thread.CurrentThread.CurrentUICulture = new CultureInfo(args[3]);
                LauncherLanguage.Russian = args[3] == "ru";
                Application.EnableVisualStyles();
                using (var dialog = new HttpsCertificateDialog(args[1]))
                {
                    dialog.StartPosition = FormStartPosition.Manual; dialog.Location = new Point(-10000, -10000);
                    dialog.Opacity = 0; dialog.Show(); dialog.PerformLayout(); Application.DoEvents();
                    Control[] names = dialog.Controls.Find("certificateNames", true);
                    if (names.Length != 1 || !names[0].Visible || names[0].Height < 60) throw new Exception("Certificate editor layout is invalid");
                    Control folder = dialog.Controls.Find("openCertificateFolder", true)[0];
                    if (folder.Enabled) throw new Exception("Folder must stay disabled before certificate creation");
                    // Check actual disabled rendering, not merely ForeColor:
                    // native Windows themes otherwise override the text color.
                    using (var buttonImage = new Bitmap(folder.Width, folder.Height))
                    {
                        folder.DrawToBitmap(buttonImage, new Rectangle(0, 0, folder.Width, folder.Height));
                        int textPixels = 0;
                        for (int y = 2; y < buttonImage.Height - 2; y++)
                            for (int x = 2; x < buttonImage.Width - 2; x++)
                                if (buttonImage.GetPixel(x, y).ToArgb() == Color.FromArgb(170, 181, 196).ToArgb()) textPixels++;
                        if (textPixels < 10) throw new Exception("Disabled folder button text is not readable");
                    }
                    using (var bitmap = new Bitmap(dialog.Width, dialog.Height))
                    { dialog.DrawToBitmap(bitmap, new Rectangle(0, 0, dialog.Width, dialog.Height)); bitmap.Save(args[2]); }
                    dialog.Close();
                }
            }
            else throw new ArgumentException("Unknown test mode");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.ToString()); return 1; }
    }
}
