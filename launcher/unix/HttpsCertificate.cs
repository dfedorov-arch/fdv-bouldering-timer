using System.Globalization;
using LauncherLanguage = FdvBoulderingTimerLauncher.LauncherLanguage;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace FdvBoulderingTimer.Launcher;

// No shell, OpenSSL, discovery traffic or trust-store changes. Locations and
// precedence must match lib/https-certificate-storage.js (including fallback).
internal static class HttpsCertificate
{
    private static string T(string english) => LauncherLanguage.Text(english);
    internal const string Password = "bouldering-timer";
    private const UnixFileMode DirectoryMode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute;
    private const UnixFileMode FileModePrivate = UnixFileMode.UserRead | UnixFileMode.UserWrite;

    internal static string UserDirectory()
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (OperatingSystem.IsMacOS()) return Path.Combine(home, "Library", "Application Support", "FDV Bouldering Timer", "https");
        var stateHome = Environment.GetEnvironmentVariable("XDG_STATE_HOME");
        if (string.IsNullOrEmpty(stateHome) || !Path.IsPathFullyQualified(stateHome)) stateHome = Path.Combine(home, ".local", "state");
        return Path.Combine(stateHome, "fdv-bouldering-timer", "https");
    }

    internal static string PreferredDirectory(string root, string? userDirectory = null) =>
        File.Exists(Path.Combine(root, "fdv-installed.marker")) ? userDirectory ?? UserDirectory() : Path.Combine(root, "https");

    private static string? ActivePfx(string root, string userDirectory)
    {
        foreach (var directory in new[] { PreferredDirectory(root, userDirectory), userDirectory })
        {
            var path = Path.Combine(directory, "timer-cert.pfx");
            if (File.Exists(path)) return path;
        }
        return null;
    }

    internal static bool Exists(string root, string? userDirectory = null) =>
        ActivePfx(root, userDirectory ?? UserDirectory()) != null || File.Exists(Path.Combine(root, "timer-cert.pfx")) ||
        (File.Exists(Path.Combine(root, "timer-key.pem")) && File.Exists(Path.Combine(root, "timer-cert.pem")));

    internal static string[] DefaultNames()
    {
        var names = new List<string> { "localhost", "127.0.0.1", "::1" };
        try { names.AddRange(NormalizeNames(Environment.MachineName)); } catch (ArgumentException) { }
        // Enumerate local interfaces only; never perform DNS or Bonjour requests.
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (adapter.OperationalStatus != OperationalStatus.Up) continue;
            foreach (var item in adapter.GetIPProperties().UnicastAddresses)
            {
                var ip = item.Address;
                if (IPAddress.IsLoopback(ip) || ip.IsIPv6LinkLocal || ip.IsIPv6Multicast ||
                    ip.ToString().StartsWith("169.254.", StringComparison.Ordinal)) continue;
                if (ip.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6) names.Add(ip.ToString());
            }
        }
        return NormalizeNames(string.Join('\n', names));
    }

    internal static string[] NormalizeNames(string text)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var token in text.Split(new[] { ' ', '\t', '\r', '\n', ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var name = token;
            if (name.Contains("://", StringComparison.Ordinal))
            {
                if (!Uri.TryCreate(name, UriKind.Absolute, out var url) || (url.Scheme != "http" && url.Scheme != "https") ||
                    url.UserInfo.Length != 0 || url.AbsolutePath != "/" || url.Query.Length != 0 || url.Fragment.Length != 0)
                    throw new ArgumentException(T("Invalid server address: ") + token);
                name = url.Host;
            }
            name = name.Trim('[', ']');
            if (IPAddress.TryParse(name, out var ip))
            {
                if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.IsIPv6LinkLocal || ip.IsIPv6Multicast || name.Contains('%'))
                    throw new ArgumentException(T("Use a reachable IP: ") + token);
                name = ip.ToString();
            }
            else
            {
                name = new IdnMapping().GetAscii(name.TrimEnd('.')).ToLowerInvariant();
                if (name.Length == 0 || name.Length > 253) throw new ArgumentException(T("Invalid DNS name: ") + token);
                foreach (var label in name.Split('.'))
                {
                    if (label.Length == 0 || label.Length > 63 || label[0] == '-' || label[^1] == '-' ||
                        label.Any(c => !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-')))
                        throw new ArgumentException(T("Invalid DNS name: ") + token);
                }
            }
            if (seen.Add(name)) names.Add(name);
            if (names.Count > 64) throw new ArgumentException(T("Maximum 64 names."));
        }
        if (names.Count == 0) throw new ArgumentException(T("Enter an IP or DNS name."));
        return names.ToArray();
    }

    internal static string Generate(string root, string[] names, bool replace, string? userDirectory = null,
        Action<string>? prepareDirectory = null)
    {
        if (OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Use the Windows launcher certificate generator.");
        names = NormalizeNames(string.Join('\n', names));
        userDirectory ??= UserDirectory();
        if (!replace && Exists(root, userDirectory)) throw new IOException(T("A certificate already exists."));
        var active = ActivePfx(root, userDirectory);
        var destination = active == null ? PreferredDirectory(root, userDirectory) : Path.GetDirectoryName(active)!;
        prepareDirectory ??= PrepareDirectory;
        try { prepareDirectory(destination); }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            // A higher-priority active portable PFX must never be silently left
            // active while a replacement is written to a lower-priority path.
            if (active != null || destination == userDirectory) throw;
            destination = userDirectory;
            prepareDirectory(destination);
        }
        var lockPath = Path.Combine(destination, ".generation.lock");
        using var generationLock = new FileStream(lockPath, new FileStreamOptions {
            Mode = FileMode.OpenOrCreate, Access = FileAccess.ReadWrite, Share = FileShare.None, UnixCreateMode = FileModePrivate });
        if (!replace && Exists(root, userDirectory)) throw new IOException(T("A certificate already exists."));
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=FDV Bouldering Timer", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var san = new SubjectAlternativeNameBuilder();
        foreach (var name in names)
        {
            if (IPAddress.TryParse(name, out var ip)) san.AddIpAddress(ip);
            else san.AddDnsName(name);
        }
        request.CertificateExtensions.Add(san.Build());
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new("1.3.6.1.5.5.7.3.1") }, false));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(365));
        var pfx = certificate.Export(X509ContentType.Pfx, Password);
        try
        {
            var publicPath = Path.Combine(destination, "timer-public.cer");
            var previousPublic = File.Exists(publicPath) ? File.ReadAllBytes(publicPath) : null;
            AtomicWrite(publicPath, certificate.Export(X509ContentType.Cert), replace);
            try { AtomicWrite(Path.Combine(destination, "timer-cert.pfx"), pfx, replace); }
            catch
            {
                if (previousPublic != null) AtomicWrite(publicPath, previousPublic, true);
                else File.Delete(publicPath);
                throw;
            }
            return destination;
        }
        finally { CryptographicOperations.ZeroMemory(pfx); }
    }

    private static void PrepareDirectory(string directory)
    {
        if (OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        Directory.CreateDirectory(directory, DirectoryMode);
        if (new DirectoryInfo(directory).LinkTarget != null) throw new IOException(T("Certificate directory must not be a symbolic link."));
        File.SetUnixFileMode(directory, DirectoryMode);
        var probe = Path.Combine(directory, ".probe-" + Guid.NewGuid().ToString("N"));
        using (new FileStream(probe, new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write,
            UnixCreateMode = FileModePrivate })) { }
        File.Delete(probe);
    }

    private static void AtomicWrite(string path, byte[] bytes, bool replace)
    {
        if (OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        var temporary = Path.Combine(Path.GetDirectoryName(path)!, ".new-" + Guid.NewGuid().ToString("N"));
        try
        {
            using (var stream = new FileStream(temporary, new FileStreamOptions { Mode = FileMode.CreateNew,
                Access = FileAccess.Write, Share = FileShare.None, UnixCreateMode = FileModePrivate }))
            { stream.Write(bytes); stream.Flush(true); }
            if (File.Exists(path))
            {
                if (!replace) throw new IOException(T("A certificate already exists."));
                if (new FileInfo(path).LinkTarget != null) throw new IOException(T("Certificate must not be a symbolic link."));
                var backup = path + ".backup-" + Guid.NewGuid().ToString("N") + Path.GetExtension(path);
                File.Copy(path, backup, false);
                File.SetUnixFileMode(backup, FileModePrivate);
            }
            File.Move(temporary, path, replace); // Same-directory atomic rename; authoritative PFX is published last.
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
