using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

namespace FdvBoulderingTimerLauncher
{
    // Called only on a worker thread. No reference to server state/processes.
    internal static class LauncherUpdates
    {
        internal const string ReleasePage = "https://github.com/dfedorov-arch/fdv-bouldering-timer/releases/latest";
        internal static string Run(string node, string root)
        {
            try
            {
                if (String.IsNullOrEmpty(node)) return "unavailable";
                var script = Path.Combine(Path.Combine(root, "lib"), "launcher-updates.js");
                var start = new ProcessStartInfo();
                start.FileName = node;
                start.Arguments = "\"" + script + "\"";
                start.WorkingDirectory = root;
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                start.RedirectStandardOutput = true;
                using (var child = Process.Start(start))
                {
                    if (child == null) return "unavailable";
                    // Only our own checker is terminated, never the server.
                    if (!child.WaitForExit(10000)) { try { child.Kill(); } catch { } return "unavailable"; }
                    var result = child.StandardOutput.ReadToEnd().Trim();
                    if (result == "current") return result;
                    if (Regex.IsMatch(result, @"\Aavailable\|v?[0-9]+\.[0-9]+\.[0-9]+\z")) return result;
                }
            }
            catch { } // Offline/missing runtime/closing window cannot affect timer.
            return "unavailable";
        }
    }
}
