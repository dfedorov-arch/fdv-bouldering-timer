using System.Diagnostics;

namespace FDVNativeAudio.Unix;

public static class UnixSpeech
{
    public static void Synthesize(string text, string language, string output)
    {
        var start = new ProcessStartInfo { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
        if (OperatingSystem.IsMacOS())
        {
            start.FileName = "/usr/bin/say";
            foreach (var arg in new[] { "--file-format=WAVE", "--data-format=LEI16@44100", "-v", language == "en" ? "Samantha" : "Milena", "-o", output, text }) start.ArgumentList.Add(arg);
        }
        else
        {
            start.FileName = File.Exists("/usr/bin/espeak-ng") ? "/usr/bin/espeak-ng" : "/usr/bin/espeak";
            foreach (var arg in new[] { "-v", language == "en" ? "en" : "ru", "-s", "150", "-w", output, text }) start.ArgumentList.Add(arg);
        }
        using var process = Process.Start(start) ?? throw new IOException("Native speech is unavailable");
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(7000)) { process.Kill(true); throw new TimeoutException("Native speech preparation timed out"); }
        Task.WhenAll(stdout, stderr).GetAwaiter().GetResult();
        if (process.ExitCode != 0 || !File.Exists(output)) throw new IOException("Native speech preparation failed");
    }
}
